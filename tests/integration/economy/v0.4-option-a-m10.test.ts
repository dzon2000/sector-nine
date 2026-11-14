import {describe,expect,it} from "vitest";
import {createGame,ITEMS,stockOnHand,type GameState} from "../../../src/domain/model";
import {place,remove} from "../../../src/game/commands";
import {runTicks,tick} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
import {physicalM10} from "./v0.4-option-a-layout";
function build(){
 let s=createGame();s.mission.activeId="DONE";s.balanceCents=1000000;
 s.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true};
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
 const snapshots:{circuit:number;steel:number;covered:boolean}[]=[];
 const old={...s.sales!};
 let maxCircuits=0,maxSteel=0,minCoverage=60,maxStreak=0,streak=0,qualifying=0,terminalMax=0;
 let demandTotal=0,servedTotal=0;
 for(let i=0;i<activeTicks;i++){
   const prev=s.sales!;
   s=tick(s);
   snapshots.push({circuit:s.sales!.circuit-prev.circuit,steel:s.sales!.steel-prev.steel,covered:s.power?.demandCovered===true});
   if(snapshots.length>60)snapshots.shift();
   demandTotal+=s.power?.demand??0;servedTotal+=s.power?.served??0;
   terminalMax=Math.max(terminalMax,Object.values(s.diagnostics!.samples.at(-1)!.terminalSales).reduce((a,b)=>a+b,0));
   if(snapshots.length!==60)continue;
   const circuit=snapshots.reduce((a,e)=>a+e.circuit,0),steel=snapshots.reduce((a,e)=>a+e.steel,0);
   const covered=snapshots.filter(e=>e.covered).length;
   maxCircuits=Math.max(maxCircuits,circuit);maxSteel=Math.max(maxSteel,steel);
   minCoverage=Math.min(minCoverage,covered);
   const good=circuit>=11&&steel>=5&&covered>=57;
   if(good)qualifying++;
   streak=good?streak+1:0;maxStreak=Math.max(maxStreak,streak);
 }
 const measured={startTick:s.tick-activeTicks,endTick:s.tick,circuits:s.sales!.circuit-old.circuit,
   steel:s.sales!.steel-old.steel,maxCircuits,maxSteel,minCoverage,maxStreak,qualifying,terminalMax,
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
 it("sustains M10 physical sales and covered power demand for sixty consecutive qualifying trailing windows",()=>{
   const warm=runTicks(build(),360);
   const {s,measured}=measure(warm,300);
   expect(measured.maxStreak).toBeGreaterThanOrEqual(60);
   expect(measured.maxCircuits).toBeGreaterThanOrEqual(11);
   expect(measured.maxSteel).toBeGreaterThanOrEqual(5);
   expect(measured.terminalMax).toBeLessThanOrEqual(1);
   const saved=validateSave(JSON.parse(JSON.stringify(s)));
   expect(runTicks(saved,120)).toEqual(runTicks(s,120));
 },30000);
});
