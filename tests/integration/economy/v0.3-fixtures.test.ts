import {describe,expect,it} from "vitest";
import {createGame,DEFINITIONS,ITEMS,stockOnHand,type Direction,type Entity,type GameState,type Item,type Kind} from "../../../src/domain/model";
import {place,remove,turn} from "../../../src/game/commands";
import {activateMissionMetrics,missionWindow} from "../../../src/game/missionMetrics";
import {runTicks,tick} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";

type Construction = readonly [Exclude<Kind,"sell_terminal">,number,number,Direction];
const primary:Construction[]=[
  ["iron_mine",2,2,"E"],["conveyor",3,2,"E"],["furnace",4,2,"E"],
  ["conveyor",5,2,"E"],["assembler",6,2,"E"],
  ...[7,8,9].map(x=>["conveyor",x,2,"E"] as Construction),
  ...[2,3,4].map(y=>["conveyor",10,y,"S"] as Construction)
];
const supplemental:Construction[]=[
  ["iron_mine",3,5,"E"],["conveyor",4,5,"E"],["furnace",5,5,"E"],
  ["conveyor",6,5,"N"],["conveyor",6,4,"N"],["conveyor",6,3,"N"]
];
const coal:Construction[]=[
  ["coal_mine",7,9,"N"],...([8,7,6] as const).map(y=>["conveyor",7,y,"N"] as Construction)
];
const steel:Construction[]=[
  ...supplemental.slice(0,3),["conveyor",6,5,"E"],["advanced_furnace",7,5,"E"],
  ["conveyor",8,5,"E"],["conveyor",9,5,"E"],...coal
];
export const FM6:Construction[]=[...primary,...supplemental];
export const FM7:Construction[]=[...primary,...steel];

function build(layout:readonly Construction[],mission:"M6"|"M7",options?:{cash?:number}):GameState {
  let s=createGame();
  s.mission.activeId=mission;
  s.missionMetrics=activateMissionMetrics(s.tick);
  s.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true};
  s.balanceCents=options?.cash??1000000; // Capital-only fixture; not part of profit.
  for(const [kind,x,y,direction] of layout){
    const result=place(s,kind,x,y,direction);
    expect(result.ok, `Cannot place ${kind} (${x},${y}): ${result.message}`).toBe(true);
    s=result.state;
  }
  s.paused=false;
  return s;
}
function cost(layout:readonly Construction[]):number{return layout.reduce((sum,[kind])=>sum+DEFINITIONS[kind].price,0);}
function measure(s:GameState,numberOfTicks:number){
  let working=0,starved=0,blocked=0,completed=0;
  const before=structuredClone(s);
  for(let i=0;i<numberOfTicks;i++){
    const previous=s;
    s=tick(s);
    for(const entity of s.entities){
      if(entity.kind!=="sell_terminal"&&entity.kind!=="conveyor"){
        if(entity.status==="working")working++;
        else if(entity.status==="waiting_for_inputs")starved++;
        else if(entity.status==="blocked_output")blocked++;
      }

    }
    completed+=(s.materialLedger!.gear.produced-before.materialLedger!.gear.produced)-
      (previous.materialLedger!.gear.produced-before.materialLedger!.gear.produced);
  }
  const sales=Object.fromEntries(ITEMS.map(item=>[item,s.sales![item]-before.sales![item]])) as Record<Item,number>;
  return {s,sales,revenueCents:s.totalRevenueCents!-before.totalRevenueCents!,
    costCents:s.totalCostCents!-before.totalCostCents!,
    profitCents:(s.totalRevenueCents!-before.totalRevenueCents!)-(s.totalCostCents!-before.totalCostCents!),
    working,starved,blocked,completed};
}
function conservation(s:GameState){
  const stock=stockOnHand(s.entities);
  for(const item of ITEMS){
    const l=s.materialLedger![item];
    expect(l.opening+l.produced-l.consumed-l.sold-l.demolished,
      `Material imbalance: ${item}`).toBe(stock[item]);
  }
}
describe("WP3 real-engine physical mission feasibility (V03-AC-04,05,15,16,17)",()=>{
  it("constructs exact 12x12 F-M6 and F-M7 approved layouts without overlap or deposit changes",()=>{
    expect(cost(FM6)).toBe(44000);
    expect(cost(FM7)).toBe(70000);
    for(const [layout,id] of [[FM6,"M6"],[FM7,"M7"]] as const){
      const s=build(layout,id);
      expect(s.entities.length).toBe(layout.length+1);
      expect(s.entities.filter(e=>e.kind==="sell_terminal")).toHaveLength(1);
      expect([s.width,s.height]).toEqual([12,12]);
      expect(s.entities.filter(e=>e.kind==="iron_mine").map(e=>[e.x,e.y]).sort())
        .toEqual([[2,2],[3,5]]);
      expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
    }
  });
  it("single iron-fed gear line cannot pass M6, dual-fed layout qualifies after 120 complete rolling windows",()=>{
    let one=build(primary,"M6");
    one=runTicks(one,600);
    expect(one.mission.activeId).toBe("M6");
    expect(one.missionMetrics?.streakTicks).toBeLessThan(120);
    const start=build(FM6,"M6");
    const end=runTicks(start,240);
    expect(end.mission.activeId).toBe("M7");
    expect(end.missionMetrics?.activatedAtTick).toBeGreaterThanOrEqual(179);
    conservation(one);conservation(end);
  });
  it("F-M7 meets simultaneous steel, gear and 17500-cent profit conditions for a 120-tick streak",()=>{
    const end=runTicks(build(FM7,"M7"),240);
    expect(end.mission.activeId).toBe("DONE");
    expect(end.technologies!.advanced_smelting).toBe(true);
    conservation(end);
  });
  it("isolated gear-only or steel-only factory cannot satisfy M7 regardless of positive profit",()=>{
    for(const layout of [primary,steel]){
      const end=runTicks(build(layout,"M7"),600);
      expect(end.mission.activeId).toBe("M7");
      expect(end.missionMetrics?.streakTicks).toBe(0);
      conservation(end);
    }
  });
  it("reports real-engine steady-state sales, gross revenue, operating cost and process congestion",()=>{
    for(const [name,layout,product] of [
      ["one-chain gear",primary,"gear"],["F-M6",FM6,"gear"],
      ["steel-only",steel,"steel"],["F-M7",FM7,"gear"]
    ] as const){
      const warmed=runTicks(build(layout,"M7"),600);
      const measurement=measure(warmed,240);
      expect(measurement.sales[product]).toBeGreaterThan(0);
      expect(measurement.profitCents).toBeGreaterThan(0);
      const approved={
        "one-chain gear":{gear:30,steel:0,profitCents:36900},
        "F-M6":{gear:48,steel:0,profitCents:58560},
        "steel-only":{gear:0,steel:30,profitCents:46650},
        "F-M7":{gear:30,steel:30,profitCents:83550}
      }[name];
      expect(measurement.sales.gear).toBe(approved.gear);
      expect(measurement.sales.steel).toBe(approved.steel);
      expect(measurement.profitCents).toBe(approved.profitCents);
      expect(measurement.working+measurement.starved+measurement.blocked).toBeGreaterThan(0);
      console.info("V03-WP3-REFERENCE "+JSON.stringify({name,buildCostCents:cost(layout),ticks:240,
        sales:measurement.sales,revenueCents:measurement.revenueCents,costCents:measurement.costCents,
        profitCents:measurement.profitCents,operatingProfitPer60Ticks:measurement.profitCents/4,
        workingEntityTicks:measurement.working,starvedEntityTicks:measurement.starved,
        blockedEntityTicks:measurement.blocked}));
    }
  });
});

