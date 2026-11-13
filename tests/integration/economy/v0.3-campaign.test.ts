import {describe,expect,it} from "vitest";
import {createGame,ITEMS,DEFINITIONS,type Direction,type GameState,type Item,type Kind} from "../../../src/domain/model";
import {begin,place,remove,turn} from "../../../src/game/commands";
import {purchaseTechnology,type TechnologyId} from "../../../src/game/technologies";
import {tick,runTicks} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";

type Placeable=Exclude<Kind,"sell_terminal">;
type Construction=readonly [Placeable,number,number,Direction];
const ironMine:Construction=["iron_mine",3,5,"E"];
const oreConveyors:Construction[]=[4,5,6,7,8,9].map(x=>["conveyor",x,5,"E"]);
const coalLine:Construction[]=[
  ["coal_mine",7,9,"N"],["conveyor",7,8,"N"],["conveyor",7,7,"N"],["conveyor",7,6,"N"]
];
const gearLine:Construction[]=[
  ["iron_mine",2,2,"E"],["conveyor",3,2,"E"],["furnace",4,2,"E"],
  ["conveyor",5,2,"E"],["assembler",6,2,"E"],
  ["conveyor",7,2,"E"],["conveyor",8,2,"E"],["conveyor",9,2,"E"],
  ["conveyor",10,2,"S"],["conveyor",10,3,"S"],["conveyor",10,4,"S"]
];

type Campaign={state:GameState;spent:number;refunded:number;research:number;checkpoints:{stage:string;tick:number;cashCents:number}[]};
// Preserve the original v0.2 campaign economics as a dedicated legacy-rule regression.
function campaign():Campaign{
  const state=begin(createGame());
  return {state,spent:0,refunded:0,research:0,checkpoints:[]};
}
function construct(c:Campaign,...entries:Construction[]):void {
  for(const [kind,x,y,direction] of entries){
    const before=c.state.balanceCents;
    const result=place(c.state,kind,x,y,direction);
    expect(result.ok,`Cannot construct ${kind} at (${x},${y}): ${result.message}; cash ${before}`).toBe(true);
    expect(result.state.balanceCents).toBe(before-DEFINITIONS[kind].price);
    c.spent+=DEFINITIONS[kind].price;
    c.state=result.state;
  }
}
function demolish(c:Campaign,x:number,y:number):void {
  const e=c.state.entities.find(e=>e.x===x&&e.y===y);
  expect(e,`Missing structure at (${x},${y})`).toBeDefined();
  const before=c.state.balanceCents;
  const result=remove(c.state,e!.id,true);
  expect(result.ok).toBe(true);
  const refund=Math.floor(DEFINITIONS[e!.kind].price*0.75);
  expect(result.state.balanceCents).toBe(before+refund);
  c.refunded+=refund;
  c.state=result.state;
}
function research(c:Campaign,id:TechnologyId):void {
  const before=c.state.balanceCents;
  const result=purchaseTechnology(c.state,id);
  expect(result.ok,`Cannot unlock ${id}: ${result.message}; cash ${before}`).toBe(true);
  const fee=before-result.state.balanceCents;
  expect(fee).toBe(({coal_extraction:8000,mechanical_components:12000,advanced_smelting:18000})[id]);
  c.research+=fee;c.state=result.state;
}
/** Wait while an existing profitable route finances construction; fail on a credit deadlock. */
function financeTo(c:Campaign,targetCents:number,maxTicks=1200):void {
  const startedAt=c.state.tick;
  const revenueBefore=c.state.totalRevenueCents??0;
  const startCash=c.state.balanceCents;
  while(c.state.balanceCents<targetCents && c.state.tick-startedAt<maxTicks){
    c.state=runTicks(c.state,60);
  }
  expect(c.state.balanceCents,
    `Cannot finance ${targetCents} cents after ${maxTicks} active ticks`).toBeGreaterThanOrEqual(targetCents);
  if(c.state.tick>startedAt){
    expect(c.state.totalRevenueCents).toBeGreaterThan(revenueBefore);
    expect(c.state.balanceCents).toBeGreaterThan(startCash);
  }
  console.info("V03-WP3-FINANCE "+JSON.stringify({
    targetCents,waitedActiveTicks:c.state.tick-startedAt,
    revenueGainCents:(c.state.totalRevenueCents??0)-revenueBefore,
    cashAtFinishCents:c.state.balanceCents
  }));
}
function until(c:Campaign,mission:GameState["mission"]["activeId"],maxTicks=1500):void {
  const start=c.state.tick;
  while(c.state.mission.activeId!==mission&&c.state.tick-start<maxTicks)c.state=tick(c.state);
  expect(c.state.mission.activeId,
    `Expected ${mission} within ${maxTicks} active ticks, reached ${c.state.mission.activeId}; cash=${c.state.balanceCents}; sales=${JSON.stringify(c.state.sales)}`).toBe(mission);
  c.checkpoints.push({stage:mission,tick:c.state.tick,cashCents:c.state.balanceCents});
}
function balance(c:Campaign):void {
  expect(c.state.balanceCents).toBe(
    30000-c.spent+c.refunded-c.research+(c.state.totalRevenueCents??0)-(c.state.totalCostCents??0)
  );
}
function materialConservation(s:GameState):void {
  const onHand=Object.fromEntries(ITEMS.map(item=>[item,0])) as Record<Item,number>;
  for(const e of s.entities){
    if(e.output)onHand[e.output]++;
    if(e.belt)onHand[e.belt]++;
    if(e.kind==="furnace")onHand.iron_ore+=e.oreInput;
    else for(const item of ITEMS)onHand[item]+=e.inputBuffers?.[item]??0;
    for(const item of ITEMS)onHand[item]+=e.reservedInputs?.[item]??0;
  }
  for(const item of ITEMS){
    const e=s.materialLedger![item];
    expect(e.produced-e.consumed-e.sold-e.demolished,`Material conservation ${item}`).toBe(onHand[item]);
  }
}

