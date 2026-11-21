import {
  CHAPTER_IV_COPPER_SALES, CHAPTER_IV_EVIDENCE_VERSION, CHAPTER_IV_MISSIONS, CHAPTER_IV_WINDOW_TICKS,
  chapterIVQualifies, chapterIVWindowBoundary, summarizeChapterIVTicks,
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
  const proof = state.chapterIVEvidence;
  if (chapter === undefined && proof === undefined) return;
  if (chapter === undefined) {
    throw Error("Missing Chapter IV progression. Save preserved.");
  }
  if (proof?.version !== CHAPTER_IV_EVIDENCE_VERSION) {
    throw Error("Unsupported Chapter IV save evidence. Start a new game to continue. Save preserved.");
  }
  const archived = state.chapterIII;
  if (!hasFields(chapter, ["route","activeId","completed","completedWindows","activatedAtTick","copperShipmentTicks","ticks"]) ||
    !archived?.route || archived.completed.at(-1) !== "M13" || archived.active ||
    chapter.route !== archived.route ||
    !Array.isArray(chapter.completed) || chapter.completed.length > CHAPTER_IV_MISSIONS.length ||
    !CHAPTER_IV_MISSIONS.slice(0,chapter.completed.length).every((id,index) => id === chapter.completed[index]) ||
    !Array.isArray(chapter.completedWindows) || chapter.completedWindows.length !== chapter.completed.length ||
    chapter.activeId !== (CHAPTER_IV_MISSIONS[chapter.completed.length] ?? null) ||
    !count(chapter.activatedAtTick) || chapter.activatedAtTick > state.tick ||
    !Array.isArray(chapter.ticks) ||
    !hasFields(proof, ["version","startedAtTick","copperShipmentTicks","completions"]) ||
    !count(proof.startedAtTick) || proof.startedAtTick > chapter.activatedAtTick ||
    !Array.isArray(proof.completions) || proof.completions.length !== chapter.completed.length ||
    (!chapter.completed.length && proof.startedAtTick !== chapter.activatedAtTick) ||
    !Array.isArray(chapter.copperShipmentTicks) || chapter.copperShipmentTicks.length > CHAPTER_IV_COPPER_SALES ||
    !Array.isArray(proof.copperShipmentTicks) || proof.copperShipmentTicks.length !== chapter.copperShipmentTicks.length ||
    (!chapter.completed.length && chapter.copperShipmentTicks.length > 0) ||
    (chapter.completed.length === 2 && chapter.copperShipmentTicks.length !== CHAPTER_IV_COPPER_SALES)) {
    throw Error("Invalid Chapter IV progression. Save preserved.");
  }

  const diagnosticsByTick = new Map(state.diagnostics!.samples.map(sample => [sample.tick,sample]));
  let previousShipmentTick = chapter.activatedAtTick;
  for (const [index,tick] of chapter.copperShipmentTicks.entries()) {
    if (!count(tick) || tick <= previousShipmentTick || tick > state.tick || tick !== proof.copperShipmentTicks[index]) {
      throw Error("Invalid Chapter IV copper shipment evidence. Save preserved.");
    }
    previousShipmentTick = tick;
  }
  const shipmentBoundary = chapter.copperShipmentTicks[CHAPTER_IV_COPPER_SALES - 1];
  const shipmentTicks = new Set(chapter.copperShipmentTicks);
  const maximumUnits = state.width * state.height - 1;
  const evidence = {circuitProduced:0, gearProduced:0, circuitSales:0, gearSales:0, copperSales:chapter.copperShipmentTicks.length};
  function validateWindow(ticks: ChapterIVTick[], firstTick: number) {
    for (let index = 0; index < ticks.length; index++) {
      const sample = ticks[index];
      const expectedTick = firstTick + index;
      const diagnostic = diagnosticsByTick.get(expectedTick);
      if (!hasFields(sample, ["tick","circuitSales","circuitProduced","gearSales","gearProduced","copperSales"]) ||
        sample.tick !== expectedTick ||
        !count(sample.circuitSales) || !count(sample.gearSales) || !count(sample.copperSales) ||
        sample.circuitSales + sample.gearSales + sample.copperSales > 1 ||
        !count(sample.circuitProduced) || !count(sample.gearProduced) ||
        sample.circuitProduced + sample.gearProduced > maximumUnits ||
        (expectedTick > state.tick - DIAGNOSTIC_HISTORY_TICKS && !diagnostic) ||
        (diagnostic && (sample.circuitSales !== diagnostic.terminalSales.circuit ||
          sample.gearSales !== diagnostic.terminalSales.gear ||
          sample.copperSales !== diagnostic.terminalSales.copper_ore ||
          sample.circuitProduced !== diagnostic.chapterIVProduction?.circuit ||
          sample.gearProduced !== diagnostic.chapterIVProduction?.gear))) {
        throw Error("Invalid Chapter IV sample. Save preserved.");
      }
      evidence.circuitProduced += sample.circuitProduced;
      evidence.gearProduced += sample.gearProduced;
      evidence.circuitSales += sample.circuitSales;
      evidence.gearSales += sample.gearSales;
      evidence.copperSales += sample.copperSales;
    }
  }

  let completedAtTick = proof.startedAtTick;
  for (let index = 0; index < chapter.completedWindows.length; index++) {
    const ticks = chapter.completedWindows[index];
    const firstTick = ticks?.[0]?.tick;
    if (!Array.isArray(ticks) || ticks.length !== CHAPTER_IV_WINDOW_TICKS || !count(firstTick) ||
      firstTick <= completedAtTick || firstTick + ticks.length - 1 > state.tick ||
      (index === 0 && firstTick + ticks.length - 1 !== chapter.activatedAtTick) ||
      (index === 1 && (shipmentBoundary === undefined || firstTick <= shipmentBoundary))) {
      throw Error("Invalid Chapter IV completion window. Save preserved.");
    }
    validateWindow(ticks, firstTick);
    completedAtTick = firstTick + ticks.length - 1;
    const completion = proof.completions[index];
    if (!hasFields(completion, ["tick","samples"]) || completion.tick !== completedAtTick ||
      !Array.isArray(completion.samples) || completion.samples.length !== ticks.length ||
      !ticks.every((sample, position) => {
        const physical = completion.samples[position];
        return Array.isArray(physical) && physical.length === 5 &&
          physical[0] === sample.circuitSales && physical[1] === sample.circuitProduced &&
          physical[2] === sample.gearSales && physical[3] === sample.gearProduced &&
          physical[4] === sample.copperSales;
      }) || !chapterIVQualifies(CHAPTER_IV_MISSIONS[index],summarizeChapterIVTicks(ticks))) {
      throw Error("Invalid Chapter IV completion evidence. Save preserved.");
    }
  }

  const producerTrackingEnd = chapter.activeId ? state.tick : completedAtTick;
  const firstRecentTick = Math.max(proof.startedAtTick + 1, state.tick - DIAGNOSTIC_HISTORY_TICKS + 1);
  for (let tick = firstRecentTick; tick <= producerTrackingEnd; tick++) {
    if (!diagnosticsByTick.has(tick)) throw Error("Missing Chapter IV diagnostic history. Save preserved.");
  }
  for (const sample of diagnosticsByTick.values()) {
    const tracking = sample.tick > proof.startedAtTick && sample.tick <= producerTrackingEnd;
    if (tracking !== (sample.chapterIVProduction !== undefined)) {
      throw Error("Invalid Chapter IV diagnostic interval. Save preserved.");
    }
    const shipping = chapter.completed.length > 0 && sample.tick > chapter.activatedAtTick &&
      sample.tick <= (shipmentBoundary ?? state.tick);
    if (shipping && sample.terminalSales.copper_ore !== Number(shipmentTicks.has(sample.tick))) {
      throw Error("Invalid Chapter IV copper shipment. Save preserved.");
    }
  }

  const boundary = chapterIVWindowBoundary(chapter);
  const length = chapter.activeId && boundary !== undefined ? Math.min(state.tick - boundary, CHAPTER_IV_WINDOW_TICKS) : 0;
  if (chapter.ticks.length !== length) throw Error("Invalid Chapter IV window. Save preserved.");
  validateWindow(chapter.ticks, state.tick - length + 1);
  const ledger = state.materialLedger!;
  if (evidence.circuitProduced > ledger.circuit.produced || evidence.gearProduced > ledger.gear.produced ||
    evidence.circuitSales > ledger.circuit.sold || evidence.gearSales > ledger.gear.sold || evidence.copperSales > ledger.copper_ore.sold ||
    (chapter.activeId && length === CHAPTER_IV_WINDOW_TICKS &&
      chapterIVQualifies(chapter.activeId,summarizeChapterIVTicks(chapter.ticks)))) {
    throw Error("Invalid Chapter IV window. Save preserved.");
  }
}
