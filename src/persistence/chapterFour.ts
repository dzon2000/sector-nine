import {
  CHAPTER_IV_MISSIONS, CHAPTER_IV_WINDOW_TICKS, chapterIVQualifies, summarizeChapterIVTicks,
  type ChapterIVTick,
} from "../domain/chapterFour";
import {DIAGNOSTIC_HISTORY_TICKS, type GameState} from "../domain/model";

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
  if (!hasFields(chapter, ["route","activeId","completed","completedWindows","activatedAtTick","ticks"]) ||
    !archived?.route || archived.completed.at(-1) !== "M13" || archived.active ||
    chapter.route !== archived.route ||
    !Array.isArray(chapter.completed) || chapter.completed.length > CHAPTER_IV_MISSIONS.length ||
    !CHAPTER_IV_MISSIONS.slice(0,chapter.completed.length).every((id,index) => id === chapter.completed[index]) ||
    !Array.isArray(chapter.completedWindows) || chapter.completedWindows.length !== chapter.completed.length ||
    chapter.activeId !== (CHAPTER_IV_MISSIONS[chapter.completed.length] ?? null) ||
    !count(chapter.activatedAtTick) || chapter.activatedAtTick > state.tick ||
    !Array.isArray(chapter.ticks)) {
    throw Error("Invalid Chapter IV progression. Save preserved.");
  }

  const diagnosticsByTick = new Map(state.diagnostics!.samples.map(sample => [sample.tick,sample]));
  const maximumUnits = state.width * state.height - 1;
  const evidence = {circuitProduced:0, gearProduced:0, circuitSales:0, gearSales:0};
  function validateWindow(ticks: ChapterIVTick[], firstTick: number) {
    for (let index = 0; index < ticks.length; index++) {
      const sample = ticks[index];
      const expectedTick = firstTick + index;
      const diagnostic = diagnosticsByTick.get(expectedTick);
      if (!hasFields(sample, ["tick","circuitSales","circuitProduced","gearSales","gearProduced"]) ||
        sample.tick !== expectedTick ||
        !count(sample.circuitSales) || !count(sample.gearSales) || sample.circuitSales + sample.gearSales > 1 ||
        !count(sample.circuitProduced) || !count(sample.gearProduced) ||
        sample.circuitProduced + sample.gearProduced > maximumUnits ||
        (expectedTick > state.tick - DIAGNOSTIC_HISTORY_TICKS && !diagnostic) ||
        (diagnostic && (sample.circuitSales !== diagnostic.terminalSales.circuit ||
          sample.gearSales !== diagnostic.terminalSales.gear ||
          sample.circuitProduced !== diagnostic.chapterIVProduction?.circuit ||
          sample.gearProduced !== diagnostic.chapterIVProduction?.gear))) {
        throw Error("Invalid Chapter IV sample. Save preserved.");
      }
      evidence.circuitProduced += sample.circuitProduced;
      evidence.gearProduced += sample.gearProduced;
      evidence.circuitSales += sample.circuitSales;
      evidence.gearSales += sample.gearSales;
    }
  }

  let completedAtTick = 0;
  for (let index = 0; index < chapter.completedWindows.length; index++) {
    const ticks = chapter.completedWindows[index];
    const firstTick = ticks?.[0]?.tick;
    if (!Array.isArray(ticks) || ticks.length !== CHAPTER_IV_WINDOW_TICKS || !count(firstTick) ||
      firstTick <= completedAtTick || firstTick + ticks.length - 1 > state.tick ||
      (index === 0 && firstTick + ticks.length - 1 !== chapter.activatedAtTick)) {
      throw Error("Invalid Chapter IV completion window. Save preserved.");
    }
    validateWindow(ticks, firstTick);
    if (!chapterIVQualifies(CHAPTER_IV_MISSIONS[index],summarizeChapterIVTicks(ticks))) {
      throw Error("Invalid Chapter IV completion evidence. Save preserved.");
    }
    completedAtTick = firstTick + ticks.length - 1;
  }

  const length = chapter.activeId ? Math.min(state.tick - chapter.activatedAtTick, CHAPTER_IV_WINDOW_TICKS) : 0;
  if (chapter.ticks.length !== length) throw Error("Invalid Chapter IV window. Save preserved.");
  validateWindow(chapter.ticks, state.tick - length + 1);
  const ledger = state.materialLedger!;
  if (evidence.circuitProduced > ledger.circuit.produced || evidence.gearProduced > ledger.gear.produced ||
    evidence.circuitSales > ledger.circuit.sold || evidence.gearSales > ledger.gear.sold ||
    (chapter.activeId && length === CHAPTER_IV_WINDOW_TICKS &&
      chapterIVQualifies(chapter.activeId,summarizeChapterIVTicks(chapter.ticks)))) {
    throw Error("Invalid Chapter IV window. Save preserved.");
  }
}
