// Shadow evaluator for owner review. The game never imports these candidate rules.
export interface Sample {
  tick: number;
  gearMade: number;
  gearSold: number;
  circuitMade: number;
  circuitSold: number;
}

interface Rule {
  ticks: number;
  windows: number;
  gears: number;
  circuits: number;
  gap: number;
}

const m16: Rule = { ticks: 30, windows: 1, gears: 5, circuits: 6, gap: 5 };
const recommended: Rule = { ticks: 30, windows: 2, gears: 9, circuits: 7, gap: 4 };

export const candidates = {
  m16,
  loose: { ...m16, windows: 2 },
  splitter: { ...recommended, gears: 6, gap: 3 },
  recommended,
  higherGear: { ...recommended, gears: 10 },
  longerHold: { ...recommended, windows: 3 },
};

export function summarize(samples: readonly Sample[], precedingDry = 0) {
  let gearMade = 0;
  let gearSold = 0;
  let circuitMade = 0;
  let circuitSold = 0;
  let trailingDry = precedingDry;
  let circuitGap = 0;

  for (const sample of samples) {
    gearMade += sample.gearMade;
    gearSold += sample.gearSold;
    circuitMade += sample.circuitMade;
    circuitSold += sample.circuitSold;
    trailingDry = sample.circuitSold > 0 ? 0 : trailingDry + 1;
    circuitGap = Math.max(circuitGap, trailingDry);
  }

  return { gearMade, gearSold, circuitMade, circuitSold, circuitGap, trailingDry };
}

export function assess(samples: readonly Sample[], rule: Rule) {
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].tick !== samples[i - 1].tick + 1) {
      throw new Error("Expected contiguous, post-activation tick evidence");
    }
  }
  let streak = 0;
  let bestStreak = 0;
  let completedAt: number | null = null;
  let dry = 0;
  const windows = [];
  for (let start = 0; start + rule.ticks <= samples.length; start += rule.ticks) {
    const window = samples.slice(start, start + rule.ticks);
    const totals = summarize(window, dry);
    dry = totals.trailingDry;
    const failed = [
      ...(totals.gearMade < rule.gears ? ["gear production"] : []),
      ...(totals.gearSold < rule.gears ? ["gear sales"] : []),
      ...(totals.circuitMade < rule.circuits ? ["circuit production"] : []),
      ...(totals.circuitSold < rule.circuits ? ["circuit sales"] : []),
      ...(totals.circuitGap > rule.gap ? ["circuit gap"] : []),
    ];
    streak = failed.length === 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    const end = window[window.length - 1].tick;
    if (completedAt === null && streak >= rule.windows) completedAt = end;
    windows.push({ end, ...totals, failed });
  }
  return { completedAt, bestStreak, windows };
}
