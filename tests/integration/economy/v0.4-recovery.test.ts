import {describe,expect,it} from "vitest";
import {begin,face,place,remove,setPause,turn} from "../../../src/game/commands";
import {createGame,DEFINITIONS,ITEMS,stockOnHand,stats,type Direction,type GameState,type Kind} from "../../../src/domain/model";
import {missionWindow} from "../../../src/game/missionMetrics";
import {purchaseTechnology,type TechnologyId,type ChapterTechnologyId} from "../../../src/game/technologies";
import {acceptChapterIIIContract,beginChapterIII,chooseChapterIIIRoute} from "../../../src/game/chapterThree";
import {beginChapterII} from "../../../src/game/chapterTwo";
import {tick,runTicks} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
import {summarizeContractTicks,type ContractTick} from "../../../src/domain/contracts";
import {tickWithPriority,type PriorityOutlets} from "./v0.6-priority-prototype";
import {physicalM10} from "./v0.4-option-a-layout";

type Built=readonly [Exclude<Kind,"sell_terminal">,number,number,Direction];
type Trace={state:GameState;capital:number;refund:number;legacyResearch:number;estimatedNewResearch:number;minCash:number;notes:{stage:string;tick:number;cash:number;minimumCash:number}[]};
function start():Trace {
  return {state:begin(createGame()),capital:0,refund:0,legacyResearch:0,estimatedNewResearch:0,minCash:30000,notes:[]};
}
function observe(t:Trace,stage:string) {
  t.minCash=Math.min(t.minCash,t.state.balanceCents);
  t.notes.push({stage,tick:t.state.tick,cash:t.state.balanceCents,minimumCash:t.minCash});
}
function build(t:Trace,...objects:Built[]){
  for(const [kind,x,y,direction] of objects){
    const r=place(t.state,kind,x,y,direction);
    expect(r.ok,kind+" at "+x+","+y+": "+r.message+" cash "+t.state.balanceCents).toBe(true);
    t.capital+=DEFINITIONS[kind].price;
    t.state=r.state;
    t.minCash=Math.min(t.minCash,t.state.balanceCents);
  }
}
function demolish(t:Trace,x:number,y:number){
  const e=t.state.entities.find(e=>e.x===x&&e.y===y);
  expect(e, "Missing entity "+x+","+y).toBeDefined();
  const r=remove(t.state,e!.id,true);
  expect(r.ok).toBe(true);
  t.refund+=Math.floor(DEFINITIONS[e!.kind].price*0.75);
  t.state=r.state;
}
function rotate(t:Trace,x:number,y:number,rotations=1){
  for(let i=0;i<rotations;i++){
    const e=t.state.entities.find(e=>e.x===x&&e.y===y)!;
    const r=turn(t.state,e.id);
    expect(r.ok).toBe(true);
    t.state=r.state;
  }
}
function finance(t:Trace,cents:number,maxTicks=1800){
  let elapsed=0;
  while(t.state.balanceCents<cents&&elapsed<maxTicks){
    t.state=runTicks(t.state,60);elapsed+=60;
  }
  expect(t.state.balanceCents, "Could not finance "+cents+" with existing factory").toBeGreaterThanOrEqual(cents);
  return elapsed;
}
function verifyRestore(t:Trace){
  const before=t.state;
  const restored=validateSave(JSON.parse(JSON.stringify(before)));
  expect(restored).toEqual(before);
  expect(tick(restored)).toEqual(tick(before));
  t.state=restored;
}
function until(t:Trace,mission:GameState["mission"]["activeId"],maxTicks:number){
  const start=t.state.tick;
  // Diagnostic-only shadow calculations; never mutate production rules or economy.
  let candidateStreak=0,bestCandidateStreak=0,maxProfitCents=0,qualifyingTicks=0;
  while(t.state.mission.activeId!==mission&&t.state.tick-start<maxTicks){
    const active=t.state.mission.activeId;
    t.state=tick(t.state);
    if(t.state.mission.activeId!==active)verifyRestore(t);
    const p=stats(t.state);
    if(active==="M4"||active==="M7"){
      const window=active==="M7"?missionWindow(t.state):null;
      const profit=active==="M7"?window?.profitCents??0:p?.profitCents??0;
      maxProfitCents=Math.max(maxProfitCents,profit);
      const qualifies=active==="M4"?profit>=6000:
        Boolean(window&&window.sales.gear>=7&&window.sales.steel>=7&&profit>=19000);
      candidateStreak=qualifies?candidateStreak+1:0;
      if(qualifies)qualifyingTicks++;
      bestCandidateStreak=Math.max(bestCandidateStreak,candidateStreak);
    }
  }
  expect(t.state.mission.activeId,"Cannot reach "+mission).toBe(mission);
  if(mission==="M5"||mission==="DONE")
    console.info("V04-OWNER-THRESHOLD-PROBE "+JSON.stringify({mission:mission==="M5"?"M4":"M7",
      candidateProfitCents:mission==="M5"?6000:19000,
      startTick:start,endTick:t.state.tick,
      maxProfitCents,qualifyingTicks,bestCandidateStreak,
      requiredStreak:mission==="M5"?60:120,
      candidateWouldHavePassed:bestCandidateStreak>=(mission==="M5"?60:120),
      unchangedProductionRules:true}));
  observe(t,mission);
}
function oldResearch(t:Trace,id:TechnologyId){
  const r=purchaseTechnology(t.state,id);
  expect(r.ok,r.message).toBe(true);
  t.legacyResearch+=t.state.balanceCents-r.state.balanceCents;
  t.state=r.state;
}
function purchaseChapterResearch(t:Trace,label:ChapterTechnologyId,feeCents:number){
  finance(t,feeCents);
  const purchase=purchaseTechnology(t.state,label);
  expect(purchase.ok,purchase.message).toBe(true);
  expect(t.state.balanceCents-purchase.state.balanceCents).toBe(feeCents);
  t.state=purchase.state;
  t.estimatedNewResearch+=feeCents;
  t.minCash=Math.min(t.minCash,t.state.balanceCents);
  observe(t,"paid Chapter II research: "+label);
}
function audit(t:Trace){
  const s=t.state;
  const cash=30000-t.capital+t.refund-t.legacyResearch-t.estimatedNewResearch+
    (s.totalRevenueCents??0)-(s.totalCostCents??0);
  expect(s.balanceCents).toBe(cash);
  const stock=stockOnHand(s.entities);
  for(const item of ITEMS){
    const l=s.materialLedger![item];
    expect(l.opening+l.produced-l.consumed-l.sold-l.demolished-l.burned,item).toBe(stock[item]);
  }
  expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
}
function completeChapterI():Trace {
  const t=start();
  verifyRestore(t);
  build(t,["conveyor",0,0,"E"]);demolish(t,0,0);
  build(t,["iron_mine",3,5,"E"],...[4,5,6,7,8,9].map(x=>["conveyor",x,5,"E"] as Built));
  until(t,"M3",120);
  demolish(t,5,5);build(t,["furnace",5,5,"E"]);
  until(t,"M5",650);
  t.state=runTicks(t.state,240);
  oldResearch(t,"coal_extraction");
  build(t,["coal_mine",7,9,"N"],["conveyor",7,8,"N"],["conveyor",7,7,"N"],["conveyor",7,6,"N"]);
  until(t,"M6",150);
  oldResearch(t,"mechanical_components");
  finance(t,35000);
  build(t,["iron_mine",2,2,"E"],["conveyor",3,2,"E"],["furnace",4,2,"E"],
    ["conveyor",5,2,"E"],["assembler",6,2,"E"],["conveyor",7,2,"E"],
    ["conveyor",8,2,"E"],["conveyor",9,2,"E"],["conveyor",10,2,"S"],
    ["conveyor",10,3,"S"],["conveyor",10,4,"S"]);
  for(const x of [7,8,9])demolish(t,x,5);
  rotate(t,6,5,3);
  build(t,["conveyor",6,4,"N"],["conveyor",6,3,"N"]);
  until(t,"M7",400);
  finance(t,40000);
  oldResearch(t,"advanced_smelting");
  demolish(t,6,4);demolish(t,6,3);rotate(t,6,5);
  build(t,["advanced_furnace",7,5,"E"],["conveyor",8,5,"E"],["conveyor",9,5,"E"]);
  until(t,"DONE",400);
  expect(t.state.balanceCents).toBeGreaterThan(0);
  audit(t);
  return t;
}
// Let the test worker service runner messages between batches of deterministic ticks.
function yieldToRunner():Promise<void>{
  return new Promise(resolve=>setTimeout(resolve,0));
}

