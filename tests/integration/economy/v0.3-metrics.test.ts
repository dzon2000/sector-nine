import {describe,expect,it} from "vitest";
import {createGame,emptySales,type GameState} from "../../../src/domain/model";
import {tick,runTicks} from "../../../src/simulation/engine";
import {activateMissionMetrics,missionWindow} from "../../../src/game/missionMetrics";
import {validateSave} from "../../../src/persistence/indexedDb";

function activeMission(id:"M6"|"M7"):GameState {
  const state=createGame();
  state.mission.activeId=id;
  state.missionMetrics=activateMissionMetrics(state.tick);
  state.paused=false;
  return state;
}

describe("WP1 mission measurement foundation",()=>{
  it("starts a fresh campaign with v3 mission rules and bounded empty measurement history",()=>{
    const state=createGame();
    expect(state.schemaVersion).toBe(3);
    expect(state.missionRuleVersion).toBe(3);
    expect(state.missionMetrics).toBeNull();
  });

  it("upgrades active v2 M6 and M7 as legacy missions without changing existing progression or stock",()=>{
    for(const id of ["M6","M7"] as const){
      const legacy=createGame() as GameState;
      legacy.schemaVersion=2;
      legacy.mission.activeId=id;
      legacy.mission.soldGear=5;
      legacy.mission.soldSteel=4;
      delete (legacy as Partial<GameState>).missionRuleVersion;
      delete (legacy as Partial<GameState>).missionMetrics;
      const restored=validateSave(JSON.parse(JSON.stringify(legacy)));
      expect(restored.schemaVersion).toBe(3);
      expect(restored.missionRuleVersion).toBe(2);
      expect(restored.mission.soldGear).toBe(5);
      expect(restored.mission.soldSteel).toBe(4);
      expect(restored.entities).toEqual(legacy.entities);
    }
  });

  it("migrated M5 adopts new rules when M6 is activated and DONE stays completed",()=>{
    const prior=createGame() as GameState;
    prior.schemaVersion=2;
    delete (prior as Partial<GameState>).missionRuleVersion;
    delete (prior as Partial<GameState>).missionMetrics;
    prior.mission.activeId="M5";
    prior.mission.soldCoal=9;
    const restored=validateSave(prior);
    expect(restored.missionRuleVersion).toBe(3);
    restored.mission.soldCoal=10;
    const progressed=runTicks({...restored,paused:false},1);
    expect(progressed.mission.activeId).toBe("M6");
    expect(progressed.missionMetrics?.activatedAtTick).toBe(progressed.tick);
    expect(progressed.missionMetrics?.salesTicks).toEqual([]);
    const finished=structuredClone(prior);
    finished.mission.activeId="DONE";
    expect(validateSave(finished).mission.activeId).toBe("DONE");
  });

  it("counts successful physical terminal sales, not production or inventory",()=>{
    let s=activeMission("M6");
    s.entities.push({id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:"gear",oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    s.nextId=3;
    s=tick(s);
    expect(s.missionMetrics?.salesTicks).toEqual([{tick:1,sales:{...emptySales(),gear:1}}]);
    expect(missionWindow(s)).toBeNull();
    s=runTicks(s,59);
    expect(missionWindow(s)?.sales.gear).toBe(1);
    expect(missionWindow(s)?.sales.steel).toBe(0);
    expect(s.missionMetrics?.salesTicks).toHaveLength(60);
    s=tick(s);
    expect(missionWindow(s)?.sales.gear).toBe(0);
    expect(s.missionMetrics?.salesTicks).toHaveLength(60);
  });

  it("excludes all pre-activation history and only evaluates complete mission-local 60-tick windows",()=>{
    let s=createGame();
    s.paused=false;
    s=runTicks(s,90);
    s.mission.activeId="M7";
    s.missionMetrics=activateMissionMetrics(s.tick);
    s=runTicks(s,59);
    expect(missionWindow(s)).toBeNull();
    s=tick(s);
    expect(missionWindow(s)).toMatchObject({sales:emptySales(),profitCents:0});
    expect(s.missionMetrics?.salesTicks[0]?.tick).toBe(91);
  });

  it("retains tick-exact rolling sales and operating profit, excluding capital expenses",()=>{
    let s=activeMission("M7");
    s.balanceCents-=18000;
    const events=Array.from({length:60},(_,index)=>({
      tick:index+1,
      sales:{...emptySales(),gear:index%10===0?1:0,steel:index%12===0?1:0},
      profitCents:300
    }));
    s.missionMetrics!.salesTicks=events.map(({tick,sales})=>({tick,sales}));
    s.rollingEvents=events.map(({tick,profitCents})=>({tick,revenueCents:profitCents,costCents:0}));
    s.tick=60;
    expect(missionWindow(s)).toEqual({sales:{...emptySales(),gear:6,steel:5},profitCents:18000});
    expect(missionWindow(s)?.profitCents).not.toBe(s.balanceCents);
  });

  it("resumes identically at 59 ticks, 60 ticks, and during a persisted streak",()=>{
    for(const elapsed of [59,60,125]){
      let s=activeMission("M7");
      s=runTicks(s,elapsed);
      s.missionMetrics!.streakTicks=elapsed===125?42:0;
      const restored=validateSave(JSON.parse(JSON.stringify(s)));
      expect(restored).toEqual(s);
      expect(runTicks(restored,80)).toEqual(runTicks(s,80));
    }
  });

  it("does not advance while paused and rejects corrupt v3 rolling metric state",()=>{
    let s=activeMission("M6");
    s=runTicks(s,60);
    const paused={...s,paused:true};
    expect(tick(paused)).toBe(paused);
    expect(runTicks(paused,30)).toEqual(paused);
    const corrupt=structuredClone(s);
    corrupt.missionMetrics!.salesTicks[0].tick=-1;
    expect(()=>validateSave(corrupt)).toThrow();
    const oversized=structuredClone(s);
    oversized.missionMetrics!.salesTicks.push({...oversized.missionMetrics!.salesTicks[0]});
    expect(()=>validateSave(oversized)).toThrow();
  });
});
