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
    s=runTicks(s,6);
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
    s=runTicks(s,9);
    expect(s.entities.find((e:any)=>e.id===id).output).toBe("steel");
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(350);
    s=runTicks(s,10);
    expect(s.rollingEvents.reduce((sum:number,e:any)=>sum+e.costCents,0)).toBe(350);
  });
});

describe("v0.2 save compatibility (AC-16, 17, 21)",()=>{
  it("upgrades a valid v1 snapshot without losing occupied future coal tiles or active furnace cycle",()=>{
    const old=createGame();
    old.schemaVersion=1;
    delete old.technologies;
    delete old.coalDeposits;
    for(const entity of old.entities){delete entity.inputBuffers;delete entity.reservedInputs;}
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
  it("migrates a populated v0.1 factory preserving cash, history, arbiters, active cycles and deterministic continuation",()=>{
    const old=createGame();
    old.schemaVersion=1;old.tick=409;old.balanceCents=-235;
    old.paused=false;old.introOpen=false;old.introSeen=true;
    old.mission.activeId="M4";old.mission.soldOre=16;old.mission.soldIngot=24;
    old.mission.profitStreakTicks=12;
    old.totalOreProduced=300;old.totalIngotProduced=119;
    old.arbiters={"4":2,"7":5};
    old.rollingEvents=Array.from({length:60},(_,i)=>({tick:350+i,revenueCents:i%2?700:0,costCents:i%2?5:60}));
    old.lastEvent=old.rollingEvents[59];
    const make=(id:number,kind:"iron_mine"|"conveyor"|"furnace",x:number,y:number,props:Record<string,unknown>={})=>({
      id,kind,x,y,direction:"E" as const,output:null,belt:null,oreInput:0,cycle:null,
      status:"waiting_for_inputs" as const,...props
    });
    old.entities.push(
      make(2,"iron_mine",3,5,{output:"iron_ore",status:"blocked_output"}),
      make(3,"conveyor",4,5,{belt:"iron_ore",status:"working"}),
      make(4,"furnace",5,5,{oreInput:1,cycle:2,status:"working"}),
      make(5,"conveyor",6,5,{belt:"iron_ingot",status:"working"}),
      make(6,"conveyor",7,5),
      make(7,"conveyor",8,5),
      make(8,"conveyor",9,5),
      make(9,"conveyor",7,9,{belt:"iron_ore",status:"working"}),
      make(10,"iron_mine",2,2,{cycle:1,status:"working"})
    );
    old.nextId=11;
    delete old.technologies;delete old.coalDeposits;
    delete old.sales;delete old.materialLedger;delete old.totalRevenueCents;delete old.totalCostCents;
    delete old.foundryStorySeen;
    delete old.mission.soldCoal;delete old.mission.soldGear;delete old.mission.soldSteel;
    for(const entity of old.entities){delete entity.inputBuffers;delete entity.reservedInputs;}
    const migrated=validateSave(JSON.parse(JSON.stringify(old)));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.balanceCents).toBe(-235);
    expect(migrated.tick).toBe(409);
    expect(migrated.arbiters).toEqual(old.arbiters);
    expect(migrated.rollingEvents).toEqual(old.rollingEvents);
    expect(migrated.lastEvent).toEqual(old.lastEvent);
    expect(migrated.mission).toMatchObject({activeId:"M4",soldOre:16,soldIngot:24,profitStreakTicks:12});
    expect(migrated.entities.map(e=>[e.id,e.kind,e.x,e.y,e.direction,e.cycle,e.output,e.belt]))
      .toEqual(old.entities.map(e=>[e.id,e.kind,e.x,e.y,e.direction,e.cycle,e.output,e.belt]));
    expect(migrated.entities.find(e=>e.id===4)).toMatchObject({
      oreInput:1,inputBuffers:{iron_ore:1},reservedInputs:{iron_ore:2},cycle:2
    });
    expect(migrated.entities.find(e=>e.id===9)).toMatchObject({x:7,y:9,belt:"iron_ore"});
    expect(validateSave(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    const resumed=validateSave(JSON.parse(JSON.stringify(migrated)));
    expect(runTicks(resumed,360)).toEqual(runTicks(migrated,360));
  });
  it("rejects corrupt snapshots instead of silently replacing them",()=>{
    expect(()=>validateSave({...createGame(),entities:[]})).toThrow();
  });
});