async function completeChapterII():Promise<Trace> {
    await yieldToRunner();
    const t=completeChapterI();
    await yieldToRunner();
    const done=validateSave(JSON.parse(JSON.stringify(t.state)));
    expect(done.mission.activeId).toBe("DONE");
    expect(done.technologies).toMatchObject({
      coal_extraction:true,mechanical_components:true,advanced_smelting:true
    });
    const occupied=t.state.entities.map(e=>[e.kind,e.x,e.y] as const);
    console.info("V04-WP3-DONE-BASE "+JSON.stringify({tick:t.state.tick,cashCents:t.state.balanceCents,
      copperCandidateOccupied:occupied.some(([,x,y])=>x===8&&y===2),
      siliconCandidateOccupied:occupied.some(([,x,y])=>x===8&&y===9),occupied}));
    const chapter=beginChapterII(t.state);
    expect(chapter.ok,chapter.message).toBe(true);
    t.state=chapter.state;
    expect(t.state.mission.activeId).toBe("M8");
    verifyRestore(t);
    // M8: preserve the profitable steel line while replacing ONE abandoned
    // gear-output conveyor with copper mining. Keep upper route to terminal.
    purchaseChapterResearch(t,"resource_surveying",8000);
    demolish(t,8,2);
    build(t,["copper_mine",8,2,"E"],["silicon_extractor",8,9,"E"],
      ["conveyor",9,9,"E"],["conveyor",10,9,"E"],
      ["conveyor",11,9,"N"],["conveyor",11,8,"N"],["conveyor",11,7,"N"],
      ["conveyor",11,6,"N"],["conveyor",11,5,"W"]);
    const m8Start={...t.state.sales!};
    let m8Ticks=0;
    while(((t.state.sales!.copper_ore-m8Start.copper_ore)<10||
      (t.state.sales!.silicon-m8Start.silicon)<10)&&m8Ticks<300){
      t.state=tick(t.state);m8Ticks++;
    }
    expect(t.state.sales!.copper_ore-m8Start.copper_ore).toBeGreaterThanOrEqual(10);
    expect(t.state.sales!.silicon-m8Start.silicon).toBeGreaterThanOrEqual(10);
    expect(t.state.sales!.steel).toBeGreaterThan(done.sales!.steel);
    expect(t.state.mission.activeId).toBe("M9");
    verifyRestore(t);
    observe(t,"M8 physical post-activation sales");
    audit(t);

    // M9: existing steel revenue keeps financing construction. Reconfigure
    // copper/silicon paths without creating a resource or teleporting inventory.
    purchaseChapterResearch(t,"circuit_fabrication",12000);
    purchaseChapterResearch(t,"industrial_power",10000);
    demolish(t,10,3);
    build(t,["circuit_fabricator",10,3,"S"]);
    rotate(t,8,2); // copper E -> S
    build(t,["conveyor",8,3,"E"],["conveyor",9,3,"E"]);
    rotate(t,11,5); // silicon W -> N
    build(t,["conveyor",11,4,"N"],["conveyor",11,3,"W"]);
    finance(t,DEFINITIONS.coal_mine.price+DEFINITIONS.coal_generator.price+1000);
    build(t,["coal_mine",5,9,"N"],["conveyor",5,8,"N"],
      ["conveyor",5,7,"N"],["coal_generator",5,6,"N"]);
    const m9Start={...t.state.sales!};
    let m9Ticks=0;
    while(t.state.sales!.circuit-m9Start.circuit<4&&m9Ticks<450){
      t.state=tick(t.state);m9Ticks++;
    }
    expect(t.state.sales!.circuit-m9Start.circuit).toBeGreaterThanOrEqual(4);
    expect(t.state.materialLedger!.coal.burned).toBeGreaterThan(0);
    expect(t.state.mission.activeId).toBe("M10");
    expect(t.state.sales!.steel).toBeGreaterThan(done.sales!.steel);
    observe(t,"M9 physical post-activation circuits");
    audit(t);

    await yieldToRunner();
    // Check that the initially under-capacity single-fabricator M10 layout
    // fails real rolling-window qualification before expanding the factory.
    verifyRestore(t);
    const m10StartTick=t.state.tick;
    const initialCircuitSales=t.state.sales!.circuit;
    let probeState=structuredClone(t.state);
    const recent:{circuits:number;steel:number;covered:boolean}[]=[];
    let maxCircuitWindow=0,maxSteelWindow=0,maxCoveredWindow=0;
    let bestQualifyingStreak=0,streak=0,qualifyingWindows=0;
    for(let i=0;i<240;i++){
      const before={...probeState.sales!};
      probeState=tick(probeState);
      recent.push({circuits:probeState.sales!.circuit-before.circuit,
        steel:probeState.sales!.steel-before.steel,
        covered:probeState.power?.demandCovered===true});
      if(recent.length>60)recent.shift();
      if(recent.length!==60)continue;
      const circuitCount=recent.reduce((sum,e)=>sum+e.circuits,0);
      const steelCount=recent.reduce((sum,e)=>sum+e.steel,0);
      const covered=recent.filter(e=>e.covered).length;
      maxCircuitWindow=Math.max(maxCircuitWindow,circuitCount);
      maxSteelWindow=Math.max(maxSteelWindow,steelCount);
      maxCoveredWindow=Math.max(maxCoveredWindow,covered);
      const qualifies=circuitCount>=11&&steelCount>=5&&covered>=57;
      streak=qualifies?streak+1:0;
      if(qualifies)qualifyingWindows++;
      bestQualifyingStreak=Math.max(bestQualifyingStreak,streak);
    }
    const actualM10CircuitSales=probeState.sales!.circuit-initialCircuitSales;
    expect(actualM10CircuitSales).toBeLessThan(44);
    expect(maxSteelWindow).toBeGreaterThanOrEqual(5);
    expect(bestQualifyingStreak).toBeLessThan(60);
    console.info("V04-WP3-M10-PROBE "+JSON.stringify({
      startTick:m10StartTick,endTick:probeState.tick,
      actualCircuitSales240:actualM10CircuitSales,
      maxCircuitsPer60:maxCircuitWindow,maxSteelPer60:maxSteelWindow,
      maxDemandCoveredPer60:maxCoveredWindow,
      qualifyingWindows,bestQualifyingStreak,
      approved:{circuitsPer60:11,producedCircuitsPer60:11,steelPer60:5,demandCoveredTicksPer60:57,streak:60},
      note:"Real engine M10 mission stays incomplete with under-capacity single-fabricator production"
    }));
    audit(t);
    await yieldToRunner();
    // Real economic recovery: finance and explicitly demolish the legacy/M9
    // structures, then rebuild the validated full M10 12x12 layout. No starting
    // capital injection, fake output stock, or hidden teleport of entities.
    const targetCost=physicalM10.reduce((sum,[kind])=>sum+DEFINITIONS[kind].price,0);
    const demolitionRefund=t.state.entities.filter(e=>e.kind!=="sell_terminal")
      .reduce((sum,e)=>sum+Math.floor(DEFINITIONS[e.kind].price*0.75),0);
    const financedTicks=finance(t,Math.max(0,targetCost-demolitionRefund+15000));
    const priorLayout=t.state.entities.filter(e=>e.kind!=="sell_terminal").map(e=>[e.x,e.y] as const);
    for(const [x,y] of priorLayout)demolish(t,x,y);
    expect(t.state.entities.map(e=>e.kind)).toEqual(["sell_terminal"]);
    build(t,...physicalM10);
    observe(t,"rebuilt physical M10");
    audit(t);
    const m10BuiltAt=t.state.tick;
    t.state=runTicks(t.state,60);
    const interrupted=validateSave(JSON.parse(JSON.stringify(t.state)));
    expect(interrupted.mission.activeId).toBe("M10");
    expect(interrupted.chapterII?.metrics?.salesTicks.length).toBe(60);
    expect(runTicks(interrupted,20)).toEqual(runTicks(t.state,20));
    await yieldToRunner();
    t.state=runTicks(interrupted,300);
    await yieldToRunner();
    const trail:{circuit:number;steel:number;covered:boolean;produced:number}[]=[];
    let winningStreak=0,bestExpandedStreak=0,qualifyingExpandedWindows=0,peakCircuits60=0,peakSteel60=0;
    let guardedStreak=0,maxGuardedStreak=0;
    let terminalPeak=0,peakDemand=0;
    for(let i=0;i<300;i++){
      if(i%60===0)await yieldToRunner();
      const prior={...t.state.sales!};
      const beforeProduced=t.state.materialLedger!.circuit.produced;
      t.state=tick(t.state);
      trail.push({circuit:t.state.sales!.circuit-prior.circuit,
        steel:t.state.sales!.steel-prior.steel,
        covered:t.state.power?.demandCovered===true,
        produced:t.state.materialLedger!.circuit.produced-beforeProduced});
      if(trail.length>60)trail.shift();
      peakDemand=Math.max(peakDemand,t.state.power?.demand??0);
      terminalPeak=Math.max(terminalPeak,Object.values(t.state.diagnostics!.samples.at(-1)!.terminalSales)
        .reduce((a,b)=>a+b,0));
      if(trail.length<60)continue;
      const circuit=trail.reduce((sum,e)=>sum+e.circuit,0);
      const steel=trail.reduce((sum,e)=>sum+e.steel,0);
      const covered=trail.filter(e=>e.covered).length;
      const produced=trail.reduce((sum,e)=>sum+e.produced,0);
      peakCircuits60=Math.max(peakCircuits60,circuit);
      peakSteel60=Math.max(peakSteel60,steel);
      const qualifies=circuit>=11&&steel>=5&&covered>=57;
      winningStreak=qualifies?winningStreak+1:0;
      if(qualifies)qualifyingExpandedWindows++;
      bestExpandedStreak=Math.max(bestExpandedStreak,winningStreak);
      guardedStreak=qualifies&&produced>=11?guardedStreak+1:0;
      maxGuardedStreak=Math.max(maxGuardedStreak,guardedStreak);
    }
    expect(bestExpandedStreak).toBeGreaterThanOrEqual(60);
    expect(maxGuardedStreak).toBeGreaterThanOrEqual(60);
    expect(t.state.mission.activeId).toBe("DONE");
    expect(t.state.chapterII?.completed).toBe(true);
    expect(t.state.chapterII?.foundryCompleted).toBe(true);
    expect(t.state.schemaVersion).toBe(5);
    expect(t.state.missionRuleVersion).toBe(5);
    expect(t.state.chapterII?.metrics).toBeNull();
    expect(terminalPeak).toBeLessThanOrEqual(1);
    expect(peakDemand).toBeGreaterThanOrEqual(2);
    expect(t.state.balanceCents).toBeGreaterThan(0);
    verifyRestore(t);
    expect(t.state.tick).toBe(1728);
    expect(t.state.balanceCents).toBe(503345);
    expect(t.minCash).toBe(4655);
    observe(t,"M10 physical mission completed");
    audit(t);
    console.info("V04-OPTION-A-RECOVERY "+JSON.stringify({
      startedFromRealV03DoneAt:done.tick,previousM9At:m10StartTick,
      paidResearchFeesCents:t.estimatedNewResearch,
      financedTicks,rebuiltAtTick:m10BuiltAt,fullLayoutPriceCents:targetCost,
      constructionCount:physicalM10.length,minCashCents:t.minCash,
      bestExpandedStreak,maxGuardedStreak,qualifyingExpandedWindows,peakCircuits60,peakSteel60,
      peakDemand,terminalPeak,finalTick:t.state.tick,cashCents:t.state.balanceCents,
      caveat:"synthetic engine-generated Chapter I continuation with real paid WP2 research and construction"
    }));
    console.info("V04-WP3-RECOVERY "+JSON.stringify({
      authenticHumanSave:false,source:"current 300-Cr engine campaign",
      finalTick:t.state.tick,fromDoneTick:done.tick,
      cashCents:t.state.balanceCents,minCashCents:t.minCash,
      capitalCents:t.capital,refundCents:t.refund,legacyResearchCents:t.legacyResearch,
      paidNewResearchFeesCents:t.estimatedNewResearch,
      m8Ticks,m9Ticks,remainingSteelRoute:true,sales:t.state.sales,notes:t.notes}));
    return t;
}

