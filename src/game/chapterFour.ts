import {
  CHAPTER_IV_EVIDENCE_VERSION, CHAPTER_IV_WINDOW_TICKS, chapterIVQualifies, summarizeChapterIVTicks, type ChapterIVTick,
} from "../domain/chapterFour";
import type {GameState} from "../domain/model";
import type {ChapterCommandResult} from "./chapterTwo";

export function isChapterIVAvailable(state: GameState): boolean {
  const chapter = state.chapterIII;
  return !state.chapterIV && !state.chapterIVEvidence && !!chapter?.route && chapter.completed.at(-1) === "M13" && !chapter.active;
}

export function beginChapterIV(state: GameState): ChapterCommandResult {
  const route = state.chapterIII?.route;
  if (!route || !isChapterIVAvailable(state)) {
    return {ok: false, message: "Chapter IV is unavailable or already started.", state};
  }
  const next = structuredClone(state);
  next.chapterIVEvidence = {version: CHAPTER_IV_EVIDENCE_VERSION, startedAtTick: state.tick, completions: []};
  next.chapterIV = {route, activeId: "M14", completed: [], completedWindows: [], activatedAtTick: state.tick, ticks: []};
  return {ok: true, message: "Chapter IV started: The Return Signal.", state: next};
}

export function currentChapterIVWindow(state: GameState) {
  const chapter = state.chapterIV;
  if (!chapter?.activeId || chapter.ticks.length !== CHAPTER_IV_WINDOW_TICKS) return null;
  const first = state.tick - CHAPTER_IV_WINDOW_TICKS + 1;
  if (first <= chapter.activatedAtTick || chapter.ticks.some((sample, index) => sample.tick !== first + index)) {
    return null;
  }
  return summarizeChapterIVTicks(chapter.ticks);
}

/** Record one engine-owned tick. An activation boundary belongs to the previous mission. */
export function recordChapterIVTick(state: GameState, sample: ChapterIVTick): boolean {
  const chapter = state.chapterIV;
  if (!chapter?.activeId || state.paused || sample.tick !== state.tick) return false;
  const previousTick = chapter.ticks.at(-1)?.tick ?? chapter.activatedAtTick;
  if (sample.tick !== previousTick + 1) return false;

  chapter.ticks.push(sample);
  if (chapter.ticks.length > CHAPTER_IV_WINDOW_TICKS) chapter.ticks.shift();
  const window = currentChapterIVWindow(state);
  if (!window || !chapterIVQualifies(chapter.activeId, window)) return false;

  chapter.completed.push(chapter.activeId);
  chapter.completedWindows.push(chapter.ticks);
  if (chapter.activeId === "M14") {
    chapter.activeId = "M15";
    chapter.activatedAtTick = state.tick;
  } else {
    chapter.activeId = null;
  }
  chapter.ticks = [];
  return true;
}
