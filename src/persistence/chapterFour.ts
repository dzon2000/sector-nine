import {
  CHAPTER_IV_MISSIONS, CHAPTER_IV_WINDOW_TICKS, chapterIVQualifies, summarizeChapterIVTicks,
} from "../domain/chapterFour";
import type {GameState} from "../domain/model";

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasFields(value: unknown, fields: readonly string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

export function assertChapterIVSave(state: GameState): void {
  const chapter = state.chapterIV;
  if (chapter === undefined) return;
  const archived = state.chapterIII;
  if (!hasFields(chapter, ["route","activeId","completed","activatedAtTick","ticks"]) ||
    !archived?.route || archived.completed.at(-1) !== "M13" || archived.active ||
    chapter.route !== archived.route ||
    !Array.isArray(chapter.completed) || chapter.completed.length > CHAPTER_IV_MISSIONS.length ||
    !CHAPTER_IV_MISSIONS.slice(0,chapter.completed.length).every((id,index) => id === chapter.completed[index]) ||
    chapter.activeId !== (CHAPTER_IV_MISSIONS[chapter.completed.length] ?? null) ||
    !count(chapter.activatedAtTick) || chapter.activatedAtTick > state.tick ||
    (chapter.completed.length > 0 && chapter.activatedAtTick < CHAPTER_IV_WINDOW_TICKS) ||
    !Array.isArray(chapter.ticks)) {
    throw Error("Invalid Chapter IV progression. Save preserved.");
  }
  if (!chapter.activeId) {
    if (chapter.ticks.length !== 0 || state.tick - chapter.activatedAtTick < CHAPTER_IV_WINDOW_TICKS) {
      throw Error("Invalid Chapter IV completion window. Save preserved.");
    }
    return;
  }
  const length = Math.min(state.tick - chapter.activatedAtTick, CHAPTER_IV_WINDOW_TICKS);
  const firstTick = state.tick - length + 1;
  if (chapter.ticks.length !== length) throw Error("Invalid Chapter IV window. Save preserved.");
  const salesByTick = new Map(state.diagnostics!.samples.map(sample => [sample.tick,sample.terminalSales]));
  const maximumUnits = state.width * state.height - 1;
  for (let index = 0; index < length; index++) {
    const sample = chapter.ticks[index];
    const expectedTick = firstTick + index;
    const sales = salesByTick.get(expectedTick);
    if (!hasFields(sample, ["tick","circuitSales","circuitProduced","gearSales","gearProduced"]) ||
      sample.tick !== expectedTick ||
      !count(sample.circuitSales) || !count(sample.gearSales) || sample.circuitSales + sample.gearSales > 1 ||
      !sales || sample.circuitSales !== sales.circuit || sample.gearSales !== sales.gear ||
      !count(sample.circuitProduced) || !count(sample.gearProduced) ||
      sample.circuitProduced + sample.gearProduced > maximumUnits) {
      throw Error("Invalid Chapter IV sample. Save preserved.");
    }
  }
  const summary = summarizeChapterIVTicks(chapter.ticks);
  if (summary.circuitProduced > state.materialLedger!.circuit.produced ||
    summary.gearProduced > state.materialLedger!.gear.produced ||
    (length === CHAPTER_IV_WINDOW_TICKS && chapterIVQualifies(chapter.activeId,summary))) {
    throw Error("Invalid Chapter IV window. Save preserved.");
  }
}