let paidChapterII:Promise<Trace>|undefined;

async function paidChapterIICheckpoint():Promise<Trace>{
  paidChapterII??=completeChapterII();
  return structuredClone(await paidChapterII);
}

describe("Full 300-Cr current campaign and recovery",()=>{
  it("pays all research and completes physical M8–M10 after restoring the Chapter I checkpoint",paidChapterIICheckpoint,45000);
});

type Observation={circuit:number;gear:number;steel:number;circuitMade:number;gearMade:number;steelMade:number;covered:number;coalBurned:number;profit:number};
function observeWindows(t:Trace,activeTicks=240,goal?:Goal):Observation[] {
  const window:Observation[]=[];
  const windows:Observation[]=[];
  let streak=0;
  for(let i=0;i<activeTicks;i++){
    const before=t.state;
    t.state=tick(before);
    const after=t.state;
    if(after.tick===before.tick)break;
    const sold=(item:"circuit"|"gear"|"steel")=>after.sales![item]-before.sales![item];
    const made=(item:"circuit"|"gear"|"steel")=>after.materialLedger![item].produced-before.materialLedger![item].produced;
    expect(Object.values(after.sales!).reduce((total,n)=>total+n,0)-
      Object.values(before.sales!).reduce((total,n)=>total+n,0)).toBeLessThanOrEqual(1);
    window.push({circuit:sold("circuit"),gear:sold("gear"),steel:sold("steel"),
      circuitMade:made("circuit"),gearMade:made("gear"),steelMade:made("steel"),
      covered:Number(after.power?.demandCovered===true),coalBurned:after.materialLedger!.coal.burned-before.materialLedger!.coal.burned,profit:after.lastEvent.revenueCents-after.lastEvent.costCents});
    if(window.length>60)window.shift();
    if(window.length<60)continue;
    const complete=window.reduce((acc,event)=>({
      circuit:acc.circuit+event.circuit,gear:acc.gear+event.gear,steel:acc.steel+event.steel,
      circuitMade:acc.circuitMade+event.circuitMade,gearMade:acc.gearMade+event.gearMade,
      steelMade:acc.steelMade+event.steelMade,covered:acc.covered+event.covered,coalBurned:acc.coalBurned+event.coalBurned,profit:acc.profit+event.profit
    }));
    windows.push(complete);
    if(goal){
      streak=qualifies(complete,goal)?streak+1:0;
      if(streak===29)verifyRestore(t);
      if(streak===30)break;
    }
  }
  return windows;
}
function reportRange(label:string,windows:Observation[]){
  const keys=Object.keys(windows[0]) as (keyof Observation)[];
  console.info("WP2 "+label+" "+JSON.stringify(Object.fromEntries(keys.map(key=>[
    key,[Math.min(...windows.map(w=>w[key])),Math.max(...windows.map(w=>w[key]))]
  ]))));
}

