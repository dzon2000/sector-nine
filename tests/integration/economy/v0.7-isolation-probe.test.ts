import { describe, expect, it, vi } from "vitest";
import { DEFINITIONS, ITEMS, stockOnHand, type GameState } from "../../../src/domain/model";
import { beginChapterIV } from "../../../src/game/chapterFour";
import { face, place, remove, setPause, setSplitterMode, type CommandResult } from "../../../src/game/commands";
import independentCheckpoint from "../../../src/game/checkpoints/iv-independent.json";
import corporateCheckpoint from "../../../src/game/checkpoints/iv-corporate.json";
import { validateSave } from "../../../src/persistence/indexedDb";
import { tick } from "../../../src/simulation/engine";
import { createSimulationClock, type SimulationSpeed } from "../../../src/ui/simulationClock";
import { assess, candidates, summarize, type Sample } from "./v0.7-isolation-probe";

function apply(result: CommandResult): GameState {
  expect(result.ok, result.message).toBe(true);
  return result.state;
}

const tile = (x: number, y: number) => `${x},${y}`;

function entityAt(state: GameState, x: number, y: number) {
  const entity = state.entities.find(entity => entity.x === x && entity.y === y);
  if (!entity) throw new Error(`Missing entity at ${tile(x, y)}`);
  return entity;
}

function assertLocal(before: GameState, after: GameState, changed: string[]) {
  const layout = (state: GameState) => state.entities
    .filter(entity => !changed.includes(tile(entity.x, entity.y)))
    .map(({ id, x, y, kind, direction, splitterMode }) => ({ id, x, y, kind, direction, splitterMode }));
  expect(layout(after)).toEqual(layout(before));
}

function restore(state: GameState): GameState {
  const restored = validateSave(JSON.parse(JSON.stringify(state)));
  expect(restored).toEqual(state);
  return restored;
}

function conserve(state: GameState) {
  const stock = stockOnHand(state.entities);
  for (const item of ITEMS) {
    const { opening, produced, consumed, sold, demolished, burned } = state.materialLedger![item];
    expect(sold).toBe(state.sales[item]);
    expect(opening + produced - consumed - sold - demolished - burned).toBe(stock[item]);
  }
}

function changeMode(state: GameState, x: number, y: number, mode: "forward" | "clockwise") {
  const changed = apply(setSplitterMode(state, entityAt(state, x, y).id, mode));
  expect(changed.balanceCents).toBe(state.balanceCents);
  assertLocal(state, changed, [tile(x, y)]);
  return changed;
}

function observe(
  initial: GameState,
  ticks: number,
  options: {
    cadence?: SimulationSpeed;
    edits?: ReadonlyMap<number, (state: GameState) => GameState>;
  } = {},
) {
  let state = initial;
  let cashFloor = state.balanceCents;
  const samples: Sample[] = [];
  const step = () => {
    const edit = options.edits?.get(state.tick - initial.tick);
    const before = edit ? edit(state) : state;
    // Continuous probes use only free mode changes or orientation edits.
    expect(before.balanceCents).toBe(state.balanceCents);
    state = tick(before);
    const sample = state.diagnostics!.samples.at(-1)!;
    expect(sample.tick).toBe(before.tick + 1);
    expect(sample.tick).toBe(state.tick);
    let totalSales = 0;
    for (const item of ITEMS) {
      expect(sample.terminalSales[item]).toBe(state.sales[item] - before.sales[item]);
      totalSales += sample.terminalSales[item];
    }
    expect(totalSales).toBeLessThanOrEqual(1);
    const made = (item: "gear" | "circuit") =>
      state.materialLedger![item].produced - before.materialLedger![item].produced;
    samples.push({
      tick: state.tick,
      gearMade: made("gear"), gearSold: sample.terminalSales.gear,
      circuitMade: made("circuit"), circuitSold: sample.terminalSales.circuit,
    });
    const { revenueCents, costCents } = state.lastEvent;
    expect(state.balanceCents).toBe(before.balanceCents + revenueCents - costCents);
    cashFloor = Math.min(cashFloor, state.balanceCents);
  };
  let elapsedSeconds: number | undefined;
  if (options.cadence) {
    vi.useFakeTimers();
    const clock = createSimulationClock(step);
    try {
      const startedAt = Date.now();
      clock.update(true, options.cadence);
      for (let elapsed = 0; elapsed < ticks; elapsed++) vi.advanceTimersToNextTimer();
      elapsedSeconds = (Date.now() - startedAt) / 1000;
      clock.update(false, options.cadence);
      vi.advanceTimersByTime(60_000);
      expect(samples).toHaveLength(ticks);
    } finally {
      clock.dispose();
      vi.useRealTimers();
    }
  } else {
    for (let elapsed = 0; elapsed < ticks; elapsed++) step();
  }
  expect(state.balanceCents).toBe(initial.balanceCents + state.totalRevenueCents -
    initial.totalRevenueCents - (state.totalCostCents - initial.totalCostCents));
  conserve(state);
  return { state, samples, cashFloor, elapsedSeconds };
}

