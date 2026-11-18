import {
  CHAPTER_IV_MISSIONS, CHAPTER_IV_WINDOW_TICKS, chapterIVQualifies, summarizeChapterIVTicks,
} from "../domain/chapterFour";
import type {GameState} from "../domain/model";

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertChapterIVSave(state: GameState): void {
  const chapter = state.chapterIV;
  if (chapter === undefined) return;
  const archived = state.chapterIII;
  if (!chapter || typeof chapter !== "object" || Array.isArray(chapter) ||
    !archived?.route || archived.completed.at(-1) !== "M13" || archived.active ||
    chapter.route !== archived.route ||
    !Array.isArray(chapter.completed) || chapter.completed.length > CHAPTER_IV_MISSIONS.length ||
    chapter.completed.some((id, index) => id !== CHAPTER_IV_MISSIONS[index]) ||
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
  if (chapter.ticks.length !== length || chapter.ticks.some((sample, index) =>
    !sample || typeof sample !== "object" || Array.isArray(sample) || sample.tick !== firstTick + index ||
    !count(sample.circuitSales) || !count(sample.circuitProduced) ||
    !count(sample.gearSales) || !count(sample.gearProduced)
  ) || (length === CHAPTER_IV_WINDOW_TICKS && chapterIVQualifies(chapter.activeId, summarizeChapterIVTicks(chapter.ticks)))) {
    throw Error("Invalid Chapter IV window. Save preserved.");
  }
}