describe("WP3 new v0.3 campaign from 300 Cr (V03-AC-07)",()=>{
  it("reaches M7 completion with real commands, terminal sales and permanent paid unlocks",()=>{
    const c=campaign();
    expect(c.state.balanceCents).toBe(30000);
    expect(c.state.schemaVersion).toBe(3);
    // Waste a small amount on an ordinary misplaced belt, then recover using demolition.
    construct(c,["conveyor",0,0,"E"]);
    demolish(c,0,0);
    construct(c,ironMine,...oreConveyors);
    until(c,"M3",120);
    expect(c.state.mission.soldOre).toBeGreaterThanOrEqual(10);
    // Replace one ore belt with a furnace; the remainder is reused.
    demolish(c,5,5);
    construct(c,["furnace",5,5,"E"]);
    until(c,"M5",650);
    expect(c.state.mission.soldIngot).toBeGreaterThanOrEqual(20);
    expect(c.state.mission.profitStreakTicks).toBe(60);
    // Allow profitable production to finance upcoming stages, without injecting money.
    c.state=runTicks(c.state,240);
    research(c,"coal_extraction");
    construct(c,...coalLine);
    until(c,"M6",150);
    expect(c.state.mission.soldCoal).toBe(10);
    // Preserve state mid-campaign, including occupied production buffers.
    const saved=JSON.parse(JSON.stringify(c.state));
    c.state=validateSave(saved);
    expect(c.state).toEqual(validateSave(saved));
    research(c,"mechanical_components");
    // Expand the gear line while preserving southern ingot sales.
    financeTo(c,35000);
    construct(c,...gearLine);

    // Reuse the southern furnace and mine. First install the upper route,
    // then reconfigure the southern iron chain to feed the same assembler.
    for(const [x,y] of [[7,5],[8,5],[9,5]]){
      demolish(c,x,y);
    }
    // E -> S -> W -> N, using actual rotate commands.
    const southernBelt=c.state.entities.find(e=>e.x===6&&e.y===5)!;
    for(let i=0;i<3;i++){
      const change=turn(c.state,southernBelt.id);
      expect(change.ok).toBe(true);c.state=change.state;
    }
    construct(c,["conveyor",6,4,"N"],["conveyor",6,3,"N"]);
    until(c,"M7",400);
    expect(c.state.mission.soldGear).toBeGreaterThanOrEqual(9);
    expect(c.state.sales!.gear).toBeGreaterThanOrEqual(9);
    // Keep the gear line operating while financing research and steel conversion.
    financeTo(c,40000);
    research(c,"advanced_smelting");
    // Divert the second iron stream to steel using existing assets.
    demolish(c,6,4);
    demolish(c,6,3);
    const route=c.state.entities.find(e=>e.x===6&&e.y===5)!;
    const rotated=turn(c.state,route.id);
    expect(rotated.ok).toBe(true);
    c.state=rotated.state; // N -> E
    construct(c,["advanced_furnace",7,5,"E"],["conveyor",8,5,"E"],["conveyor",9,5,"E"]);
    until(c,"DONE",400);
    expect(c.state.mission.soldSteel).toBeGreaterThanOrEqual(7);
    expect(c.state.technologies).toEqual({
      coal_extraction:true,mechanical_components:true,advanced_smelting:true
    });
    expect(c.state.sales!.steel).toBeGreaterThanOrEqual(8);
    expect(c.state.balanceCents).toBeGreaterThanOrEqual(0);
    balance(c);materialConservation(c.state);
    expect(validateSave(JSON.parse(JSON.stringify(c.state)))).toEqual(c.state);
    console.info("V03-WP3-CAMPAIGN "+JSON.stringify({checkpoints:c.checkpoints,
      finalCashCents:c.state.balanceCents,capitalSpentCents:c.spent,
      demolitionRefundsCents:c.refunded,researchFeesCents:c.research,
      totalRevenueCents:c.state.totalRevenueCents,totalOperatingCostCents:c.state.totalCostCents,
      sold:c.state.sales}));
  });
});
