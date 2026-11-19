import type {ChapterIIIRoute} from "./contracts";

export const CHAPTER_IV_MISSIONS = ["M14", "M15"] as const;
export type ChapterIVMissionId = typeof CHAPTER_IV_MISSIONS[number];
export const CHAPTER_IV_WINDOW_TICKS = 30;
export const CHAPTER_IV_EVIDENCE_VERSION = 1;

interface ChapterIVWindow {
  circuitSales: number;
  circuitProduced: number;
  maxCircuitGap: number;
  gearSales: number;
  gearProduced: number;
}

export const CHAPTER_IV_GOALS: Readonly<Record<ChapterIVMissionId, Readonly<ChapterIVWindow>>> = {
  M14: {circuitSales: 6, circuitProduced: 6, maxCircuitGap: 5, gearSales: 0, gearProduced: 0},
  M15: {circuitSales: 6, circuitProduced: 6, maxCircuitGap: 5, gearSales: 5, gearProduced: 5},
};

export interface ChapterIVTick extends Omit<ChapterIVWindow, "maxCircuitGap"> {
  tick: number;
}

export interface ChapterIVState {
  route: ChapterIIIRoute;
  activeId: ChapterIVMissionId | null;
  completed: ChapterIVMissionId[];
  completedWindows: ChapterIVTick[][];
  activatedAtTick: number;
  ticks: ChapterIVTick[];
}

export interface ChapterIVEvidence {
  version: typeof CHAPTER_IV_EVIDENCE_VERSION;
  startedAtTick: number;
  completions: {
    tick: number;
    samples: [circuitSales: number, circuitProduced: number, gearSales: number, gearProduced: number][];
  }[];
}

export function summarizeChapterIVTicks(ticks: readonly ChapterIVTick[]): ChapterIVWindow {
  const summary = {circuitSales: 0, circuitProduced: 0, maxCircuitGap: 0, gearSales: 0, gearProduced: 0};
  let gap = 0;
  for (const sample of ticks) {
    gap = sample.circuitSales > 0 ? 0 : gap + 1;
    summary.maxCircuitGap = Math.max(summary.maxCircuitGap, gap);
    summary.circuitSales += sample.circuitSales;
    summary.circuitProduced += sample.circuitProduced;
    summary.gearSales += sample.gearSales;
    summary.gearProduced += sample.gearProduced;
  }
  return summary;
}

export function chapterIVQualifies(id: ChapterIVMissionId, window: ChapterIVWindow): boolean {
  const goal = CHAPTER_IV_GOALS[id];
  return window.circuitSales >= goal.circuitSales && window.circuitProduced >= goal.circuitProduced &&
    window.maxCircuitGap <= goal.maxCircuitGap &&
    window.gearSales >= goal.gearSales && window.gearProduced >= goal.gearProduced;
}