const gearLine:Built[]=[
  ["iron_mine",2,9,"W"],["furnace",1,9,"N"],["assembler",1,8,"N"],
  ["conveyor",1,7,"N"],["conveyor",1,6,"N"],["conveyor",1,5,"N"]
];
type Goal={circuit:number;gear?:number;steel?:number;covered?:number;coalCap?:number;profit?:number};
const recoverArchive:Goal={circuit:12,gear:6};
const independent:Goal={circuit:9,covered:60,coalCap:5};
const corporate:Goal={circuit:12,steel:10};
const reconstructArchive:Goal={circuit:13,gear:6,steel:10,profit:60000};
function qualifies(w:Observation,goal:Goal){
  return Math.min(w.circuit,w.circuitMade)>=goal.circuit&&
    Math.min(w.gear,w.gearMade)>=(goal.gear??0)&&
    Math.min(w.steel,w.steelMade)>=(goal.steel??0)&&
    w.covered>=(goal.covered??0)&&w.coalBurned<=(goal.coalCap??Infinity)&&
    w.profit>=(goal.profit??0);
}
function bestStreak(windows:Observation[],goal:Goal){
  let best=0,consecutive=0;
  for(const window of windows){
    consecutive=qualifies(window,goal)?consecutive+1:0;
    best=Math.max(best,consecutive);
  }
  return best;
}
function evaluate(t:Trace,label:string,goal:Goal){
  const start=t.state.tick;
  const windows=observeWindows(t,240,goal);
  expect(windows.length,label).toBeGreaterThan(0);
  reportRange(label,windows);
  const streak=bestStreak(windows,goal);
  console.info("WP2 STREAK "+JSON.stringify({label,streak,activationTick:start,completionTick:t.state.tick,activeTicks:t.state.tick-start,balance:t.state.balanceCents,
    capital:t.capital,refund:t.refund,minimumCash:t.minCash}));
  expect(streak,label).toBe(30);
  audit(t);
}
function mistake(t:Trace,repair:()=>void){
  const before=t.state.totalRevenueCents!;
  t.state=runTicks(t.state,60);
  expect(t.state.totalRevenueCents!).toBeGreaterThan(before);
  console.info("WP2 RECOVERY "+JSON.stringify({ticks:60,revenue:t.state.totalRevenueCents!-before,cash:t.state.balanceCents}));
  repair();
}
function expandSteel(t:Trace,wrongFacing=false){
  demolish(t,4,6);
  build(t,["splitter",4,6,"W"],["conveyor",3,6,"W"],
    ["iron_mine",3,5,"W"],["furnace",2,5,"S"],["advanced_furnace",2,6,wrongFacing?"S":"W"]);
}
function restoreDualCircuits(t:Trace){
  demolish(t,7,2);
  demolish(t,8,8);
  build(t,["splitter",7,2,"W"],["splitter",8,8,"N"],["coal_generator",7,8,"N"]);
}

