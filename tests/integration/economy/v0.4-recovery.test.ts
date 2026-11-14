import {describe,expect,it} from "vitest";
import {begin,place,remove,turn} from "../../../src/game/commands";
import {createGame,DEFINITIONS,ITEMS,stockOnHand,type Direction,type GameState,type Kind} from "../../../src/domain/model";
import {purchaseTechnology,type TechnologyId} from "../../../src/game/technologies";
import {tick,runTicks} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
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
function until(t:Trace,mission:GameState["mission"]["activeId"],maxTicks:number){
  const start=t.state.tick;
  while(t.state.mission.activeId!==mission&&t.state.tick-start<maxTicks)t.state=tick(t.state);
  expect(t.state.mission.activeId,"Cannot reach "+mission).toBe(mission);
  observe(t,mission);
}
function oldResearch(t:Trace,id:TechnologyId){
  const r=purchaseTechnology(t.state,id);
  expect(r.ok,r.message).toBe(true);
  t.legacyResearch+=t.state.balanceCents-r.state.balanceCents;
  t.state=r.state;
}
function projectedResearch(t:Trace,label:string,feeCents:number){
  finance(t,feeCents);
  // WP2 has not implemented v4 research. This is an explicit conservative
  // PROJECTION DEBIT, not a claim that research was purchased/unlocked.
  t.state=structuredClone(t.state);
  t.state.balanceCents-=feeCents;
  t.estimatedNewResearch+=feeCents;
  t.minCash=Math.min(t.minCash,t.state.balanceCents);
  observe(t,"projected research fee: "+label);
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
function realV03Done():Trace {
  const t=start();
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
describe("WP3 real-command v0.3 DONE continuity and projected v0.4 economic recovery",()=>{
  it("reuses a no-injection v0.3 DONE layout for M8 and M9 with explicit candidate research debits",()=>{
    const t=realV03Done();
    const done=validateSave(JSON.parse(JSON.stringify(t.state)));
    expect(done.mission.activeId).toBe("DONE");
    expect(done.technologies).toEqual({
      coal_extraction:true,mechanical_components:true,advanced_smelting:true
    });
    const occupied=t.state.entities.map(e=>[e.kind,e.x,e.y] as const);
    console.info("V04-WP3-DONE-BASE "+JSON.stringify({tick:t.state.tick,cashCents:t.state.balanceCents,
      copperCandidateOccupied:occupied.some(([,x,y])=>x===8&&y===2),
      siliconCandidateOccupied:occupied.some(([,x,y])=>x===8&&y===9),occupied}));
    // M8: preserve the profitable steel line while replacing ONE abandoned
    // gear-output conveyor with copper mining. Keep upper route to terminal.
    projectedResearch(t,"resource_surveying",8000);
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
    observe(t,"M8 physical post-activation sales");
    audit(t);

    // M9: existing steel revenue keeps financing construction. Reconfigure
    // copper/silicon paths without creating a resource or teleporting inventory.
    projectedResearch(t,"circuit_fabrication",12000);
    projectedResearch(t,"industrial_power",10000);
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
    expect(t.state.sales!.steel).toBeGreaterThan(done.sales!.steel);
    observe(t,"M9 physical post-activation circuits");
    audit(t);

    // Provisional M10 is not yet a production mission (WP2). Evaluate its
    // intended post-activation rolling-window rule against real terminal events.
    // This deliberately does not change any threshold or inject stock.
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
      candidate:{circuitsPer60:11,steelPer60:5,demandCoveredTicksPer60:57,streak:60},
      warning:"WP2 mission engine not implemented; evaluation uses recorded real physical events"
    }));
    audit(t);
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
    t.state=runTicks(t.state,360);
    const trail:{circuit:number;steel:number;covered:boolean}[]=[];
    let winningStreak=0,bestExpandedStreak=0,qualifyingExpandedWindows=0,peakCircuits60=0,peakSteel60=0;
    let terminalPeak=0,peakDemand=0;
    for(let i=0;i<300;i++){
      const prior={...t.state.sales!};
      t.state=tick(t.state);
      trail.push({circuit:t.state.sales!.circuit-prior.circuit,
        steel:t.state.sales!.steel-prior.steel,
        covered:t.state.power?.demandCovered===true});
      if(trail.length>60)trail.shift();
      peakDemand=Math.max(peakDemand,t.state.power?.demand??0);
      terminalPeak=Math.max(terminalPeak,Object.values(t.state.diagnostics!.samples.at(-1)!.terminalSales)
        .reduce((a,b)=>a+b,0));
      if(trail.length<60)continue;
      const circuit=trail.reduce((sum,e)=>sum+e.circuit,0);
      const steel=trail.reduce((sum,e)=>sum+e.steel,0);
      const covered=trail.filter(e=>e.covered).length;
      peakCircuits60=Math.max(peakCircuits60,circuit);
      peakSteel60=Math.max(peakSteel60,steel);
      const qualifies=circuit>=11&&steel>=5&&covered>=57;
      winningStreak=qualifies?winningStreak+1:0;
      if(qualifies)qualifyingExpandedWindows++;
      bestExpandedStreak=Math.max(bestExpandedStreak,winningStreak);
    }
    expect(bestExpandedStreak).toBeGreaterThanOrEqual(60);
    expect(terminalPeak).toBeLessThanOrEqual(1);
    expect(peakDemand).toBeGreaterThanOrEqual(2);
    expect(t.state.balanceCents).toBeGreaterThan(0);
    observe(t,"M10 candidate physically qualified");
    audit(t);
    console.info("V04-OPTION-A-RECOVERY "+JSON.stringify({
      startedFromRealV03DoneAt:done.tick,previousM9At:m10StartTick,
      projectedResearchFeesCents:t.estimatedNewResearch,
      financedTicks,rebuiltAtTick:m10BuiltAt,fullLayoutPriceCents:targetCost,
      constructionCount:physicalM10.length,minCashCents:t.minCash,
      bestExpandedStreak,qualifyingExpandedWindows,peakCircuits60,peakSteel60,
      peakDemand,terminalPeak,finalTick:t.state.tick,cashCents:t.state.balanceCents,
      caveat:"synthetic v0.3 300Cr engine campaign, proposed research fees debited but WP2 research not implemented"
    }));
    console.info("V04-WP3-RECOVERY "+JSON.stringify({
      authenticHumanSave:false,source:"actual v0.3 300-Cr engine campaign",
      finalTick:t.state.tick,fromDoneTick:done.tick,
      cashCents:t.state.balanceCents,minCashCents:t.minCash,
      capitalCents:t.capital,refundCents:t.refund,legacyResearchCents:t.legacyResearch,
      projectedUnimplementedNewResearchFeesCents:t.estimatedNewResearch,
      m8Ticks,m9Ticks,remainingSteelRoute:true,sales:t.state.sales,notes:t.notes}));
  },45000);
});