describe("WP3 stockpile, backpressure, persistence and reversibility (V03-AC-06,16)",()=>{
  it("prefilled disconnected one-chain output cannot sustain the M6 threshold for 120 ticks",()=>{
    let s=build(primary.filter(([,x,y])=>!(x===10&&y===4)),"M6");
    s=runTicks(s,360); // Output belt fills and production backpressures.
    expect(s.mission.activeId).toBe("M6");
    expect(s.entities.some(e=>e.kind==="conveyor"&&e.belt!==null)).toBe(true);
    const result=place(s,"conveyor",10,4,"S");
    expect(result.ok).toBe(true);
    s=result.state;
    let bestStreak=0;
    for(let i=0;i<360;i++){
      s=tick(s);
      bestStreak=Math.max(bestStreak,s.missionMetrics?.streakTicks??0);
    }
    expect(bestStreak).toBeLessThan(120);
    expect(s.mission.activeId).toBe("M6");
    conservation(s);
  });
  it("a processor output/buffer/reservation prefill cannot convert single-source production into 120 sustainable ticks",()=>{
    let s=build(primary,"M6");
    const assembler=s.entities.find(e=>e.kind==="assembler")!;
    assembler.inputBuffers={iron_ingot:4};
    assembler.reservedInputs={iron_ingot:2};
    assembler.cycle=1;
    // These items exist as opening stock for the adversarial fixture.
    s.materialLedger!.iron_ingot.opening=6;
    s=runTicks(s,600);
    expect(s.mission.activeId).toBe("M6");
    expect(s.missionMetrics?.streakTicks).toBeLessThan(120);
    conservation(s);
  });
  it("prefilled assembler output, outgoing belts and input buffer cannot bypass sustained M6 throughput",()=>{
    let s=build(primary,"M6");
    const assembler=s.entities.find(e=>e.kind==="assembler")!;
    assembler.output="gear";
    assembler.inputBuffers={iron_ingot:4};
    let openingGears=1;
    for(const e of s.entities.filter(e=>e.kind==="conveyor"&&
      ((e.y===2&&e.x>=7)||(e.x===10&&e.y>=3&&e.y<=4)))){
      e.belt="gear";openingGears++;
    }
    s.materialLedger!.gear.opening=openingGears;
    s.materialLedger!.iron_ingot.opening=4;
    expect(openingGears).toBe(7);
    conservation(s);
    let longest=0;
    for(let i=0;i<480;i++){
      s=tick(s);
      longest=Math.max(longest,s.missionMetrics?.streakTicks??0);
    }
    expect(longest).toBeLessThan(120);
    expect(s.mission.activeId).toBe("M6");
    conservation(s);
  });
  it("physical F-M7 transport and arbitration remain deterministic after repeated save/restore",()=>{
    let first=runTicks(build(FM7,"M7"),58);
    for(let i=0;i<4;i++){
      const restored=validateSave(JSON.parse(JSON.stringify(first)));
      const uninterrupted=runTicks(first,60);
      const resumed=runTicks(restored,60);
      expect(resumed).toEqual(uninterrupted);
      conservation(resumed);
      first=resumed;
    }
    expect(first.mission.activeId).toBe("DONE");
  });
});
