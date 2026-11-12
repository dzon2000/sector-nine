import {describe,expect,it} from "vitest";
import {startPlaytest,resumePlaytest,advancePlaytest,recordPlaytestCommand,annotatePlaytest,finishPlaytest,buildPlaytestReport,type PlaytestSession} from "../../src/ui/playtest";
import {createGame,type GameState} from "../../src/domain/model";

function state(tick=0):GameState{
  const s=createGame();s.tick=tick;s.introOpen=false;s.paused=false;return s;
}
describe("WP5 optional local-only playtest protocol",()=>{
  it("is explicitly started, records active ticks and distinct paused vs self-annotated waiting/planning time",()=>{
    const started=startPlaytest(state(10),1000);
    expect(started.activeTicks).toBe(0);
    expect(started.wallMs).toBe(0);
    const planning=annotatePlaytest(started,"planning",2000);
    const next=advancePlaytest(planning,state(12),5000);
    expect(next.activeTicks).toBe(2);
    expect(next.wallMs).toBe(4000);
    expect(next.planningMs).toBe(3000);
    expect(next.waitingMs).toBe(0);
    expect(next.unclassifiedMs).toBe(1000);
    const paused=state(12);paused.paused=true;
    const entering=advancePlaytest(next,paused,6000);
    const after=advancePlaytest(entering,paused,9000);
    expect(after.pausedMs).toBe(3000);
    expect(after.wallMs).toBe(8000);
    const waiting=annotatePlaytest(after,"waiting",9000);
    const running=state(15);
    const elapsed=advancePlaytest(waiting,running,12000);
    expect(elapsed.waitingMs).toBe(0); // prior state remained paused
    const continued=advancePlaytest(elapsed,state(20),15000);
    expect(continued.waitingMs).toBe(3000);
    expect(continued.activeTicks).toBe(10);
  });
  it("includes already-used extraction deposits when playtest recording starts mid-campaign",()=>{
    const game=state(150);
    game.entities.push({id:2,kind:"iron_mine",x:2,y:2,direction:"E",output:null,belt:null,
      oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    game.entities.push({id:3,kind:"coal_mine",x:7,y:9,direction:"N",output:null,belt:null,
      oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    const recording=startPlaytest(game,4000);
    expect(recording.usedDeposits).toEqual(["iron:(2,2)","coal:(7,9)"]);
    expect(recording.commands.place).toBe(0);
  });
  it("counts successful commands only and keeps the actual event type",()=>{
    let s=startPlaytest(state(),100);
    s=recordPlaytestCommand(s,{kind:"place",entityKind:"furnace",x:5,y:5},200);
    s=recordPlaytestCommand(s,{kind:"turn",entityKind:"furnace",x:5,y:5},300);
    s=recordPlaytestCommand(s,{kind:"demolish",entityKind:"conveyor",x:4,y:5},400);
    s=recordPlaytestCommand(s,{kind:"research",technology:"coal_extraction"},500);
    expect(s.commands).toMatchObject({place:1,turn:1,demolish:1,research:1});
    expect(s.commandEvents.map(e=>e.kind)).toEqual(["place","turn","demolish","research"]);
    expect(s.commandEvents).toHaveLength(4);
    expect(s.usedDeposits).toEqual([]);
    s=recordPlaytestCommand(s,{kind:"place",entityKind:"iron_mine",x:2,y:2},600);
    expect(s.usedDeposits).toEqual(["iron:(2,2)"]);
  });
  it("preserves elapsed and command counters across reload without charging absent/offline wall time",()=>{
    let s=startPlaytest(state(20),1000);
    s=advancePlaytest(s,state(23),3000);
    s=recordPlaytestCommand(s,{kind:"turn",x:1,y:1},3100);
    const saved=JSON.parse(JSON.stringify(s)) as PlaytestSession;
    const resumed=resumePlaytest(saved,state(23),100000);
    expect(resumed.wallMs).toBe(s.wallMs);
    expect(resumed.activeTicks).toBe(3);
    expect(resumed.commands.turn).toBe(1);
    const more=advancePlaytest(resumed,state(25),102000);
    expect(more.wallMs).toBe(s.wallMs+2000);
    expect(more.activeTicks).toBe(5);
  });
  it("uses real diagnostic samples and mission transitions, not machine animation",()=>{
    let s=startPlaytest(state(0),1000);
    const next=state(1);
    next.mission.activeId="M6";
    next.diagnostics={samples:[{tick:1,entities:{"2":{status:"input_starved",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:0},
      "3":{status:"output_blocked",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:0}},terminalSales:{iron_ore:0,iron_ingot:0,coal:0,gear:0,steel:0}}]};
    s=advancePlaytest(s,next,2000);
    expect(s.missionTransitions).toEqual([{tick:1,from:"M1",to:"M6"}]);
    expect(s.inputStarvedEntityTicks).toBe(1);
    expect(s.outputBlockedEntityTicks).toBe(1);
    expect(advancePlaytest(s,next,2300).inputStarvedEntityTicks).toBe(1);
  });
  it("stops explicitly and produces a sanitized, exportable, local-only report",()=>{
    const s=finishPlaytest(startPlaytest(state(0),1000),state(5),5000);
    expect(s.active).toBe(false);
    const report=buildPlaytestReport(s);
    expect(report).toMatchObject({format:"sector-nine-playtest-v1",activeTicks:5,wallMs:4000,pausedMs:0});
    expect(JSON.stringify(report)).not.toMatch(/email|ipAddress|userAgent|deviceId/i);
  });
});
