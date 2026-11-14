import {describe,expect,it} from "vitest";
import {createGame,emptySales,type GameState} from "../../src/domain/model";
import {beginChapterII,newChapterMetrics,recordChapterTick,chapterWindow} from "../../src/game/chapterTwo";
import {updateMission} from "../../src/game/missions";
import {tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

const entry=()=>{
  const s=createGame();
  s.mission.activeId="DONE";
  s.technologies!.coal_extraction=true;
  s.technologies!.mechanical_components=true;
  s.technologies!.advanced_smelting=true;
  const opened=beginChapterII(s);
  expect(opened.ok).toBe(true);
  const n=opened.state;
  n.mission.activeId="M10";
  n.chapterII!.metrics=newChapterMetrics(n.tick);
  return n;
};
const step=(s:GameState,i:number,overrides:Partial<{circuit:number;produced:number;steel:number;covered:boolean}>={})=>{
  const circuit=overrides.circuit??(i%60<11?1:0);
  const steel=overrides.steel??(i%60<5?1:0);
  const produced=overrides.produced??(i%60<11?1:0);
  const covered=overrides.covered??(i%60<57);
  s.tick++;
  recordChapterTick(s,{...emptySales(),circuit,steel},produced,covered);
  updateMission(s);
  return s;
};
describe("WP2 exact M10 thresholds and active-tick restore",()=>{
  it.each([
    ["circuit sale threshold 10/11",{circuit:0}],
    ["physical production threshold 10/11",{produced:0}],
    ["steel sale threshold 4/5",{steel:0}],
    ["covered demand threshold 56/57",{covered:false}]
  ] as const)("%s never qualifies if the metric is consistently missing",(_,override)=>{
    const s=entry();
    for(let i=0;i<180;i++)step(s,i,override);
    expect(s.mission.activeId).toBe("M10");
    expect(s.chapterII?.metrics?.streakTicks).toBe(0);
    const w=chapterWindow(s);
    expect(w).not.toBeNull();
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("requires a complete 60 tick window and exactly 60 qualifying evaluations",()=>{
    const s=entry();
    for(let i=0;i<59;i++)step(s,i);
    expect(chapterWindow(s)).toBeNull();
    expect(s.chapterII!.metrics!.streakTicks).toBe(0);
    step(s,59);
    expect(s.chapterII!.metrics!.streakTicks).toBe(1);
    for(let i=60;i<118;i++)step(s,i);
    expect(s.mission.activeId).toBe("M10");
    expect(s.chapterII!.metrics!.streakTicks).toBe(59);
    step(s,118);
    expect(s.mission.activeId).toBe("DONE");
    expect(s.chapterII!.completed).toBe(true);
    expect(s.chapterII!.metrics).toBeNull();
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("preserves evaluated M10 streak and mission epoch across save/reload and a paused tick",()=>{
    const direct=entry();
    for(let i=0;i<75;i++)step(direct,i);
    expect(direct.chapterII!.metrics!.streakTicks).toBe(16);
    const restored=validateSave(JSON.parse(JSON.stringify(direct)));
    const pause=structuredClone(restored);pause.paused=true;
    expect(tick(pause)).toEqual(pause);
    for(let i=75;i<119;i++){step(direct,i);step(restored,i);}
    expect(restored).toEqual(direct);
    expect(restored.mission.activeId).toBe("DONE");
  });
  it("resets an otherwise qualifying streak on a failing full window, then allows recovery",()=>{
    const s=entry();
    for(let i=0;i<75;i++)step(s,i);
    expect(s.chapterII!.metrics!.streakTicks).toBe(16);
    // a whole 60-tick period without new production loses the recent-production window
    for(let i=75;i<135;i++)step(s,i,{produced:0});
    expect(s.mission.activeId).toBe("M10");
    expect(s.chapterII!.metrics!.streakTicks).toBe(0);
    for(let i=135;i<330 && s.mission.activeId==="M10";i++)step(s,i);
    expect(s.mission.activeId).toBe("DONE");
  });
  it("rejects corrupted Chapter II windows and does not overwrite the input on error",()=>{
    const good=entry();
    for(let i=0;i<65;i++)step(good,i);
    const valid=validateSave(JSON.parse(JSON.stringify(good)));
    expect(valid).toEqual(good);
    const edits:Array<(s:GameState)=>void>=[
      s=>{s.chapterII!.metrics!.streakTicks=-1;},
      s=>{s.chapterII!.metrics!.activatedAtTick=s.tick+1;},
      s=>{s.chapterII!.metrics!.salesTicks[1].tick+=2;},
      s=>{s.chapterII!.metrics!.salesTicks[0].producedCircuits=-1;},
      s=>{s.chapterII!.metrics!.salesTicks[0].demandCovered="yes" as any;},
      s=>{s.chapterII!.metrics!.salesTicks[0].sales.circuit=-1;},
      s=>{s.chapterII!.metrics!.salesTicks.push({...s.chapterII!.metrics!.salesTicks.at(-1)!,tick:s.tick+1});},
      s=>{s.chapterII!.metrics!.lastEvaluatedTick=s.tick+2;},
      s=>{s.chapterII!.completed=true;},
      s=>{s.missionRuleVersion=2;},
      s=>{delete (s as any).chapterII;},
      s=>{delete s.technologies!.industrial_power;}
    ];
    for(const mutate of edits){
      const copy=structuredClone(good);mutate(copy);
      const before=JSON.stringify(copy);
      expect(()=>validateSave(copy)).toThrow();
      expect(JSON.stringify(copy)).toBe(before);
    }
    expect(validateSave(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });
});
