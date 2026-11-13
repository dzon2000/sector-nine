import {describe,expect,it} from "vitest";
import {createGame,DEFINITIONS,ITEMS,REVENUE,stockOnHand,type GameState,type Item} from "../../src/domain/model";
import {place,setPause} from "../../src/game/commands";
import {runTicks,tick} from "../../src/simulation/engine";

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
