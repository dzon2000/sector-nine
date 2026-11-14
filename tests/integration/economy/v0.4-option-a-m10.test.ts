import {describe,expect,it} from "vitest";
import {createGame,ITEMS,stockOnHand,type GameState} from "../../../src/domain/model";
import {place,remove,turn} from "../../../src/game/commands";
import {runTicks,tick} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
import {physicalM10} from "./v0.4-option-a-layout";
function build(){
 let s=createGame();s.mission.activeId="DONE";s.balanceCents=1000000;
 s.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true,resource_surveying:true,circuit_fabrication:true,industrial_power:true};
 for(const [kind,x,y,d] of physicalM10){
   const r=place(s,kind,x,y,d);
   expect(r.ok,kind+" ("+x+","+y+"): "+r.message).toBe(true);
   s=r.state;
 }
 s.paused=false;
 return s;
}
function checkStock(s:GameState){
 const stock=stockOnHand(s.entities);
 for(const item of ITEMS){
   const a=s.materialLedger![item];
   expect(a.opening+a.produced-a.consumed-a.sold-a.demolished-a.burned,item).toBe(stock[item]);
 }
}
function measure(s:GameState,activeTicks:number){
 const snapshots:{circuit:number;steel:number;covered:boolean;produced:number}[]=[];
 const old={...s.sales!};
 let maxCircuits=0,maxSteel=0,minCoverage=60,maxStreak=0,streak=0,qualifying=0,terminalMax=0;
 let guardedStreak=0,maxGuardedStreak=0;
 let demandTotal=0,servedTotal=0;
 for(let i=0;i<activeTicks;i++){
   const prev=s.sales!;
   const prevProduced=s.materialLedger!.circuit.produced;
   s=tick(s);
   snapshots.push({circuit:s.sales!.circuit-prev.circuit,steel:s.sales!.steel-prev.steel,
     covered:s.power?.demandCovered===true,produced:s.materialLedger!.circuit.produced-prevProduced});
   if(snapshots.length>60)snapshots.shift();
   demandTotal+=s.power?.demand??0;servedTotal+=s.power?.served??0;
   terminalMax=Math.max(terminalMax,Object.values(s.diagnostics!.samples.at(-1)!.terminalSales).reduce((a,b)=>a+b,0));
   if(snapshots.length!==60)continue;
   const circuit=snapshots.reduce((a,e)=>a+e.circuit,0),steel=snapshots.reduce((a,e)=>a+e.steel,0);
   const covered=snapshots.filter(e=>e.covered).length;
   const produced=snapshots.reduce((a,e)=>a+e.produced,0);
   maxCircuits=Math.max(maxCircuits,circuit);maxSteel=Math.max(maxSteel,steel);
   minCoverage=Math.min(minCoverage,covered);
   const good=circuit>=11&&steel>=5&&covered>=57;
   if(good)qualifying++;
   streak=good?streak+1:0;maxStreak=Math.max(maxStreak,streak);
   guardedStreak=good&&produced>=11?guardedStreak+1:0;
   maxGuardedStreak=Math.max(maxGuardedStreak,guardedStreak);
 }
 const measured={startTick:s.tick-activeTicks,endTick:s.tick,circuits:s.sales!.circuit-old.circuit,
   steel:s.sales!.steel-old.steel,maxCircuits,maxSteel,minCoverage,maxStreak,maxGuardedStreak,qualifying,terminalMax,
   demandTotal,servedTotal,coalBurned:s.materialLedger!.coal.burned};
 console.info("V04-OPTION-A-M10 "+JSON.stringify(measured));
 checkStock(s);
 return {s,measured};
}
describe("WP3 experimental Option A M10 full physical 12x12",()=>{
 it("constructs two copper/silicon-split fabricators, two physically fueled generators and steel with no tile collision",()=>{
   const s=build();
   expect(s.entities.filter(e=>e.kind==="splitter")).toHaveLength(3);
   expect(s.entities.filter(e=>e.kind==="circuit_fabricator")).toHaveLength(2);
   expect(s.entities.filter(e=>e.kind==="coal_generator")).toHaveLength(2);
   expect(s.entities.filter(e=>e.kind==="sell_terminal")).toHaveLength(1);
   checkStock(s);
   expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
 });
 it("qualifies from cold empty inventories after full post-activation windows, without warm-up credit",()=>{
   let s=build();
   const activation=s.tick;
   const window:{circuit:number;steel:number;covered:boolean}[]=[];
   let streak=0,completedAt:number|null=null;
   for(let i=0;i<420;i++){
     const before={...s.sales!};
     s=tick(s);
     window.push({circuit:s.sales!.circuit-before.circuit,
       steel:s.sales!.steel-before.steel,covered:s.power?.demandCovered===true});
     if(window.length>60)window.shift();
     if(window.length<60){expect(streak).toBe(0);continue;}
     const circuits=window.reduce((sum,e)=>sum+e.circuit,0);
     const steel=window.reduce((sum,e)=>sum+e.steel,0);
     const covered=window.filter(e=>e.covered).length;
     const qualifies=circuits>=11&&steel>=5&&covered>=57;
     streak=qualifies?streak+1:0;
     if(streak===60){completedAt=s.tick;break;}
   }
   expect(completedAt).not.toBeNull();
   expect(completedAt!).toBeGreaterThanOrEqual(activation+119);
   console.info("V04-OPTION-A-M10-COLD "+JSON.stringify({activationTick:activation,completedAtTick:completedAt,
     elapsedActiveTicks:completedAt!-activation,streak,stockpiledInputs:false}));
   checkStock(s);
 },30000);
 it("sustains M10 physical sales and covered power demand for sixty consecutive qualifying trailing windows",()=>{
   const warm=runTicks(build(),360);
   const {s,measured}=measure(warm,300);
   expect(measured.maxStreak).toBeGreaterThanOrEqual(60);
   expect(measured.maxGuardedStreak).toBeGreaterThanOrEqual(60);
   expect(measured.maxCircuits).toBeGreaterThanOrEqual(11);
   expect(measured.maxSteel).toBeGreaterThanOrEqual(5);
   expect(measured.terminalMax).toBeLessThanOrEqual(1);
   const saved=validateSave(JSON.parse(JSON.stringify(s)));
   expect(runTicks(saved,120)).toEqual(runTicks(s,120));
 },30000);
});

