import {describe,expect,it} from "vitest";
import {createGame,type Entity,type GameState} from "../../../src/domain/model";
import {place,remove,setPause} from "../../../src/game/commands";
import {tick,runTicks} from "../../../src/simulation/engine";
import {entityDiagnostics,terminalDiagnostics,diagnosticHint} from "../../../src/game/diagnostics";
import {validateSave} from "../../../src/persistence/indexedDb";

function add(s:GameState,kind:"conveyor"|"furnace"|"iron_mine"|"coal_mine"|"assembler"|"advanced_furnace",x:number,y:number,direction:"N"|"E"|"S"|"W"="E"):GameState{
  const r=place(s,kind,x,y,direction);
  expect(r.ok,r.message).toBe(true);
  return r.state;
}
function raw(kind:Entity["kind"],id:number,x:number,y:number,extras:Partial<Entity>={}):Entity{
  return {id,kind,x,y,direction:"E",output:null,belt:null,oreInput:0,cycle:null,status:"waiting_for_inputs",
    inputBuffers:{},reservedInputs:{},...extras};
}
function setupMachine():GameState{
  let s=createGame();s.mission.activeId="M3";
  s=add(s,"furnace",5,5);
  s=add(s,"conveyor",6,5);
  s.paused=false;
  return s;
}
describe("WP4 authoritative 60-active-tick diagnostic counters",()=>{
  it("classifies missing ore/coal/ingots as input starvation once per entity and simulation tick",()=>{
    let s=setupMachine();
    s=runTicks(s,60);
    const furnace=s.entities.find(e=>e.kind==="furnace")!;
    expect(entityDiagnostics(s,furnace.id)).toMatchObject({
      ticks:60,workingTicks:0,inputStarvedTicks:60,outputBlockedTicks:0,
      completedUnits:0,completedPer60Ticks:0
    });
    expect(diagnosticHint(s,furnace.id)).toMatch(/iron ore/i);
    s.entities.push(raw("advanced_furnace",20,7,5,{inputBuffers:{iron_ingot:2}}));
    s.entities.push(raw("assembler",21,8,6,{inputBuffers:{iron_ingot:1}}));
    s.nextId=22;
    s=tick(s);
    expect(diagnosticHint(s,20)).toMatch(/coal/i);
    expect(diagnosticHint(s,21)).toMatch(/ingot/i);
  });
  it("counts processing completion separately from working, input starvation and blocked output",()=>{
    let s=setupMachine();
    const furnace=s.entities.find(e=>e.kind==="furnace")!;
    furnace.inputBuffers={iron_ore:2};furnace.oreInput=2;
    s.materialLedger!.iron_ore.opening=2;
    // Keep the downstream belt occupied, so completed output cannot discharge.
    s.entities.find(e=>e.kind==="conveyor")!.belt="iron_ingot";
    s.materialLedger!.iron_ingot.opening=1;
    s=runTicks(s,6);
    const d=entityDiagnostics(s,furnace.id)!;
    expect(d.ticks).toBe(6);
    expect(d.completedUnits).toBe(1);
    expect(d.workingTicks+d.inputStarvedTicks+d.outputBlockedTicks).toBe(6);
    expect(d.outputBlockedTicks).toBeGreaterThan(0);
    expect(d.completedPer60Ticks).toBe(10); // 1 / 6 * 60
    expect(diagnosticHint(s,furnace.id)).toMatch(/output|downstream/i);
  });
  it("occupied output is blocked, clearing downstream permits resumed work",()=>{
    let s=setupMachine();
    const furnace=s.entities.find(e=>e.kind==="furnace")!;
    furnace.output="iron_ingot";furnace.inputBuffers={iron_ore:2};furnace.oreInput=2;
    s.materialLedger!.iron_ingot.opening=1;s.materialLedger!.iron_ore.opening=2;
    const belt=s.entities.find(e=>e.kind==="conveyor")!;
    belt.belt="iron_ingot";s.materialLedger!.iron_ingot.opening++;
    s=tick(s);
    expect(entityDiagnostics(s,furnace.id)?.outputBlockedTicks).toBe(1);
    s.entities.find(e=>e.id===belt.id)!.belt=null; // clear obstacle on current cloned state
    s=tick(s);
    expect(entityDiagnostics(s,furnace.id)?.workingTicks).toBeGreaterThan(0);
  });
  it("distinguishes occupied moving conveyor from occupied-but-stalled; records actual departures",()=>{
    const s=createGame();
    s.paused=false;
    s.entities.push(raw("conveyor",2,9,5,{belt:"gear"}));
    let n=tick(s);
    expect(entityDiagnostics(n,2)).toMatchObject({ticks:1,conveyorMoves:1,conveyorStalledTicks:0});
    expect(terminalDiagnostics(n).sales.gear).toBe(1);
    n.entities.find(e=>e.id===2)!.belt="steel";
    n.entities.find(e=>e.id===2)!.direction="W";
    n=tick(n);
    expect(entityDiagnostics(n,2)).toMatchObject({ticks:2,conveyorMoves:1,conveyorStalledTicks:1});
    expect(terminalDiagnostics(n).sales.steel).toBe(0);
  });
  it("simultaneous belt movement along occupied chain is not falsely stalled",()=>{
    let s=createGame();s.paused=false;
    s.entities.push(raw("conveyor",2,8,5,{belt:"gear"}));
    s.entities.push(raw("conveyor",3,9,5,{belt:"steel"}));
    s=tick(s);
    expect(entityDiagnostics(s,2)).toMatchObject({conveyorMoves:1,conveyorStalledTicks:0});
    expect(entityDiagnostics(s,3)).toMatchObject({conveyorMoves:1,conveyorStalledTicks:0});
    expect(terminalDiagnostics(s)).toMatchObject({ticks:1,totalSales:1,sales:{steel:1}});
    expect(s.entities.find(e=>e.id===3)?.belt).toBe("gear");
  });
  it("tracks terminal per-material sales and bounds counters to 60 active ticks without wall-clock",()=>{
    let s=createGame();s.paused=false;
    s.entities.push(raw("conveyor",2,9,5,{belt:"gear"}));
    s=tick(s);
    expect(terminalDiagnostics(s).sales.gear).toBe(1);
    s=runTicks(s,59);
    expect(terminalDiagnostics(s).ticks).toBe(60);
    expect(terminalDiagnostics(s).totalSales).toBe(1);
    s=tick(s);
    expect(terminalDiagnostics(s).totalSales).toBe(0);
    const paused=setPause(s,true);
    expect(runTicks(paused,150)).toEqual(paused);
    expect(terminalDiagnostics(paused)).toEqual(terminalDiagnostics(s));
  });
  it("prunes old metrics on demolition/replacement and never attributes counts by location",()=>{
    let s=createGame();s.mission.activeId="M3";
    s=add(s,"conveyor",4,5);s.paused=false;s=runTicks(s,10);
    const id=s.entities.find(e=>e.x===4&&e.y===5)!.id;
    expect(entityDiagnostics(s,id)?.ticks).toBe(10);
    const demolished=remove(s,id,true);
    expect(demolished.ok).toBe(true);s=demolished.state;
    expect(entityDiagnostics(s,id)).toBeNull();
    s=add(s,"conveyor",4,5);
    const replacement=s.entities.find(e=>e.x===4&&e.y===5)!;
    expect(replacement.id).not.toBe(id);
    expect(entityDiagnostics(s,replacement.id)).toBeNull();
    s=tick(s);
    expect(entityDiagnostics(s,replacement.id)?.ticks).toBe(1);
    expect(entityDiagnostics(s,id)).toBeNull();
  });
  it("resumes machine, belt and terminal diagnostics identically after v3 save/restore",()=>{
    let s=createGame();s.paused=false;
    s.entities.push(raw("conveyor",2,9,5,{belt:"gear"}));
    s=runTicks(s,28);
    const restored=validateSave(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual(s);
    expect(runTicks(restored,100)).toEqual(runTicks(s,100));
  });
  it("migrates previous schema v3 snapshots lacking diagnostics without losing gameplay data",()=>{
    const s=createGame();
    delete s.diagnostics;
    s.mission.activeId="M6";
    s.paused=false;
    const n=validateSave(s);
    expect(n.diagnostics).toEqual({samples:[]});
    expect(n.mission.activeId).toBe("M6");
    expect(n.balanceCents).toBe(s.balanceCents);
    expect(n.entities).toEqual(s.entities);
  });
  it("rejects corrupt diagnostic samples without discarding existing save",()=>{
    let s=createGame();s.paused=false;s=runTicks(s,5);
    const corrupt=structuredClone(s);
    corrupt.diagnostics!.samples[0].tick=-1;
    expect(()=>validateSave(corrupt)).toThrow();
    const duplicate=structuredClone(s);
    duplicate.diagnostics!.samples.push({...duplicate.diagnostics!.samples.at(-1)!});
    expect(()=>validateSave(duplicate)).toThrow();
  });
});
