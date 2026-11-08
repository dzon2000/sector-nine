import {describe,expect,it} from "vitest";
import {createGame,DEPOSITS,DEFINITIONS,REVENUE,type GameState} from "../../src/domain/model";
import {place} from "../../src/game/commands";
import {tick,runTicks} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

/**
 * v0.2 contract tests, intentionally committed RED before implementation.
 * Approved specification and ADR-0002 own all numeric expectations.
 * Do not weaken tests to accommodate an implementation.
 */
describe("v0.2 domain contracts (AC-01, 02, 03)",()=>{
  it("preserves iron map and adds two coal deposits",()=>{
    expect(DEPOSITS).toEqual([{x:3,y:5},{x:2,y:2},{x:2,y:9}]);
    const s=createGame();
    expect([s.width,s.height]).toEqual([12,12]);
    expect(s.entities.find(e=>e.kind==="sell_terminal")).toMatchObject({x:10,y:5});
    expect((s as any).coalDeposits).toEqual([{x:7,y:9},{x:5,y:9}]);
  });
  it("uses approved cents for new equipment and sales",()=>{
    expect((DEFINITIONS as any).coal_mine.price).toBe(6500);
    expect((DEFINITIONS as any).assembler.price).toBe(13000);
    expect((DEFINITIONS as any).advanced_furnace.price).toBe(18000);
    expect((REVENUE as any).coal).toBe(300);
    expect((REVENUE as any).gear).toBe(2100);
    expect((REVENUE as any).steel).toBe(2600);
  });
  it("rejects a locked coal mine without spending or mutating state",()=>{
    const s=createGame(), before=structuredClone(s);
    const result=place(s,"coal_mine" as any,7,9,"N");
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(before);
  });
  it("gates new-game furnace until M2, preserving migrated M3 access",()=>{
    const fresh=createGame();
    expect(place(fresh,"furnace",4,2,"E").ok).toBe(false);
    const progressed=structuredClone(fresh);
    progressed.mission.activeId="M3";
    expect(place(progressed,"furnace",4,2,"E").ok).toBe(true);
  });
});

describe("v0.2 headless production (AC-04 through AC-09)",()=>{
  it("coal mine produces one coal in three active ticks at 80 cents",()=>{
    let s:any=createGame();
    s.technologies={coal_extraction:true,mechanical_components:false,advanced_smelting:false};
    const result=place(s,"coal_mine" as any,7,9,"N");
    expect(result.ok).toBe(true);
    s={...result.state,paused:false};
    s=runTicks(s,3);
    const mine=s.entities.find((e:any)=>e.kind==="coal_mine");
    expect(mine.output).toBe("coal");
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(80);
    s=runTicks(s,6);
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(80);
  });
  it("reserves two ingots atomically for gears; no premature fee",()=>{
    let s:any=createGame();
    s.technologies={coal_extraction:false,mechanical_components:true,advanced_smelting:false};
    const placed=place(s,"assembler" as any,6,2,"E");
    expect(placed.ok).toBe(true);
    s=placed.state;
    const machine=s.entities.find((e:any)=>e.kind==="assembler");
    machine.inputBuffers={iron_ingot:1};
    s.paused=false;
    s=runTicks(s,8);
    expect(s.entities.find((e:any)=>e.id===machine.id).output).toBeNull();
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(0);
    s.entities.find((e:any)=>e.id===machine.id).inputBuffers.iron_ingot=2;
    s=runTicks(s,5);
    expect(s.entities.find((e:any)=>e.id===machine.id).output).toBe("gear");
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(250);
  });
  it("steel cannot start without both material types; output costs exactly once",()=>{
    let s:any=createGame();
    s.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true};
    const result=place(s,"advanced_furnace" as any,7,5,"E");
    expect(result.ok).toBe(true);
    s=result.state;
    const id=s.entities.find((e:any)=>e.kind==="advanced_furnace").id;
    s.entities.find((e:any)=>e.id===id).inputBuffers={iron_ingot:2,coal:0};
    s.paused=false;
    s=runTicks(s,10);
    expect(s.entities.find((e:any)=>e.id===id).output).toBeNull();
    expect(s.lastEvent.costCents).toBe(0);
    s.entities.find((e:any)=>e.id===id).inputBuffers.coal=1;
    s=runTicks(s,8);
    expect(s.entities.find((e:any)=>e.id===id).output).toBe("steel");
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(350);
    s=runTicks(s,10);
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(350);
  });
});

describe("v0.2 save compatibility (AC-16, 17, 21)",()=>{
  it("upgrades a valid v1 snapshot without losing occupied future coal tiles or active furnace cycle",()=>{
    const old=createGame();
    old.entities.push({id:2,kind:"conveyor",x:7,y:9,direction:"N",output:null,belt:"iron_ore",oreInput:0,cycle:null,status:"working"});
    old.entities.push({id:3,kind:"furnace",x:4,y:2,direction:"E",output:null,belt:null,oreInput:1,cycle:2,status:"working"});
    old.nextId=4;old.tick=123;old.balanceCents=12345;
    old.mission.activeId="M3";
    const migrated:any=validateSave(old);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.tick).toBe(123);
    expect(migrated.balanceCents).toBe(12345);
    expect(migrated.entities.find((e:any)=>e.id===2)).toMatchObject({x:7,y:9,belt:"iron_ore"});
    expect(migrated.entities.find((e:any)=>e.id===3)).toMatchObject({cycle:2});
    expect(migrated.entities.find((e:any)=>e.id===3).inputBuffers.iron_ore).toBe(1);
    expect(validateSave(migrated)).toEqual(migrated);
  });
  it("rejects corrupt snapshots instead of silently replacing them",()=>{
    expect(()=>validateSave({...createGame(),entities:[]})).toThrow();
  });
});