it("WP2 evaluates two paid routes from one 300 Cr campaign without changing runtime objectives",async()=>{
  const t=await paidChapterIICheckpoint();
  const baseline=observeWindows(structuredClone(t));
  reportRange("unchanged M10",baseline);
  for(const goal of [recoverArchive,independent,corporate,reconstructArchive])
    expect(bestStreak(baseline,goal)).toBe(0);
  expect(observeWindows(structuredClone(t),59)).toEqual([]);
  const paused=structuredClone(t);
  paused.state.paused=true;
  expect(observeWindows(paused)).toEqual([]);
  expect(paused.state.tick).toBe(t.state.tick);
  await yieldToRunner();
  build(t,...gearLine);
  evaluate(t,"M11 gear branch",recoverArchive);

  await yieldToRunner();
  const underpowered=structuredClone(t);
  demolish(underpowered,7,8);
  const deficient=observeWindows(underpowered,120);
  expect(deficient.some(w=>w.covered<60)).toBe(true);
  expect(bestStreak(deficient,independent)).toBe(0);

  const noDemand=structuredClone(t);
  demolish(noDemand,9,3);
  demolish(noDemand,9,8);
  const noDemandWindows=observeWindows(noDemand,120);
  expect(noDemandWindows.every(w=>w.covered===0&&w.circuitMade===0)).toBe(true);
  expect(bestStreak(noDemandWindows,independent)).toBe(0);

  await yieldToRunner();
  const independ=structuredClone(t);
  demolish(independ,7,2);
  demolish(independ,8,8);
  demolish(independ,7,8);
  build(independ,["conveyor",7,2,"N"],["conveyor",8,8,"W"]);
  mistake(independ,()=>rotate(independ,8,8));
  evaluate(independ,"M12 independent",independent);
  expect(bestStreak(observeWindows(structuredClone(independ)),corporate)).toBe(0);

  await yieldToRunner();
  const corp=structuredClone(t);
  expect(bestStreak(observeWindows(structuredClone(corp)),corporate)).toBe(0);
  expandSteel(corp,true);
  mistake(corp,()=>rotate(corp,2,6));
  evaluate(corp,"M12 corporate",corporate);
  expect(bestStreak(observeWindows(structuredClone(corp)),independent)).toBe(0);

  await yieldToRunner();
  const gearInterlock:Goal={circuit:13,gear:12,steel:7,profit:60000};
  const independentInterlock=structuredClone(independ);
  const corporateInterlock=structuredClone(corp);
  for(const checkpoint of [independentInterlock,corporateInterlock]){
    expect(bestStreak(observeWindows(structuredClone(checkpoint)),gearInterlock)).toBe(0);
  }

  await yieldToRunner();
  restoreDualCircuits(independentInterlock);
  build(independentInterlock,["iron_mine",3,5,"W"],["furnace",2,5,"S"],["assembler",2,6,"W"]);
  evaluate(independentInterlock,"M13 interlock from independent",gearInterlock);

  await yieldToRunner();
  demolish(corporateInterlock,2,6);
  build(corporateInterlock,["assembler",2,6,"W"]);
  evaluate(corporateInterlock,"M13 interlock from corporate",gearInterlock);

  await yieldToRunner();
  restoreDualCircuits(independ);
  expandSteel(independ);
  evaluate(independ,"M13 from independent",reconstructArchive);
  await yieldToRunner();
  evaluate(corp,"M13 from corporate",reconstructArchive);
  const steady=observeWindows(structuredClone(corp));
  reportRange("M13 prepared steady state",steady);
  console.info("WP2 PROFIT SENSITIVITY "+JSON.stringify([60000,63000,64000,66000].map(profit=>
    [profit,bestStreak(steady,{...reconstructArchive,profit})])));
},45000);

