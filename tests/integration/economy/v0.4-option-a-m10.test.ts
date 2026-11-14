import {describe,expect,it} from "vitest";
import {createGame,ITEMS,stockOnHand,type Direction,type GameState,type Kind} from "../../../src/domain/model";
import {place,remove} from "../../../src/game/commands";
import {runTicks,tick} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
type Built=readonly [Exclude<Kind,"sell_terminal">,number,number,Direction];
const belt=(x:number,y:number,d:Direction):Built=>["conveyor",x,y,d];
const physicalM10:Built[]=[
  ["copper_mine",8,2,"W"],["splitter",7,2,"W"],
  belt(7,1,"E"),belt(8,1,"E"),belt(9,1,"S"),belt(9,2,"S"),
  ...Array.from({length:9},(_,i)=>belt(6,2+i,i===8?"E":"S")),
  ...[7,8,9,10].map(x=>belt(x,10,"E")),
  belt(11,10,"N"),belt(11,9,"N"),belt(11,8,"W"),belt(10,8,"W"),
  ["silicon_extractor",8,9,"N"],["splitter",8,8,"N"],
  belt(8,7,"N"),belt(8,6,"N"),belt(8,5,"N"),belt(8,4,"N"),belt(8,3,"E"),
  ["circuit_fabricator",9,3,"S"],belt(9,4,"S"),
  ["circuit_fabricator",9,8,"N"],belt(9,7,"N"),belt(9,6,"N"),belt(9,5,"E"),
  ["coal_mine",7,9,"N"],["coal_generator",7,8,"N"],
  ["coal_mine",5,9,"W"],["splitter",4,9,"W"],
  belt(3,9,"N"),belt(3,8,"N"),["coal_generator",3,7,"N"],
  belt(4,8,"N"),belt(4,7,"N"),belt(4,6,"N"),belt(4,5,"N"),belt(4,4,"W"),
  ["iron_mine",2,2,"E"],["furnace",3,2,"S"],belt(3,3,"S"),["advanced_furnace",3,4,"W"],
  belt(2,4,"W"),belt(1,4,"N"),belt(1,3,"N"),belt(1,2,"N"),belt(1,1,"N"),belt(1,0,"E"),
  ...Array.from({length:9},(_,i)=>belt(i+2,0,"E")),
  belt(11,0,"S"),...Array.from({length:4},(_,i)=>belt(11,i+1,"S")),belt(11,5,"W")
];
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