function until(state: GameState, ready: (state: GameState) => boolean, limit: number) {
  for (let elapsed = 0; elapsed < limit && !ready(state); elapsed++) state = tick(state);
  expect(ready(state)).toBe(true);
  return state;
}

function paidHandoff(route: "independent" | "corporate") {
  const checkpoint = validateSave(route === "independent" ? independentCheckpoint : corporateCheckpoint);
  const chapter = apply(beginChapterIV(setPause(checkpoint, false)));
  expect(chapter.chapterIV?.route).toBe(route);
  const m15 = until(chapter, state => state.chapterIV?.activeId === "M15", 30);
  expect(m15.tick - checkpoint.tick).toBe(30);
  const demolished = apply(remove(m15, entityAt(m15, 7, 1).id, true));
  const shipment = apply(place(demolished, "splitter", 7, 1, "N"));
  assertLocal(m15, shipment, ["7,1"]);
  expect(shipment.balanceCents - m15.balanceCents).toBe(-525);
  const batch = until(shipment, state => state.chapterIV!.copperShipmentTicks.length === 3, 40);
  expect(batch.tick - m15.tick).toBe(route === "independent" ? 34 : 29);
  const prioritized = changeMode(batch, 7, 1, "clockwise");
  const complete = until(prioritized, state => state.chapterIV!.completed.length === 2, 60);
  expect(complete.chapterIV).toMatchObject({ activeId: null, completed: ["M14", "M15"] });
  expect(complete.tick).toBe(route === "independent" ? 2201 : 2166);
  expect(complete.balanceCents).toBe(route === "independent" ? 838425 : 862265);
  conserve(complete);
  return restore(complete);
}

function orient(state: GameState, x: number, y: number, direction: "N" | "E") {
  const changed = apply(face(state, entityAt(state, x, y).id, direction));
  assertLocal(state, changed, [tile(x, y)]);
  return changed;
}

function mixedFactory(paid: GameState) {
  // Feed the lower assembler back to the existing western gear lane through a dogleg.
  const east = apply(place(paid, "conveyor", 2, 8, "N"));
  const north = apply(place(east, "conveyor", 2, 7, "W"));
  const mixed = orient(north, 1, 8, "E");
  const capital = 2 * DEFINITIONS.conveyor.price;
  expect(mixed.balanceCents).toBe(paid.balanceCents - capital);
  assertLocal(paid, mixed, ["1,8", "2,8", "2,7"]);
  conserve(mixed);
  return { state: restore(mixed), capital };
}

function convertSteel(state: GameState) {
  expect(entityAt(state, 3, 4).kind).toBe("advanced_furnace");
  const sold = apply(remove(state, entityAt(state, 3, 4).id, true));
  const changed = apply(place(sold, "assembler", 3, 4, "W"));
  const refund = sold.balanceCents - state.balanceCents;
  const capital = sold.balanceCents - changed.balanceCents;
  expect({ refund, capital }).toEqual({ refund: 13500, capital: 13000 });
  assertLocal(state, changed, ["3,4"]);
  conserve(changed);
  return { state: restore(changed), refund, capital };
}

function brief(samples: Sample[], rule: Parameters<typeof assess>[1], activation: number) {
  const { completedAt, bestStreak, windows } = assess(samples, rule);
  return { ticks: completedAt === null ? null : completedAt - activation, bestStreak,
    blocks: windows.map(({ gearMade, gearSold, circuitMade, circuitSold, circuitGap }) =>
      [gearMade, gearSold, circuitMade, circuitSold, circuitGap]) };
}