async function completePaidChapterIII(){
  const archive=await paidChapterIICheckpoint();

  function apply(t:Trace,result:{ok:boolean;message:string;state:GameState}){
    expect(result.ok,result.message).toBe(true);
    t.state=result.state;
  }

  async function complete(t:Trace,id:"M11"|"M12"|"M13",expectedTicks:number){
    await yieldToRunner();
    const activatedAt=t.state.tick;
    apply(t,acceptChapterIIIContract(t.state,id));
    for(let elapsed=1;elapsed<expectedTicks;elapsed++){
      t.state=tick(t.state);
      expect(t.state.chapterIII?.active?.id).toBe(id);
    }
    expect(t.state.chapterIII?.active?.streakTicks).toBe(29);
    verifyRestore(t);
    t.state=tick(t.state);
    expect(t.state.tick-activatedAt).toBe(expectedTicks);
    expect(t.state.chapterIII?.completed.at(-1)).toBe(id);
    expect(t.state.chapterIII?.active).toBeNull();
    expect(acceptChapterIIIContract(t.state,id).ok).toBe(false);
    verifyRestore(t);
    audit(t);
  }

  apply(archive,beginChapterIII(archive.state));
  build(archive,...gearLine);
  await complete(archive,"M11",109);

  const independentRoute=structuredClone(archive);
  apply(independentRoute,chooseChapterIIIRoute(independentRoute.state,"independent",true));
  demolish(independentRoute,7,2);
  demolish(independentRoute,8,8);
  demolish(independentRoute,7,8);
  build(independentRoute,["conveyor",7,2,"N"],["conveyor",8,8,"W"]);
  mistake(independentRoute,()=>rotate(independentRoute,8,8));
  await complete(independentRoute,"M12",95);

  const corporateRoute=structuredClone(archive);
  apply(corporateRoute,chooseChapterIIIRoute(corporateRoute.state,"corporate",true));
  expandSteel(corporateRoute,true);
  mistake(corporateRoute,()=>rotate(corporateRoute,2,6));
  await complete(corporateRoute,"M12",89);

  restoreDualCircuits(independentRoute);
  build(independentRoute,["iron_mine",3,5,"W"],["furnace",2,5,"S"],["assembler",2,6,"W"]);
  await complete(independentRoute,"M13",107);

  demolish(corporateRoute,2,6);
  build(corporateRoute,["assembler",2,6,"W"]);
  await complete(corporateRoute,"M13",91);

  return {independent:independentRoute,corporate:corporateRoute};
}

let paidChapterIII:ReturnType<typeof completePaidChapterIII>|undefined;

async function paidChapterIIICheckpoints(){
  paidChapterIII??=completePaidChapterIII();
  return structuredClone(await paidChapterIII);
}

it("WP3 completes both approved Chapter III routes using paid factory commands",async()=>{
  for(const route of Object.values(await paidChapterIIICheckpoints())){
    await yieldToRunner();
    const completion=structuredClone(route.state.chapterIII);
    const revenue=route.state.totalRevenueCents!;
    route.state=runTicks(route.state,60);
    expect(route.state.chapterIII).toEqual(completion);
    expect(route.state.chapterIII?.completed).toEqual(["M11","M12","M13"]);
    expect(route.state.totalRevenueCents!).toBeGreaterThan(revenue);
    audit(route);
  }
},45000);