describe("WP3 Option A M10 failing physical controls",()=>{
  it.each([
    ["single fabricator","circuit_fabricator",9,8],
    ["single generator","coal_generator",7,8],
    ["steel line absent","advanced_furnace",3,4],
    ["first coal supply absent","coal_mine",7,9]
  ] as const)("%s does not qualify for the 60-window M10 streak",(_label,kind,x,y)=>{
    let s=build();
    const target=s.entities.find(e=>e.kind===kind&&e.x===x&&e.y===y)!;
    const removed=remove(s,target.id,true);
    expect(removed.ok).toBe(true);
    s=runTicks(removed.state,360);
    const {measured}=measure(s,180);
    expect(measured.maxStreak).toBeLessThan(60);
  },30000);
  it("without circuit power demand, stockpiled terminal circuits cannot fake M10 stability",()=>{
    let s=build();
    for(const e of [...s.entities].filter(e=>e.kind==="circuit_fabricator"||
      e.kind==="copper_mine"||e.kind==="silicon_extractor")){
      const removed=remove(s,e.id,true);
      expect(removed.ok).toBe(true);
      s=removed.state;
    }
    // Add old opening-stock circuits in outgoing belts only. These are not
    // produced in the current mission; every unit is tracked as opening stock.
    for(const e of s.entities.filter(e=>e.kind==="conveyor"&&
      ((e.x===9&&e.y>=4&&e.y<=7)||(e.x===11&&e.y>=0&&e.y<=5)))){
      e.belt="circuit";
      s.materialLedger!.circuit.opening++;
    }
    const {measured}=measure(s,180);
    expect(measured.maxStreak).toBe(0);
    expect(measured.maxCircuits).toBeGreaterThan(0);
  },30000);
});

