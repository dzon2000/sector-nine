import {describe, expect, it} from "vitest";
import {createGame} from "../src/domain/model";
import {begin, setPause} from "../src/game/commands";
import {tick} from "../src/simulation/engine";
import {advancePlaytest, buildPlaytestReport, isPlaytestSession, resumePlaytest, startPlaytest} from "../src/ui/playtest";

describe("playtest speed measurements", () => {
  const running = setPause(begin(createGame()), false);

  it("records observed rate transitions, active wall time and engine ticks independently", () => {
    let session = startPlaytest(running, 1000, null, 1);
    session = advancePlaytest(session, running, 1750, 2);
    const afterTick = tick(running);
    session = advancePlaytest(session, afterTick, 2250, 2);
    session = advancePlaytest(session, afterTick, 2500, 2, true);
    session = advancePlaytest(session, setPause(afterTick, true), 6250, 1);
    session = advancePlaytest(session, afterTick, 7250, 1);
    session = advancePlaytest(session, afterTick, 7500, 1);
    expect(isPlaytestSession(session)).toBe(true);
    expect(buildPlaytestReport(session)).toMatchObject({
      wallMs: 6500, pausedMs: 4750, activeWallMs: 1750, activeTicks: 1,
      speedEvents: [
        {speed: 1, tick: 0, elapsedMs: 0},
        {speed: 2, tick: 0, elapsedMs: 750},
        {speed: 1, tick: 1, elapsedMs: 5250},
      ],
    });
  });

  it("resumes older recordings and excludes the gap between browser sessions", () => {
    const {activeWallMs, speedEvents, ...old} = startPlaytest(running, 1000);
    expect(isPlaytestSession(old)).toBe(true);
    const saved = {...old, wallMs: 1000, pausedMs: 250, activeTicks: 1};
    const resumed = resumePlaytest(saved, running, 9000);
    const session = advancePlaytest(resumed, running, 9400);
    expect(buildPlaytestReport(session)).toMatchObject({
      wallMs: 1400, activeWallMs: 1150, activeTicks: 1,
      speedEvents: [{speed: 1, tick: 0, elapsedMs: 1000}],
    });
    expect(isPlaytestSession({...session, speedEvents: [{speed: 3, tick: 0, elapsedMs: 1000}]})).toBe(false);
  });

  it("records the return to default speed when a new browser session starts", () => {
    const saved = advancePlaytest(startPlaytest(running, 1000), running, 2000, 2);
    const resumed = resumePlaytest(saved, running, 9000);
    expect(buildPlaytestReport(resumed)).toMatchObject({
      wallMs: 1000, activeWallMs: 1000, activeTicks: 0,
      speedEvents: [
        {speed: 1, tick: 0, elapsedMs: 0},
        {speed: 2, tick: 0, elapsedMs: 1000},
        {speed: 1, tick: 0, elapsedMs: 1000},
      ],
    });
  });
});