it("WP2 rejects stockpiles that meet sales quotas without current production",()=>{
  const qualifying={circuit:12,gear:6,steel:10,circuitMade:12,gearMade:6,steelMade:10,
    covered:60,coalBurned:5,profit:64000};
  expect(qualifies(qualifying,recoverArchive)).toBe(true);
  expect(qualifies({...qualifying,circuitMade:0},recoverArchive)).toBe(false);
  expect(qualifies({...qualifying,gearMade:0},recoverArchive)).toBe(false);
  expect(qualifies({...qualifying,steelMade:0},corporate)).toBe(false);
  expect(qualifies({...qualifying,circuit:0},independent)).toBe(false);
  expect(qualifies({...qualifying,covered:0},independent)).toBe(false);

  // Adversarial opening stock only. Every item after activation moves via the real terminal.
  const t=start();
  const route:Built[]=[
    ...[8,9,10].map(y=>["conveyor",0,y,"S"] as const),
    ...Array.from({length:10},(_,x)=>["conveyor",x,11,"E"] as const),
    ...[11,10,9,8,7,6].map(y=>["conveyor",10,y,"N"] as const)
  ];
  build(t,...route);
  t.state.entities.filter(e=>e.kind==="conveyor").slice(0,18).forEach((belt,i)=>{
    const item=i<12?"circuit":"gear";
    belt.belt=item;
    t.state.materialLedger![item].opening++;
  });
  const windows=observeWindows(t,120);
  expect(windows.some(w=>w.circuit>=12&&w.gear>=6)).toBe(true);
  expect(windows.every(w=>w.circuitMade===0&&w.gearMade===0)).toBe(true);
  expect(bestStreak(windows,recoverArchive)).toBe(0);
  audit(t);
});

const probeWindowTicks=30;
const probeCircuitFloor=6;
const probeGearFloor=5;
const probeCircuitGapLimit=5;

type ProbeSample=ContractTick&{copperOreSold:number};

function probeSample(before:GameState, after:GameState):ProbeSample {
  expect(after.tick).toBe(before.tick+1);
  expect(ITEMS.reduce((sum,item)=>sum+after.sales![item]-before.sales![item],0)).toBeLessThanOrEqual(1);
  return {
    tick:after.tick,
    sold:{
      circuit:after.sales!.circuit-before.sales!.circuit,
      gear:after.sales!.gear-before.sales!.gear,
      steel:after.sales!.steel-before.sales!.steel,
    },
    produced:{
      circuit:after.materialLedger!.circuit.produced-before.materialLedger!.circuit.produced,
      gear:after.materialLedger!.gear.produced-before.materialLedger!.gear.produced,
      steel:after.materialLedger!.steel.produced-before.materialLedger!.steel.produced,
    },
    copperOreSold:after.sales!.copper_ore-before.sales!.copper_ore,
    demandCovered:after.power?.demandCovered===true,
    coalBurned:after.materialLedger!.coal.burned-before.materialLedger!.coal.burned,
    profitCents:after.lastEvent.revenueCents-after.lastEvent.costCents,
  };
}

function probeSummarize(events:ProbeSample[]){
  const counts=summarizeContractTicks(events);
  const circuitSales=events.filter(event=>event.sold.circuit>0).map(event=>event.tick);
  const start=events[0].tick;
  const end=events.at(-1)!.tick;
  let circuitGap=0;
  let previous=start-1;
  for(const tick of [...circuitSales,end+1]){
    circuitGap=Math.max(circuitGap,tick-previous-1);
    previous=tick;
  }
  const copperOreSold=events.reduce((sum,event)=>sum+event.copperOreSold,0);
  const m14=Math.min(counts.sold.circuit,counts.produced.circuit)>=probeCircuitFloor&&circuitGap<=probeCircuitGapLimit;
  const m15=m14&&Math.min(counts.sold.gear,counts.produced.gear)>=probeGearFloor;
  return {start,end,circuitSales,circuitGap,copperOreSold,...counts,m14,m15};
}

async function probeObserve(trace:Trace, label:string, options:{
  priorities?:PriorityOutlets; rate?:1|2; blocks?:number
}={}){
  const {priorities=new Map(),rate=1,blocks=4}=options;
  const activationTick=trace.state.tick;
  const intervalMs=1000/rate;
  const durationMs=probeWindowTicks*intervalMs*blocks;
  const events:ProbeSample[]=[];
  const windows:ReturnType<typeof probeSummarize>[]=[];
  // Drive one real tick per modeled active interval. Scheduler behavior is tested in WP1.
  for(let elapsedMs=intervalMs;elapsedMs<=durationMs;elapsedMs+=intervalMs){
    const before=trace.state;
    trace.state=tickWithPriority(before,priorities);
    events.push(probeSample(before,trace.state));
    if(events.length>=probeWindowTicks)windows.push(probeSummarize(events.slice(-probeWindowTicks)));
    if(events.length%probeWindowTicks===0)await yieldToRunner();
  }
  const elapsedTicks=trace.state.tick-activationTick;
  const firstM14=windows.find(window=>window.m14)??null;
  const firstM15=windows.find(window=>window.m15)??null;
  const counts={m14:windows.filter(window=>window.m14).length,m15:windows.filter(window=>window.m15).length};
  const fixedWindows=windows.filter(window=>(window.end-activationTick)%probeWindowTicks===0);
  console.info("V06-WP2 WINDOW "+JSON.stringify({route:trace.state.chapterIII?.route,label,activationTick,rate,
    elapsedTicks,modeledActiveMs:durationMs,rollingWindowCount:windows.length,counts,firstM14,firstM15,fixedWindows}));
  audit(trace);
  return {windows,fixedWindows,counts,firstM14,firstM15};
}

function entityAt(state:GameState,x:number,y:number){
  const entity=state.entities.find(entity=>entity.x===x&&entity.y===y);
  expect(entity,"Expected entity at "+x+","+y).toBeDefined();
  return entity!;
}