describe("WP3 Option A staged-inventory + real-demand adversary",()=>{
 it("measures whether one delayed pre-activation circuit augments one working fabricator into a fake sustained streak",()=>{
   let s=build();
   for(const [kind,x,y] of [["circuit_fabricator",9,8],["conveyor",6,2]] as const){
     const target=s.entities.find(e=>e.kind===kind&&e.x===x&&e.y===y)!;
     const result=remove(s,target.id,true);
     expect(result.ok).toBe(true);
     s=result.state;
   }
   for(const [x,y] of [[9,8],[9,9]] as const){
     const added=place(s,"conveyor",x,y,"N");
     expect(added.ok,added.message).toBe(true);
     s=added.state;
   }
   const buffered=s.entities.find(e=>e.kind==="conveyor"&&e.x===9&&e.y===6)!;
   const reoriented=turn(s,buffered.id); // N to E: disconnect retained old circuit stock
   expect(reoriented.ok).toBe(true);
   s=reoriented.state;
   const b=s.entities.find(e=>e.id===buffered.id)!;
   expect(b.direction).toBe("E");
   for(const y of [6,7,8,9]){
     const cargo=s.entities.find(e=>e.kind==="conveyor"&&e.x===9&&e.y===y)!;
     cargo.belt="circuit";
     s.materialLedger!.circuit.opening++;
   }
   s=runTicks(s,360); // pre-activation old inventory cannot leave disconnected belt
   expect(s.entities.find(e=>e.id===buffered.id)!.belt).toBe("circuit");
   const oldStock=s.materialLedger!.circuit.opening;
   const window:{circuit:number;steel:number;covered:boolean;produced:number}[]=[];
   let streak=0,maxStreak=0,guardedStreak=0,maxGuardedStreak=0,extraReleased=false;
   let maxCircuitWindow=0,maxCovered=0,saleTick:number|null=null;
   const startingTick=s.tick;
   for(let i=1;i<=240;i++){
     if(i===60){
       for(let n=0;n<3;n++){
         const rotated=turn(s,buffered.id);
         expect(rotated.ok).toBe(true);
         s=rotated.state;
       }
       expect(s.entities.find(e=>e.id===buffered.id)!.direction).toBe("N");
       extraReleased=true;
     }
     const before={...s.sales!};
     const previousProduced=s.materialLedger!.circuit.produced;
     s=tick(s);
     if(extraReleased&&saleTick===null&&s.entities.find(e=>e.id===buffered.id)!.belt===null)
       saleTick=s.tick; // first departure, final sale follows via shared terminal
     window.push({circuit:s.sales!.circuit-before.circuit,steel:s.sales!.steel-before.steel,
       covered:s.power?.demandCovered===true,
       produced:s.materialLedger!.circuit.produced-previousProduced});
     if(window.length>60)window.shift();
     if(window.length<60)continue;
     const circuit=window.reduce((a,e)=>a+e.circuit,0);
     const steel=window.reduce((a,e)=>a+e.steel,0);
     const covered=window.filter(e=>e.covered).length;
     const produced=window.reduce((a,e)=>a+e.produced,0);
     maxCircuitWindow=Math.max(maxCircuitWindow,circuit);
     maxCovered=Math.max(maxCovered,covered);
     const qualifies=circuit>=11&&steel>=5&&covered>=57;
     streak=qualifies?streak+1:0;maxStreak=Math.max(maxStreak,streak);
     guardedStreak=qualifies&&produced>=11?guardedStreak+1:0;
     maxGuardedStreak=Math.max(maxGuardedStreak,guardedStreak);
   }
   expect(oldStock).toBe(4);
   expect(extraReleased).toBe(true);
   checkStock(s);
   expect(maxStreak).toBeGreaterThanOrEqual(60); // demonstrate original sales-only rule bypass
   expect(maxGuardedStreak).toBeLessThan(60); // test proposed recent-production safeguard
   console.info("V04-OPTION-A-STOCKPILE-ADVERSARY "+JSON.stringify({startingTick,
     stagedPreActivationCircuits:oldStock,releaseAtRelativeTick:60,firstBufferDepartureTick:saleTick,
     maxCircuitWindow,maxCovered,maxStreak,maxGuardedStreak,missionStreakRequirement:60,
     verdict:maxStreak>=60?"BYPASS POSSIBLE — needs WP2 mission-only recent-production guard":"NO BYPASS in this fixture"}));
 },30000);
});
