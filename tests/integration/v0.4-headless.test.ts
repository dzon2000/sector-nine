import {describe,expect,it} from "vitest";
import {createGame,DEFINITIONS,ITEMS,REVENUE,stockOnHand,type GameState,type Item} from "../../src/domain/model";
import {place,remove,setPause} from "../../src/game/commands";
import {runTicks,tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

function factory(){
  let s:any=createGame();
  s.mission.activeId="DONE";
  s.balanceCents=1000000;
  s.paused=false;
  const add=(kind:string,x:number,y:number,direction:"N"|"E"|"S"|"W"="E")=>{
    const r=place(s,kind as any,x,y,direction);
    expect(r.ok, r.message).toBe(true);
    s=r.state;
    return s.entities.find((e:any)=>e.x===x&&e.y===y);
  };
  return {get state(){return s as GameState & {power:any}},add,set(value:GameState){s=value}};
}
function entity(s:any,kind:string,index=0):any{return s.entities.filter((e:any)=>e.kind===kind)[index];}
function seed(s:any,kind:string,stock:Record<string,number>){
  const e=entity(s,kind);
  e.inputBuffers={...stock};
  for(const [item,quantity] of Object.entries(stock))s.materialLedger[item].opening+=quantity;
  return e;
}
function conservation(s:any){
  const physical=stockOnHand(s.entities) as Record<Item,number>;
  for(const item of ITEMS as readonly string[]){
    const l=s.materialLedger[item];
    expect(l.opening+l.produced-l.consumed-l.sold-l.demolished-(l.burned??0),item).toBe(physical[item as Item]);
  }
}
describe("v0.4 WP1 headless power and electronics — red-first contracts",()=>{
  it("adds provisional definitions without touching old economics or geography",()=>{
    expect((DEFINITIONS as any).copper_mine.price).toBe(7500);
    expect((DEFINITIONS as any).silicon_extractor.price).toBe(8500);
    expect((DEFINITIONS as any).circuit_fabricator.price).toBe(16000);
    expect((DEFINITIONS as any).coal_generator.price).toBe(11000);
    expect((REVENUE as any).circuit).toBe(3000);
    expect([DEFINITIONS.iron_mine.price,DEFINITIONS.coal_mine.price,DEFINITIONS.furnace.price]).toEqual([4500,6500,8000]);
    expect(ITEMS).toContain("copper_ore");
    expect(ITEMS).toContain("silicon");
    expect(ITEMS).toContain("circuit");
  });
  it("extracts only from matching deposits and transfers copper and silicon physically",()=>{
    const f=factory();
    expect(place(f.state,"copper_mine" as any,0,0,"E").ok).toBe(false);
    f.add("copper_mine",8,2);
    f.add("silicon_extractor",8,9);
    f.add("conveyor",9,2,"S");
    f.add("conveyor",9,3,"S");
    f.add("conveyor",9,9,"N");
    const finished=runTicks(f.state,24) as any;
    expect(finished.materialLedger.copper_ore.produced).toBeGreaterThan(0);
    expect(finished.materialLedger.silicon.produced).toBeGreaterThan(0);
    expect(finished.materialLedger.copper_ore.sold).toBe(0);
    conservation(finished);
  });
  it("fabricates 2 copper + 1 silicon only after six powered processing ticks and charges once",()=>{
    const f=factory();
    f.add("circuit_fabricator",6,6);
    f.add("coal_generator",4,6);
    const s:any=f.state;
    seed(s,"circuit_fabricator",{copper_ore:2,silicon:1});
    seed(s,"coal_generator",{coal:1});
    let a=tick(s) as any;
    expect(entity(a,"circuit_fabricator").cycle).toBe(6);
    expect(a.power.supply).toBe(0);
    a=runTicks(a,5);
    expect(entity(a,"circuit_fabricator").output).toBe(null);
    a=tick(a);
    expect(entity(a,"circuit_fabricator").output).toBe("circuit");
    expect(a.materialLedger.circuit.produced).toBe(1);
    expect(a.materialLedger.copper_ore.consumed).toBe(2);
    expect(a.materialLedger.silicon.consumed).toBe(1);
    expect(a.totalCostCents).toBe(300);
    conservation(a);
    const blocked=runTicks(a,30) as any;
    expect(blocked.materialLedger.circuit.produced).toBe(1);
    expect(blocked.totalCostCents).toBe(300);
    conservation(blocked);
  });
  it("fuel delivered after production is not usable until next tick; burns coal exactly once",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    const s:any=f.state;
    seed(s,"coal_generator",{coal:1});
    let a=tick(s) as any;
    expect(a.power.supply).toBe(0);
    expect(entity(a,"coal_generator").fuelTicksRemaining).toBe(12);
    expect(a.materialLedger.coal.burned).toBe(1);
    expect(a.materialLedger.coal.sold).toBe(0);
    a=runTicks(a,12);
    expect(entity(a,"coal_generator").fuelTicksRemaining).toBe(0);
    expect(a.power.supply).toBe(1);
    a=tick(a);
    expect(a.power.supply).toBe(0);
    conservation(a);
  });
  it("round-robin grants alternate and survive restore, irrespective of entity array order",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    f.add("circuit_fabricator",6,6);
    f.add("circuit_fabricator",7,6);
    const s:any=f.state;
    seed(s,"coal_generator",{coal:2});
    for(const e of s.entities.filter((e:any)=>e.kind==="circuit_fabricator")){
      e.reservedInputs={copper_ore:2,silicon:1};
      e.cycle=6;
      s.materialLedger.copper_ore.opening+=2;
      s.materialLedger.silicon.opening+=1;
    }
    let a=tick(s) as any; // load fuel
    const first=tick(a) as any;
    expect(first.power.demand).toBe(2);
    expect(first.power.served).toBe(1);
    expect(first.power.unpoweredProcessingTicks).toBe(1);
    const second=tick(first) as any;
    expect(entity(second,"circuit_fabricator",0).cycle).toBe(5);
    expect(entity(second,"circuit_fabricator",1).cycle).toBe(5);
    const restored=JSON.parse(JSON.stringify(second));
    const shuffled=JSON.parse(JSON.stringify(second));
    shuffled.entities.reverse();
    expect((runTicks(restored,6) as any).power).toEqual((runTicks(shuffled,6) as any).power);
    expect(runTicks(restored,6).entities.sort((x:any,y:any)=>x.id-y.id))
      .toEqual(runTicks(shuffled,6).entities.sort((x:any,y:any)=>x.id-y.id));
    conservation(second);
  });
  it("an unpowered cycle freezes without losing reservations; pausing freezes fuel",()=>{
    const f=factory();
    f.add("circuit_fabricator",6,6);
    const s:any=f.state;
    const e=seed(s,"circuit_fabricator",{copper_ore:2,silicon:1});
    let a=tick(s) as any;
    expect(entity(a,"circuit_fabricator").cycle).toBe(6);
    a=runTicks(a,5) as any;
    expect(entity(a,"circuit_fabricator").cycle).toBe(6);
    expect(a.power.unpoweredProcessingTicks).toBe(1);
    const paused=setPause(a,true);
    expect(tick(paused)).toEqual(paused);
    expect(entity(a,"circuit_fabricator").reservedInputs).toEqual({copper_ore:2,silicon:1});
    conservation(a);
  });
});

