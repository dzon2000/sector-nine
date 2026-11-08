import {describe,expect,it} from "vitest";
import {createGame,stats,type GameState} from "../../src/domain/model";
import {place,remove} from "../../src/game/commands";
import {validateSave} from "../../src/persistence/indexedDb";
import {purchaseTechnology,technologyStatus,TECHNOLOGIES,type TechnologyId} from "../../src/game/technologies";

function completed():GameState {
  const state=createGame();
  state.mission.activeId="DONE";
  state.mission.soldIngot=20;
  state.sales!.iron_ingot=20;
  return state;
}
function buy(s:GameState,id:TechnologyId):GameState {
  const result=purchaseTechnology(s,id);
  expect(result.ok,result.message).toBe(true);
  return result.state;
}
describe("WP4 paid technology unlocks (V02-AC-10, 11, 12)",()=>{
  it("keeps every approved fee and exposes all missing prerequisites",()=>{
    expect(TECHNOLOGIES.coal_extraction.costCents).toBe(8000);
    expect(TECHNOLOGIES.mechanical_components.costCents).toBe(12000);
    expect(TECHNOLOGIES.advanced_smelting.costCents).toBe(18000);
    const state=createGame();
    expect(technologyStatus(state,"coal_extraction").status).toBe("locked");
    expect(technologyStatus(state,"mechanical_components").missing.length).toBeGreaterThan(0);
    expect(technologyStatus(state,"advanced_smelting").missing.length).toBeGreaterThan(0);
  });
  it("rejects purchases before M4 completion without any state mutation",()=>{
    const state=createGame();
    for(const id of ["coal_extraction","mechanical_components","advanced_smelting"] as TechnologyId[]){
      const result=purchaseTechnology(state,id);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
    }
  });
  it("allows coal and mechanical purchases in either order; prerequisites do not auto-spend",()=>{
    const initial=completed();
    expect(initial.technologies!.coal_extraction).toBe(false);
    expect(technologyStatus(initial,"coal_extraction").status).toBe("available");
    expect(technologyStatus(initial,"mechanical_components").status).toBe("available");
    const mechanical=buy(initial,"mechanical_components");
    expect(mechanical.balanceCents).toBe(18000);
    expect(mechanical.technologies).toMatchObject({coal_extraction:false,mechanical_components:true});
    const both=buy(mechanical,"coal_extraction");
    expect(both.balanceCents).toBe(10000);
    expect(both.technologies!.coal_extraction).toBe(true);
    expect(initial.balanceCents).toBe(30000);
  });
  it("uses lifetime ingot sales rather than production or mission-only counters",()=>{
    const state=completed();
    state.sales!.iron_ingot=19;
    expect(technologyStatus(state,"mechanical_components").status).toBe("locked");
    state.sales!.iron_ingot=20;
    expect(technologyStatus(state,"mechanical_components").status).toBe("available");
  });
  it("requires both earlier technologies plus ten sold coal and eight sold gears",()=>{
    let state=completed();
    state.balanceCents=100000;
    state.sales!.coal=10;
    state.sales!.gear=8;
    expect(technologyStatus(state,"advanced_smelting").status).toBe("locked");
    state=buy(buy(state,"coal_extraction"),"mechanical_components");
    state.sales!.coal=9;
    expect(technologyStatus(state,"advanced_smelting").status).toBe("locked");
    state.sales!.coal=10;
    state.sales!.gear=7;
    expect(technologyStatus(state,"advanced_smelting").status).toBe("locked");
    state.sales!.gear=8;
    expect(technologyStatus(state,"advanced_smelting").status).toBe("available");
    const unlocked=buy(state,"advanced_smelting");
    expect(unlocked.balanceCents).toBe(state.balanceCents-18000);
    expect(unlocked.technologies!.advanced_smelting).toBe(true);
  });
  it("rejects unaffordable and duplicate purchases atomically",()=>{
    const state=completed();
    state.balanceCents=7999;
    expect(technologyStatus(state,"coal_extraction").status).toBe("available");
    const poor=purchaseTechnology(state,"coal_extraction");
    expect(poor.ok).toBe(false);
    expect(poor.state).toBe(state);
    state.balanceCents=8000;
    const bought=buy(state,"coal_extraction");
    expect(bought.balanceCents).toBe(0);
    const duplicate=purchaseTechnology(bought,"coal_extraction");
    expect(duplicate.ok).toBe(false);
    expect(duplicate.state).toBe(bought);
    expect(technologyStatus(bought,"coal_extraction").status).toBe("unlocked");
  });
  it("charges only cash, never revenue, operating cost or rolling profit",()=>{
    const state=completed();
    state.rollingEvents=Array.from({length:60},(_,i)=>({tick:i+1,revenueCents:200,costCents:50}));
    state.totalRevenueCents=12000;
    state.totalCostCents=3000;
    const snapshot=stats(state);
    const bought=buy(state,"coal_extraction");
    expect(stats(bought)).toEqual(snapshot);
    expect(bought.rollingEvents).toEqual(state.rollingEvents);
    expect(bought.lastEvent).toEqual(state.lastEvent);
    expect([bought.totalRevenueCents,bought.totalCostCents]).toEqual([12000,3000]);
  });
  it("persists permanent unlocks through save/load, demolition and negative cash",()=>{
    let state=completed();
    state=buy(state,"coal_extraction");
    state=validateSave(JSON.parse(JSON.stringify(state)));
    expect(state.technologies!.coal_extraction).toBe(true);
    const mine=place(state,"coal_mine",7,9,"N");
    expect(mine.ok).toBe(true);
    const demolished=remove(mine.state,mine.state.nextId-1,true);
    expect(demolished.ok).toBe(true);
    demolished.state.balanceCents=-500;
    const restored=validateSave(JSON.parse(JSON.stringify(demolished.state)));
    expect(technologyStatus(restored,"coal_extraction").status).toBe("unlocked");
    expect(restored.technologies!.coal_extraction).toBe(true);
  });
  it("recognizes migrated DONE milestone and prior ingot deliveries without replay",()=>{
    const source=createGame();
    source.schemaVersion=1;
    source.mission.activeId="DONE";
    source.mission.soldIngot=23;
    delete source.technologies;delete source.coalDeposits;
    for(const entity of source.entities){delete entity.inputBuffers;delete entity.reservedInputs;}
    const migrated=validateSave(source);
    expect(technologyStatus(migrated,"mechanical_components").status).toBe("available");
    expect(buy(migrated,"mechanical_components").technologies!.mechanical_components).toBe(true);
  });
});
