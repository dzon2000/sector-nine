import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createGame} from "../src/domain/model";
import {begin, place, setPause} from "../src/game/commands";
import {validateSave} from "../src/persistence/indexedDb";
import {tick} from "../src/simulation/engine";
import {createSimulationClock, type SimulationSpeed} from "../src/ui/simulationClock";

describe("simulation clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([[1, 1000], [2, 500]] as const)("runs exactly 60 ticks at %i×", (speed, interval) => {
    const onTick = vi.fn();
    const clock = createSimulationClock(onTick);
    clock.update(true, speed);
    vi.advanceTimersByTime(60 * interval - 1);
    expect(onTick).toHaveBeenCalledTimes(59);
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(60);
    clock.dispose();
  });

  it("schedules a full interval when switching and resuming without leaving a queued tick", () => {
    const onTick = vi.fn();
    const clock = createSimulationClock(onTick);
    clock.update(true, 1);
    vi.advanceTimersByTime(900);
    clock.update(true, 2);
    vi.advanceTimersByTime(499);
    expect(onTick).not.toHaveBeenCalled();
    // Commands can publish state without shifting the next tick.
    clock.update(true, 2);
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.update(false, 2);
    vi.advanceTimersByTime(60_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.update(true, 2);
    vi.advanceTimersByTime(499);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(2);
    clock.update(true, 1);
    vi.advanceTimersByTime(999);
    expect(onTick).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(3);
    clock.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("replays paid commands and current-version restoration identically at 1×, 2× and mixed rates", () => {
    function replay(speedAt: (boundary: number) => SimulationSpeed, restore: boolean) {
      let state = setPause(begin(createGame()), false);
      const events: Array<[number, string]> = [];
      const clock = createSimulationClock(() => {
        const previousMission = state.mission.activeId;
        state = tick(state);
        if (state.mission.activeId !== previousMission) events.push([state.tick, state.mission.activeId]);
      });
      const mine = place(state, "iron_mine", 3, 5, "E");
      expect(mine.ok).toBe(true);
      state = mine.state;
      for (let boundary = 0; boundary < 150; boundary++) {
        if (boundary >= 5 && boundary <= 10) {
          const belt = place(state, "conveyor", boundary - 1, 5, "E");
          expect(belt.ok).toBe(true);
          state = belt.state;
        }
        if (boundary === 55 && restore) state = validateSave(JSON.parse(JSON.stringify(state)));
        const speed = speedAt(boundary);
        clock.update(true, speed);
        vi.advanceTimersByTime(1000 / speed);
      }
      clock.dispose();
      return {state, events};
    }
    const baseline = replay(() => 1, false);
    expect(baseline.state.tick).toBe(150);
    expect(baseline.events.length).toBeGreaterThan(0);
    expect(replay(() => 2, true)).toEqual(baseline);
    expect(replay(boundary => boundary % 15 < 8 ? 1 : 2, true)).toEqual(baseline);
  });
});
