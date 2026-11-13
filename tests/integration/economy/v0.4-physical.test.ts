import {describe,expect,it} from "vitest";
import {createGame,DEFINITIONS,ITEMS,RECIPES,REVENUE,stockOnHand,type Direction,type GameState,type Kind} from "../../../src/domain/model";
import {place,remove} from "../../../src/game/commands";
import {runTicks,tick} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";
type Built=readonly [Exclude<Kind,"sell_terminal">,number,number,Direction];
const M8:Built[]=[
  ["copper_mine",8,2,"E"],["conveyor",9,2,"S"],["conveyor",9,3,"S"],["conveyor",9,4,"S"],["conveyor",9,5,"E"],
  ["silicon_extractor",8,9,"N"],["conveyor",8,8,"N"],["conveyor",8,7,"N"],["conveyor",8,6,"E"],["conveyor",9,6,"N"]
];
const M9:Built[]=[
  ["copper_mine",8,2,"W"],["conveyor",7,2,"W"],["conveyor",6,2,"S"],["conveyor",6,3,"S"],
  ["conveyor",6,4,"S"],["conveyor",6,5,"S"],["conveyor",6,6,"E"],
  ["silicon_extractor",8,9,"N"],["conveyor",8,8,"N"],["conveyor",8,7,"W"],["conveyor",7,7,"N"],
  ["circuit_fabricator",7,6,"E"],["conveyor",8,6,"E"],["conveyor",9,6,"N"],["conveyor",9,5,"E"],
  ["coal_mine",5,9,"N"],["conveyor",5,8,"N"],["conveyor",5,7,"N"],["conveyor",5,6,"N"],["coal_generator",5,5,"E"]
];
function factory(layout:readonly Built[]):GameState {
  let s=createGame();
  s.mission.activeId="DONE";s.technologies!.coal_extraction=true;
  s.balanceCents=1000000; // isolated fixture capital, NEVER a recoverable-campaign claim
  for(const [kind,x,y,direction] of layout){
    const result=place(s,kind,x,y,direction);
    expect(result.ok,kind+" @"+x+","+y+": "+result.message).toBe(true);
    s=result.state;
  }
  s.paused=false;
  return s;
}
function conserved(s:GameState){
  const actual=stockOnHand(s.entities);
  for(const item of ITEMS){
    const l=s.materialLedger![item];
    expect(l.opening+l.produced-l.consumed-l.sold-l.demolished-l.burned,item).toBe(actual[item]);
  }
}
function measure(label:string, s:GameState, count:number){
  const start=structuredClone(s);
  let covered=0,peakDemand=0,terminalMax=0;
  for(let i=0;i<count;i++){
    s=tick(s);
    if(s.power?.demandCovered)covered++;
    peakDemand=Math.max(peakDemand,s.power?.demand??0);
    const sample=s.diagnostics!.samples.at(-1)!;
    terminalMax=Math.max(terminalMax,Object.values(sample.terminalSales).reduce((a,b)=>a+b,0));
  }
  const sales=Object.fromEntries(ITEMS.map(item=>[item,s.sales![item]-start.sales![item]]));
  const result={label,ticks:count,startTick:start.tick,endTick:s.tick,
    sales,covered,peakDemand,terminalMax,
    cashBefore:start.balanceCents,cashAfter:s.balanceCents,
    revenueCents:s.totalRevenueCents!-start.totalRevenueCents!,
    operatingCostCents:s.totalCostCents!-start.totalCostCents!,
    powerSupply:s.power?.history.reduce((n,t)=>n+t.supply,0)??0,
    burnedCoal:s.materialLedger!.coal.burned-start.materialLedger!.coal.burned};
  console.info("V04-WP3-PHYSICAL "+JSON.stringify(result));
  conserved(s);
  expect(terminalMax).toBeLessThanOrEqual(1);
  return {s,result};
}
describe("WP3 real 12x12 logistics / experimental constraints",()=>{
  it("M8 two deposit routes physically sell >=10 each with only one unchanged terminal",()=>{
    const s=factory(M8);
    const {s:end,result}=measure("M8 physical 2-route",s,240);
    expect(end.entities.find(e=>e.kind==="sell_terminal")).toMatchObject({x:10,y:5});
    expect(result.sales.copper_ore).toBeGreaterThanOrEqual(10);
    expect(result.sales.silicon).toBeGreaterThanOrEqual(10);
    expect(result.sales.circuit).toBe(0);
    expect(validateSave(JSON.parse(JSON.stringify(end)))).toEqual(end);
  });
  it("M9 feeds a circuit fabricator with two physical inputs and mined generator coal; >=4 sold circuits",()=>{
    const s=factory(M9);
    const {s:end,result}=measure("M9 physical powered chain",s,360);
    expect(result.sales.circuit).toBeGreaterThanOrEqual(4);
    expect(end.materialLedger!.copper_ore.consumed).toBeGreaterThanOrEqual(8);
    expect(end.materialLedger!.silicon.consumed).toBeGreaterThanOrEqual(4);
    expect(end.materialLedger!.coal.burned).toBeGreaterThan(0);
    expect(end.materialLedger!.coal.sold).toBe(0);
    expect(result.covered).toBeGreaterThan(0);
    expect(validateSave(JSON.parse(JSON.stringify(end)))).toEqual(end);
  });
  it("measures single-deposit M10 hard limit on NEW copper supply (unapproved hypothesis)",()=>{
    const s=factory([["copper_mine",8,2,"E"],["conveyor",9,2,"S"]]);
    const warm=runTicks(s,60);
    const {result}=measure("single copper deposit steady-state upper bound",warm,240);
    const maxCopperPer60=Math.ceil(60/3);
    const requiredCopperPer60=11*RECIPES.circuit.input.copper_ore!;
    expect(maxCopperPer60).toBe(20);
    expect(requiredCopperPer60).toBe(22);
    expect(requiredCopperPer60).toBeGreaterThan(maxCopperPer60);
    expect(result.sales.circuit).toBe(0);
  });
  it("candidate copper site conflicts with actual v0.3 reference F-M7 gear-output conveyor",()=>{
    const fM7GearExit:Built=["conveyor",8,2,"E"];
    expect(fM7GearExit.slice(1,3)).toEqual([8,2]);
    const existing=factory([fM7GearExit]);
    const blocked=place(existing,"copper_mine",8,2,"E");
    expect(blocked.ok).toBe(false);
    expect(blocked.state).toEqual(existing);
    const demolition=remove(existing,existing.entities.find(e=>e.x===8&&e.y===2)!.id,true);
    expect(demolition.ok).toBe(true);
    expect(place(demolition.state,"copper_mine",8,2,"E").ok).toBe(true);
    expect(demolition.state.balanceCents-existing.balanceCents).toBe(375);
  });
});
