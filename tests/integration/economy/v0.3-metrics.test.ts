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
  it("starts a fresh campaign with current mission rules and bounded empty measurement history",()=>{
    const state=createGame();
    expect(state.schemaVersion).toBe(5);
    expect(state.missionRuleVersion).toBe(5);
    expect(state.missionMetrics).toBeNull();
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

  it("rejects new-rule active M6/M7 saves with null or missing measurement state instead of silently softlocking",()=>{
    for(const id of ["M6","M7"] as const){
      const valid=createGame();
      valid.mission.activeId=id;
      
      valid.missionMetrics=null;
      expect(()=>validateSave(valid)).toThrow(/mission metrics/i);
      const missing=structuredClone(valid);
      delete missing.missionMetrics;
      expect(()=>validateSave(missing)).toThrow(/mission metrics/i);
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
