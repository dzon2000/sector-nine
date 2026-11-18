import {
  CHAPTER_III_CONTRACTS, CHAPTER_III_PRODUCTS, CHAPTER_III_ROUTES, CONTRACT_STREAK_WINDOWS, CONTRACT_WINDOW_TICKS,
  contractQualifies, summarizeContractTicks, type ContractTick
} from "../domain/contracts";
import type {GameState} from "../domain/model";

function invalidChapterIII():never {
  throw Error("Invalid Chapter III progress. Save preserved.");
}

function hasFields(value:unknown,fields:readonly string[]):boolean {
  return value!==null && typeof value==="object" && !Array.isArray(value) &&
    Object.keys(value).length===fields.length && fields.every(field=>Object.hasOwn(value,field));
}

function isNonnegativeInteger(value:number):boolean {
  return Number.isSafeInteger(value) && value>=0;
}

function validObservation(event:ContractTick,expectedTick:number,maximumUnits:number):boolean {
  return hasFields(event,["tick","sold","produced","demandCovered","coalBurned","profitCents"]) &&
    event.tick===expectedTick && typeof event.demandCovered==="boolean" &&
    isNonnegativeInteger(event.coalBurned) && event.coalBurned<=maximumUnits &&
    Number.isSafeInteger(event.profitCents) &&
    hasFields(event.sold,CHAPTER_III_PRODUCTS) && hasFields(event.produced,CHAPTER_III_PRODUCTS) &&
    CHAPTER_III_PRODUCTS.every(item=>isNonnegativeInteger(event.sold[item]) &&
      isNonnegativeInteger(event.produced[item]) && event.produced[item]<=maximumUnits) &&
    CHAPTER_III_PRODUCTS.reduce((sum,item)=>sum+event.sold[item],0)<=1;
}

/** Validate the optional Chapter III extension of the current save format. */
export function assertChapterIIISave(state:GameState):void {
  const chapter=state.chapterIII;
  if(chapter===undefined)return;
  if(!hasFields(chapter,["route","completed","active"]) ||
    state.mission.activeId!=="DONE" || state.chapterII?.completed!==true ||
    (chapter.route!==null && !CHAPTER_III_ROUTES.includes(chapter.route)) ||
    !Array.isArray(chapter.completed) || chapter.completed.length>CHAPTER_III_CONTRACTS.length ||
    !CHAPTER_III_CONTRACTS.slice(0,chapter.completed.length)
      .every((id,index)=>chapter.completed[index]===id) ||
    (chapter.completed.length===0 && chapter.route!==null) ||
    (chapter.completed.length>=2 && chapter.route===null))invalidChapterIII();

  const active=chapter.active;
  if(active===null)return;
  if(!hasFields(active,["id","activatedAtTick","ticks","streakTicks"]) ||
    chapter.completed.length===CHAPTER_III_CONTRACTS.length ||
    active.id!==CHAPTER_III_CONTRACTS[chapter.completed.length] ||
    (active.id==="M12" && chapter.route===null) ||
    !isNonnegativeInteger(active.activatedAtTick) || active.activatedAtTick>state.tick ||
    !isNonnegativeInteger(active.streakTicks) || active.streakTicks>=CONTRACT_STREAK_WINDOWS ||
    !Array.isArray(active.ticks))invalidChapterIII();

  const elapsed=state.tick-active.activatedAtTick;
  const windowLength=Math.min(elapsed,CONTRACT_WINDOW_TICKS);
  const possibleWindows=Math.max(0,elapsed-CONTRACT_WINDOW_TICKS+1);
  if(active.ticks.length!==windowLength || active.streakTicks>possibleWindows)invalidChapterIII();

  const salesByTick=new Map(state.diagnostics!.samples.map(sample=>[sample.tick,sample.terminalSales]));
  const accountsByTick=new Map(state.rollingEvents.map(event=>[event.tick,event]));
  const powerByTick=new Map(state.power?.history.map(event=>[event.tick,event]));
  for(let index=0;index<windowLength;index++){
    const event=active.ticks[index];
    const expectedTick=state.tick-windowLength+1+index;
    if(!validObservation(event,expectedTick,state.width*state.height-1))invalidChapterIII();

    const sales=salesByTick.get(expectedTick);
    const account=accountsByTick.get(expectedTick);
    const power=powerByTick.get(expectedTick);
    if(!sales || CHAPTER_III_PRODUCTS.some(item=>event.sold[item]!==sales[item]) ||
      !account || event.profitCents!==account.revenueCents-account.costCents ||
      event.demandCovered!==(power?.demandCovered??false) ||
      event.coalBurned!==(power?.coalBurned??0))invalidChapterIII();
  }

  const window=summarizeContractTicks(active.ticks);
  if(CHAPTER_III_PRODUCTS.some(item=>window.produced[item]>state.materialLedger![item].produced) ||
    !Number.isSafeInteger(window.profitCents))invalidChapterIII();
  const qualifies=windowLength===CONTRACT_WINDOW_TICKS && contractQualifies(active.id,chapter.route,window);
  if(qualifies!==(active.streakTicks>0))invalidChapterIII();
}