describe("v0.7 WP4 draft rules (headless only)", () => {
  it("requires complete, fresh contiguous tick evidence and checks both window edges", () => {
    const sampleAt = (index: number): Sample => ({
      tick: index + 1,
      gearMade: Number(index % 2 === 1), gearSold: Number(index % 2 === 1),
      circuitMade: Number(index % 2 === 0), circuitSold: Number(index % 2 === 0),
    });
    const samples = Array.from({ length: 120 }, (_, index) => sampleAt(index));
    samples[2].circuitSold = 0;
    samples[4].circuitSold = 0;
    expect(summarize(samples.slice(1, 31)).circuitGap).toBe(5);
    expect(summarize(samples.slice(0, 6)).circuitGap).toBe(5);
    expect(assess(samples.slice(0, 29), candidates.m16)).toMatchObject({ completedAt: null, bestStreak: 0 });
    expect(assess(samples.slice(0, 30), candidates.m16).completedAt).toBe(30);
    expect(() => assess([samples[0], samples[2]], candidates.m16)).toThrow(/contiguous/);
    const salesOnly = samples.map(sample => ({ ...sample, gearMade: 0, circuitMade: 0 }));
    const productionOnly = samples.map(sample => ({ ...sample, gearSold: 0, circuitSold: 0 }));
    expect(assess(salesOnly, candidates.m16).completedAt).toBeNull();
    expect(assess(productionOnly, candidates.m16).completedAt).toBeNull();
    expect(assess(salesOnly, candidates.recommended).completedAt).toBeNull();
    expect(assess(productionOnly, candidates.recommended).completedAt).toBeNull();

    // A drought on ticks 28–32 straddles the block boundary.
    const crossing = Array.from({ length: 120 }, (_, index) => sampleAt(index));
    crossing[28].circuitSold = 0;
    crossing[30].circuitSold = 0;
    expect(summarize(crossing.slice(0, 30)).circuitGap).toBe(3);
    expect(summarize(crossing.slice(30, 60)).circuitGap).toBe(2);
    const result = assess(crossing, candidates.recommended);
    expect(result.windows[1]).toMatchObject({ circuitGap: 5, failed: ["circuit gap"] });
    expect(result.completedAt).toBe(120);
    expect(assess(crossing.slice(0, 119), candidates.recommended).completedAt).toBeNull();
    expect(summarize(crossing.slice(60, 90), 30).circuitGap).toBe(1);
    expect(assess(crossing.slice(32, 91), candidates.recommended).completedAt).toBeNull();
    expect(assess(crossing.slice(32, 92), candidates.recommended).completedAt).toBe(92);
  });

  it("compares candidates, isolates one-sided faults, and recovers through paid factory layouts", () => {
    const independent = paidHandoff("independent");
    const corporate = paidHandoff("corporate");
    const mixed = mixedFactory(independent);
    const cases = [
      { name: "independent", state: independent, capital: 0 },
      { name: "corporate", state: corporate, capital: 0 },
      { name: "mixed", ...mixed },
    ];

    for (const { name, state, capital } of cases) {
      const untouched = observe(state, 240);
      const m16 = assess(untouched.samples, candidates.m16);
      expect(m16.completedAt).toBe(state.tick + 30);
      const m17Input = untouched.samples.slice(30);
      const startM17 = observe(state, 30).state;
      expect(m17Input[0].tick).toBe(startM17.tick + 1);
      expect(assess(m17Input, candidates.loose).completedAt).toBe(startM17.tick + 60);
      expect(assess(m17Input, candidates.recommended).completedAt).toBeNull();
      expect(assess(m17Input, candidates.splitter).completedAt)
        .toBe(name === "corporate" ? startM17.tick + 60 : null);
      const routing = (state: GameState) => changeMode(state, 8, 8, "clockwise");
      const rerouted = observe(startM17, 180, { edits: new Map([[0, routing]]) });
      const converted = convertSteel(startM17);
      const rebuilt = observe(converted.state, 180);
      expect(assess(rerouted.samples, candidates.splitter).completedAt)
        .toBe(startM17.tick + (name === "corporate" ? 60 : 90));
      expect(assess(rebuilt.samples, candidates.recommended).completedAt).toBe(startM17.tick + 90);
      expect(assess(rebuilt.samples, candidates.higherGear).completedAt).toBe(startM17.tick + 90);
      expect(assess(rebuilt.samples, candidates.longerHold).completedAt).toBe(startM17.tick + 120);
      // The prepared layout can qualify with no edit at every 30-tick alignment.
      for (let offset = 0; offset < 30; offset++) {
        const prepared = rebuilt.samples.slice(60 + offset);
        expect(assess(prepared, candidates.recommended).completedAt).toBe(prepared[0].tick + 59);
      }
      console.info("V07-WP4-CANDIDATES " + JSON.stringify({
        name, capital, handoff: { tick: state.tick, balance: state.balanceCents },
        m16: brief(untouched.samples.slice(0, 30), candidates.m16, state.tick),
        old: brief(m17Input, candidates.loose, startM17.tick),
        untouched: brief(m17Input, candidates.recommended, startM17.tick),
        noEditSplitter: brief(m17Input, candidates.splitter, startM17.tick),
        editedSplitter: brief(rerouted.samples, candidates.splitter, startM17.tick),
        converted: brief(rebuilt.samples, candidates.recommended, startM17.tick),
        higherGear: brief(rebuilt.samples, candidates.higherGear, startM17.tick).ticks,
        longerHold: brief(rebuilt.samples, candidates.longerHold, startM17.tick).ticks,
        preparedAcross30Alignments: 60,
        cashFloors: { untouched: untouched.cashFloor, atEdit: startM17.balanceCents,
          steelConversion: rebuilt.cashFloor },
        conversion: { capital: converted.capital, refund: converted.refund },
      }));

      const faults = [
        { name: "gear", damage: (state: GameState) => orient(state, 1, 7, "E"),
          fix: (state: GameState) => orient(state, 1, 7, "N") },
        { name: "circuit", damage: (state: GameState) => changeMode(state, 7, 1, "forward"),
          fix: (state: GameState) => changeMode(state, 7, 1, "clockwise") },
      ];
      for (const fault of faults) {
        const prepared = converted.state;
        const damaged = fault.damage(prepared);
        const drained = observe(damaged, 120);
        const stalled = observe(restore(drained.state), 180);
        const recovery = observe(restore(stalled.state), 180, { edits: new Map([[0, fault.fix]]) });
        const continued = [...drained.samples, ...stalled.samples, ...recovery.samples];
        const stalledResult = assess(continued.slice(0, 300), candidates.recommended);
        expect(stalledResult.completedAt).toBeNull();
        const drainedWindows = stalledResult.windows.slice(4);
        expect(drainedWindows).toHaveLength(6);
        expect(drainedWindows.every(window =>
          window.failed.length > 0 && window.failed.every(metric => metric.startsWith(fault.name)),
        )).toBe(true);
        const afterRepair = fault.name === "gear" ? 60 : 90;
        expect(assess(continued, candidates.recommended).completedAt).toBe(stalled.state.tick + afterRepair);
        console.info("V07-WP4-RECOVERY " + JSON.stringify({
          name, fault: fault.name, firstMeasuredTick: stalled.samples[0].tick,
          stalled: brief(stalled.samples, candidates.recommended, drained.state.tick),
          meters: brief(continued, candidates.recommended, prepared.tick),
          recovery: brief(recovery.samples, candidates.recommended, stalled.state.tick),
          cashFloors: [drained.cashFloor, stalled.cashFloor, recovery.cashFloor],
        }));
      }

      const edits = new Map([[0, faults[0].damage], [65, faults[0].fix]]);
      const normal = observe(converted.state, 180, { cadence: 1, edits });
      const fast = observe(converted.state, 180, { cadence: 2, edits });
      expect(normal.elapsedSeconds).toBe(180);
      expect(fast.elapsedSeconds).toBe(90);
      const normalHold = assess(normal.samples, candidates.recommended);
      expect(normalHold.completedAt).not.toBeNull();
      expect(normalHold.completedAt!).toBeGreaterThan(startM17.tick + 65);
      expect(assess(fast.samples, candidates.recommended)).toEqual(normalHold);
      expect(fast.samples).toEqual(normal.samples);
      expect(fast.state).toEqual(normal.state);
      const paused = setPause(normal.state, true);
      expect(tick(paused)).toEqual(paused);
      expect(tick(restore(normal.state))).toEqual(tick(normal.state));
    }
  }, 45_000);
});
