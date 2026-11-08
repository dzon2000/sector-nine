import {describe,expect,it} from "vitest";
import {createGame,stats,type Direction,type GameState,type Item,type Kind} from "../../../src/domain/model";
import {place} from "../../../src/game/commands";
import {runTicks} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";

type Placeable = Exclude<Kind,"sell_terminal">;
type Position = readonly [Placeable,number,number,Direction];
const iron:Position[]=[
  ["iron_mine",3,5,"E"],["conveyor",4,5,"E"],["furnace",5,5,"E"],
  ...[6,7,8,9].map(x=>["conveyor",x,5,"E"] as Position)
];
const coal:Position[]=[
  ["coal_mine",7,9,"N"],...([8,7,6] as const).map(y=>["conveyor",7,y,"N"] as Position),
  ["conveyor",7,5,"E"],["conveyor",8,5,"E"],["conveyor",9,5,"E"]
];
const gears:Position[]=[
  ["iron_mine",2,2,"E"],["conveyor",3,2,"E"],["furnace",4,2,"E"],
  ["conveyor",5,2,"E"],["assembler",6,2,"E"],
  ...[7,8,9].map(x=>["conveyor",x,2,"E"] as Position),
  ["conveyor",10,2,"S"],["conveyor",10,3,"S"],["conveyor",10,4,"S"]
];
const steel:Position[]=[
  ...iron.slice(0,3),["conveyor",6,5,"E"],["advanced_furnace",7,5,"E"],
  ["conveyor",8,5,"E"],["conveyor",9,5,"E"],
  ["coal_mine",7,9,"N"],...([8,7,6] as const).map(y=>["conveyor",7,y,"N"] as Position)
];
function setup(layout:readonly Position[]):GameState{
  let state=createGame();
  state.mission.activeId="M3"; // The economic fixture assumes tutorial construction was completed.
  state.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true};
  state.balanceCents=1000000; // Fixture capital only; never included in operating profit.
  for(const [kind,x,y,dir] of layout){
    const result=place(state,kind,x,y,dir);
    expect(result.ok, `Cannot place ${kind} at (${x},${y}): ${result.message}`).toBe(true);
    state=result.state;
  }
  state.paused=false;
  return state;
}
type Measurement={state:GameState;start:GameState;sales:Record<Item,number>;revenue:number;cost:number;profit:number};
function measure(layout:readonly Position[]):Measurement{
  const start=runTicks(setup(layout),600);
  const state=runTicks(start,240);
  const revenue=state.rollingEvents.reduce((n,e)=>n+e.revenueCents,0);
  const cost=state.rollingEvents.reduce((n,e)=>n+e.costCents,0);
  const now=state as GameState & {sales?:Partial<Record<Item,number>>};
  const old=start as GameState & {sales?:Partial<Record<Item,number>>};
  const sales=Object.fromEntries((["iron_ore","iron_ingot","coal","gear","steel"] as Item[])
    .map(item=>[item,(now.sales?.[item]??0)-(old.sales?.[item]??0)])) as Record<Item,number>;
  return {state,start,sales,revenue,cost,profit:revenue-cost};
}
describe("v0.2 deterministic economy: 600-tick warm-up and 240-tick measurement (AC-18, 19)",()=>{
  it("preserves exact reference ingot output and profit per steady-state 60 ticks",()=>{
    const s=setup(iron);
    const warmed=runTicks(s,600);
    const measured=runTicks(warmed,60);
    expect(measured.totalOreProduced-warmed.totalOreProduced).toBe(30);
    expect(measured.mission.soldIngot-warmed.mission.soldIngot).toBe(15);
    expect(stats(measured)).toEqual({revenueCents:10500,costCents:4650,profitCents:5850});
  });
  it.each([
    ["coal sales",coal,"coal"],
    ["mechanical gears",gears,"gear"],
    ["advanced steel",steel,"steel"]
  ] as const)("%s is physically constructible, profitable, and delivers through terminal",(_name,layout,product)=>{
    const result=measure(layout);
    expect(result.sales[product]).toBeGreaterThan(0);
    expect(result.profit).toBeGreaterThan(0);
    expect(result.revenue).toBeGreaterThan(result.cost);
    expect(result.state.tick-result.start.tick).toBe(240);
    console.info(JSON.stringify({scenario:_name,ticks:240,productSales:result.sales[product],
      revenueCentsLast60:result.revenue,costCentsLast60:result.cost,
      operatingProfitCentsLast60:result.profit}));
  });
  it("two simultaneous independent gear and steel lines fit and both sell",()=>{
    const result=measure([...gears,...steel]);
    expect(result.sales.gear).toBeGreaterThan(0);
    expect(result.sales.steel).toBeGreaterThan(0);
  });
  it("all three production scenarios resume identically after serialization (AC-21)",()=>{
    for(const layout of [coal,gears,steel]){
      const warmed=runTicks(setup(layout),615);
      const restored=validateSave(JSON.parse(JSON.stringify(warmed)));
      expect(runTicks(restored,240)).toEqual(runTicks(warmed,240));
    }
  });
});