function reface(trace:Trace,x:number,y:number,direction:Direction){
  const result=face(trace.state,entityAt(trace.state,x,y).id,direction);
  expect(result.ok,result.message).toBe(true);
  trace.state=result.state;
}

function layoutOutside(state:GameState,x:number,y:number){
  return state.entities.filter(entity=>entity.x!==x||entity.y!==y)
    .map(({id,kind,x,y,direction})=>({id,kind,x,y,direction}));
}

it("V06 WP2 observes candidate continuity and gear recovery from both paid M13 routes",async()=>{
  for(const [route,checkpoint] of Object.entries(await paidChapterIIICheckpoints())){
    expect(checkpoint.state.chapterIII).toEqual({route,completed:["M11","M12","M13"],active:null});
    const prepared=structuredClone(checkpoint);
    const preparedM14=await probeObserve(prepared,"prepared M14 observation",{blocks:1});
    expect(preparedM14.firstM14?.end).toBe(checkpoint.state.tick+probeWindowTicks);
    const preparedM15=await probeObserve(prepared,"prepared M15 observation after M14",{blocks:1});
    expect(preparedM15.firstM15?.end).toBe(checkpoint.state.tick+2*probeWindowTicks);

    const routed=structuredClone(checkpoint);
    demolish(routed,7,1);
    build(routed,["splitter",7,1,"N"]);
    expect(layoutOutside(routed.state,7,1)).toEqual(layoutOutside(checkpoint.state,7,1));
    const splitter=entityAt(routed.state,7,1);
    console.info("V06-WP2 EDIT "+JSON.stringify({route,checkpointTick:checkpoint.state.tick,
      checkpointCashCents:checkpoint.state.balanceCents,minimumCampaignCashCents:checkpoint.minCash,
      checkpointCapitalCents:checkpoint.capital,checkpointResaleCents:checkpoint.refund,
      placements:1,demolitions:1,tile:[7,1],spendCents:routed.capital-checkpoint.capital,
      resaleCents:routed.refund-checkpoint.refund,capitalCentsNet:checkpoint.state.balanceCents-routed.state.balanceCents,
      recovery:"Set clockwise priority on the same splitter, no construction or resale."}));
    const badOutlets:PriorityOutlets=new Map([[splitter.id,0]]);
    const goodOutlets:PriorityOutlets=new Map([[splitter.id,1]]);
    const doubled=structuredClone(routed);
    const failure=await probeObserve(routed,"prioritize raw copper sale",{priorities:badOutlets});
    const doubleFailure=await probeObserve(doubled,"same raw copper priority at 2×",{priorities:badOutlets,rate:2});
    expect(doubleFailure).toEqual(failure);
    expect(doubled.state).toEqual(routed.state);
    expect(failure.counts).toEqual({m14:0,m15:0});
    expect(failure.fixedWindows.every(window=>window.circuitGap>probeCircuitGapLimit&&window.copperOreSold>0)).toBe(true);
    const recovery=await probeObserve(routed,"prioritize copper to circuit fabricator",{priorities:goodOutlets});
    expect(recovery.fixedWindows.slice(1).every(window=>window.m14&&window.m15&&window.copperOreSold===0)).toBe(true);
    expect(recovery.counts.m14).toBeGreaterThan(failure.counts.m14);
    expect(layoutOutside(routed.state,7,1)).toEqual(layoutOutside(checkpoint.state,7,1));

    const gear=structuredClone(checkpoint);
    reface(gear,1,7,"E");
    expect(layoutOutside(gear.state,1,7)).toEqual(layoutOutside(checkpoint.state,1,7));
    expect(gear.state.balanceCents).toBe(checkpoint.state.balanceCents);
    console.info("V06-WP2 EDIT "+JSON.stringify({route,tile:[1,7],placements:0,demolitions:0,spendCents:0,
      resaleCents:0,setup:"Face east into vacant (2,7).",recovery:"Face north into the original gear branch."}));
    const gearFailure=await probeObserve(gear,"first gear branch faces an empty tile",{rate:2});
    expect(gearFailure.windows.filter(window=>window.start>checkpoint.state.tick+probeWindowTicks)
      .every(window=>window.m14&&!window.m15)).toBe(true);
    reface(gear,1,7,"N");
    expect(layoutOutside(gear.state,-1,-1)).toEqual(layoutOutside(checkpoint.state,-1,-1));
    const gearRecovery=await probeObserve(gear,"first gear branch restored, no spend");
    expect(gearRecovery.fixedWindows.slice(1).every(window=>window.m15)).toBe(true);
  }
},100000);


// Keep the test-only Node types local to the exporter.
declare const process:{
  env:Record<string,string|undefined>;
  getBuiltinModule(name:"node:fs/promises"):{
    writeFile(path:string,data:string,options:{flag:"wx"}):Promise<void>;
  };
  getBuiltinModule(name:"node:path"):{join(...paths:string[]):string};
};
const checkpointExportDirectory=process.env.SEKTOR9_POST_M13_EXPORT_DIR;

it.runIf(Boolean(checkpointExportDirectory))("exports validated post-M13 checkpoints",async()=>{
  const {writeFile}=process.getBuiltinModule("node:fs/promises");
  const {join}=process.getBuiltinModule("node:path");
  for(const [route,trace] of Object.entries(await paidChapterIIICheckpoints())){
    const checkpoint=setPause(trace.state,true);
    const json=JSON.stringify(checkpoint);
    expect(validateSave(JSON.parse(json))).toEqual(checkpoint);
    expect(checkpoint.chapterIII).toEqual({route,completed:["M11","M12","M13"],active:null});
    await writeFile(join(checkpointExportDirectory!,route+".json"),json,{flag:"wx"});
  }
},45000);