describe("v0.4 WP1 transport, fair supply and strict persistence boundaries",()=>{
  it("physically sells copper and silicon at the single terminal and accounts for every item",()=>{
    const f=factory();
    f.add("copper_mine",8,2);
    f.add("silicon_extractor",8,9);
    for(const [x,y,d] of [[9,2,"S"],[9,3,"S"],[9,4,"S"],[9,5,"E"],[9,9,"E"],[10,9,"N"],[10,8,"N"],[10,7,"N"],[10,6,"N"]] as const){
      f.add("conveyor",x,y,d);
    }
    const s=runTicks(f.state,120) as any;
    expect(s.materialLedger.copper_ore.sold).toBeGreaterThan(0);
    expect(s.materialLedger.silicon.sold).toBeGreaterThan(0);
    expect(s.materialLedger.circuit.sold).toBe(0);
    expect(s.totalRevenueCents).toBe(
      s.materialLedger.copper_ore.sold*REVENUE.copper_ore+
      s.materialLedger.silicon.sold*REVENUE.silicon
    );
    for(const sample of s.diagnostics.samples)
      expect(Object.values(sample.terminalSales).reduce((a:number,b:any)=>a+b,0)).toBeLessThanOrEqual(1);
    conservation(s);
  });
  it("requires physical coal travel before generator fueling; never credits a coal sale",()=>{
    const f=factory();
    f.state.technologies!.coal_extraction=true;
    f.add("coal_mine",7,9,"N");
    f.add("conveyor",7,8,"N");
    f.add("conveyor",7,7,"N");
    f.add("coal_generator",7,6,"N");
    const s=runTicks(f.state,35) as any;
    expect(s.materialLedger.coal.produced).toBeGreaterThan(0);
    expect(s.materialLedger.coal.burned).toBeGreaterThan(0);
    expect(s.materialLedger.coal.sold).toBe(0);
    expect(s.power.history.some((t:any)=>t.supply>0)).toBe(true);
    conservation(s);
  });
  it("aggregates two generators and serves only two of three continuous requests",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    f.add("coal_generator",5,6);
    for(const x of [6,7,8])f.add("circuit_fabricator",x,6);
    const s:any=f.state;
    for(const g of s.entities.filter((e:any)=>e.kind==="coal_generator")){
      g.inputBuffers={coal:1};s.materialLedger.coal.opening++;
    }
    for(const e of s.entities.filter((e:any)=>e.kind==="circuit_fabricator")){
      e.cycle=6;e.reservedInputs={copper_ore:2,silicon:1};
      s.materialLedger.copper_ore.opening+=2;
      s.materialLedger.silicon.opening++;
    }
    let a=tick(s) as any;
    expect(a.power.supply).toBe(0);
    a=tick(a);
    expect(a.power).toMatchObject({supply:2,demand:3,served:2,unpoweredProcessingTicks:1,demandCovered:false});
    expect(a.power.lastServedFabricatorId).toBeGreaterThan(0);
    conservation(a);
    expect(validateSave(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
  it("finishes blocked cycle only after output is transferred, without extra power or duplicate consumption",()=>{
    const f=factory();
    f.add("circuit_fabricator",6,6,"E");
    f.add("conveyor",7,6,"E");
    const s:any=f.state;
    const e=entity(s,"circuit_fabricator");
    e.output="circuit";e.cycle=0;e.reservedInputs={copper_ore:2,silicon:1};
    s.materialLedger.circuit.opening++;
    s.materialLedger.copper_ore.opening+=2;
    s.materialLedger.silicon.opening++;
    let a=tick(s) as any;
    expect(entity(a,"circuit_fabricator").output).toBeNull();
    expect(entity(a,"circuit_fabricator").cycle).toBe(0);
    expect(a.materialLedger.circuit.produced).toBe(0);
    expect(a.power.demand).toBe(0);
    a=tick(a);
    expect(entity(a,"circuit_fabricator").output).toBe("circuit");
    expect(a.materialLedger.circuit.produced).toBe(1);
    expect(a.materialLedger.copper_ore.consumed).toBe(2);
    expect(a.materialLedger.silicon.consumed).toBe(1);
    expect(a.totalCostCents).toBe(305); // one belt transfer + one circuit completion
    conservation(a);
    const restored=validateSave(JSON.parse(JSON.stringify(a)));
    expect(runTicks(restored,20)).toEqual(runTicks(a,20));
  });
  it("initializes power state at first electronic construction and rejects missing active power snapshots",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    const placed=f.state;
    expect(placed.power).toMatchObject({tick:placed.tick,supply:0,demand:0,served:0,lastServedFabricatorId:0,history:[]});
    expect(validateSave(JSON.parse(JSON.stringify(placed)))).toEqual(placed);
    const corrupt:any=structuredClone(placed);
    delete corrupt.power;
    expect(()=>validateSave(corrupt)).toThrow(/power/i);
  });
  it("rejects negative generator fuel counters and invalid allocation cursors on load",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    const a=tick(f.state);
    expect(validateSave(JSON.parse(JSON.stringify(a)))).toEqual(a);
    const negative=structuredClone(a);
    entity(negative,"coal_generator").fuelTicksRemaining=-1;
    expect(()=>validateSave(negative)).toThrow(/fuel|power/i);
    const cursor=structuredClone(a);
    cursor.power!.lastServedFabricatorId=-1;
    expect(()=>validateSave(cursor)).toThrow(/power|cursor/i);
  });
});

describe("v0.4 WP1 fuel and arbitration boundary regressions",()=>{
  it("spends last existing fuel tick before accepting same-tick coal into next-tick supply",()=>{
    const f=factory();
    f.add("coal_generator",4,6,"N");
    f.add("conveyor",4,7,"N");
    const s:any=f.state;
    entity(s,"coal_generator").fuelTicksRemaining=1;
    entity(s,"conveyor").belt="coal";
    s.materialLedger.coal.opening=1;
    let a=tick(s) as any;
    expect(a.power).toMatchObject({supply:1,demand:0,served:0,demandCovered:false,coalBurned:1});
    expect(entity(a,"coal_generator").fuelTicksRemaining).toBe(12);
    expect(entity(a,"coal_generator").inputBuffers.coal).toBe(0);
    expect(entity(a,"conveyor").belt).toBeNull();
    conservation(a);
    a=tick(a) as any;
    expect(a.power.supply).toBe(1);
    expect(entity(a,"coal_generator").fuelTicksRemaining).toBe(11);
    const paused=setPause(a,true);
    expect(tick(paused)).toEqual(paused);
  });
  it("resumes an input-reserved fabricator from the exact frozen cycle after power becomes available",()=>{
    const f=factory();
    f.add("circuit_fabricator",6,6);
    const s:any=f.state;
    seed(s,"circuit_fabricator",{copper_ore:2,silicon:1});
    let a=runTicks(s,4) as any;
    expect(entity(a,"circuit_fabricator").cycle).toBe(6);
    expect(entity(a,"circuit_fabricator").reservedInputs).toEqual({copper_ore:2,silicon:1});
    const added=place(a,"coal_generator",4,6,"N");
    expect(added.ok).toBe(true);
    a=added.state as any;
    entity(a,"coal_generator").inputBuffers={coal:1};
    a.materialLedger.coal.opening++;
    a=tick(a) as any;
    expect(a.power.supply).toBe(0);
    expect(entity(a,"circuit_fabricator").cycle).toBe(6);
    a=runTicks(a,3) as any;
    expect(entity(a,"circuit_fabricator").cycle).toBe(3);
    const restored=validateSave(JSON.parse(JSON.stringify(a)));
    expect(runTicks(restored,3)).toEqual(runTicks(a,3));
    const done=runTicks(a,3) as any;
    expect(entity(done,"circuit_fabricator").output).toBe("circuit");
    conservation(done);
  });
  it("keeps fair cursor stable after a requesting consumer is removed",()=>{
    const f=factory();
    f.add("coal_generator",4,6);
    for(const x of [6,7,8])f.add("circuit_fabricator",x,6);
    const s:any=f.state;
    seed(s,"coal_generator",{coal:1});
    for(const e of s.entities.filter((e:any)=>e.kind==="circuit_fabricator")){
      e.cycle=6;e.reservedInputs={copper_ore:2,silicon:1};
      s.materialLedger.copper_ore.opening+=2;s.materialLedger.silicon.opening++;
    }
    let a=runTicks(s,3) as any; // charge, grant to first, grant to second
    const ids=a.entities.filter((e:any)=>e.kind==="circuit_fabricator").map((e:any)=>e.id).sort((x:number,y:number)=>x-y);
    expect(a.power.lastServedFabricatorId).toBe(ids[1]);
    const removed=remove(a,ids[1],true);
    expect(removed.ok).toBe(true);
    a=tick(removed.state) as any;
    expect(a.power.lastServedFabricatorId).toBe(ids[2]);
    expect(a.power).toMatchObject({demand:2,served:1,unpoweredProcessingTicks:1});
    conservation(a);
    expect(validateSave(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
});

describe("v0.4 WP1 accounting and compatibility contract",()=>{
  it("physically sells one fuel-powered circuit through the terminal and charges exactly once",()=>{
    const f=factory();
    f.add("coal_generator",7,6);
    f.add("circuit_fabricator",8,5,"E");
    f.add("conveyor",9,5,"E");
    const s:any=f.state;
    seed(s,"coal_generator",{coal:1});
    seed(s,"circuit_fabricator",{copper_ore:2,silicon:1});
    const initial=s.balanceCents;
    const end=runTicks(s,12) as any;
    expect(end.materialLedger.circuit.produced).toBe(1);
    expect(end.materialLedger.circuit.sold).toBe(1);
    expect(end.sales.circuit).toBe(1);
    expect(end.totalRevenueCents).toBe(3000);
    expect(end.totalCostCents).toBe(305); // processing + one conveyor transfer
    expect(end.balanceCents).toBe(initial+3000-305);
    expect(end.materialLedger.coal.burned).toBe(1);
    conservation(end);
    expect(validateSave(JSON.parse(JSON.stringify(end)))).toEqual(end);
  });
  it("leaves legacy machines unpowered and preserves original economic state shape",()=>{
    const f=factory();
    f.add("iron_mine",3,5,"E");
    f.add("furnace",5,5,"E");
    f.add("conveyor",4,5,"E");
    f.add("conveyor",6,5,"E");
    const s=runTicks(f.state,30);
    expect(s.power).toBeUndefined();
    expect(s.totalOreProduced).toBeGreaterThan(0);
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
    conservation(s);
  });
});
