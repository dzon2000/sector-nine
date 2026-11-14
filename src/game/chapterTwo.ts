import {emptySales,type GameState,type Item,type ChapterMetrics} from "../domain/model";

export type ChapterCommandResult={ok:boolean;message:string;state:GameState};

export function newChapterMetrics(activatedAtTick:number):ChapterMetrics {
  return {activatedAtTick,salesTicks:[],streakTicks:0,totals:emptySales()};
}

/** Chapter I completion is a durable achievement, independent from active mission. */
export function beginChapterII(state:GameState):ChapterCommandResult {
  if(state.mission.activeId!=="DONE" || state.chapterII?.started ||
    state.chapterII?.completed || !state.technologies?.advanced_smelting ||
    !state.technologies?.mechanical_components || !state.technologies?.coal_extraction)
    return {ok:false,message:"Complete Chapter I before starting Chapter II.",state};
  const s=structuredClone(state);
  s.schemaVersion=4;
  s.missionRuleVersion=4;
  s.chapterII={foundryCompleted:true,started:true,completed:false,storySeen:false,
    metrics:newChapterMetrics(s.tick)};
  s.mission.activeId="M8";
  s.technologies={...s.technologies,resource_surveying:s.technologies?.resource_surveying??false,
    circuit_fabrication:s.technologies?.circuit_fabrication??false,
    industrial_power:s.technologies?.industrial_power??false};
  return {ok:true,message:"Chapter II started: Unregistered Materials.",state:s};
}

/** Mutates the owned tick snapshot; caller must advance tick first. */
export function recordChapterTick(state:GameState, sales:Readonly<Record<Item,number>>,
  producedCircuits:number, demandCovered:boolean):void {
  if(state.missionRuleVersion!==4 || !["M8","M9","M10"].includes(state.mission.activeId))return;
  const metrics=state.chapterII?.metrics;
  if(!metrics || state.tick<=metrics.activatedAtTick)return;
  const event={tick:state.tick,sales:{...sales},producedCircuits,demandCovered};
  metrics.salesTicks.push(event);
  if(metrics.salesTicks.length>60)metrics.salesTicks.shift();
  metrics.totals??=emptySales();
  for(const item of Object.keys(metrics.totals) as Item[])metrics.totals[item]+=sales[item];
}

export function chapterWindow(state:GameState):{
  sales:Record<Item,number>;producedCircuits:number;coveredTicks:number
}|null {
  if(state.missionRuleVersion!==4||state.mission.activeId!=="M10")return null;
  const metrics=state.chapterII?.metrics;
  if(!metrics||metrics.salesTicks.length!==60)return null;
  const first=state.tick-59;
  if(first<=metrics.activatedAtTick||metrics.salesTicks[0]?.tick!==first||
    metrics.salesTicks.some((event,i)=>event.tick!==first+i))return null;
  const sales=emptySales();
  let producedCircuits=0,coveredTicks=0;
  for(const event of metrics.salesTicks){
    for(const item of Object.keys(sales) as Item[])sales[item]+=event.sales[item];
    producedCircuits+=event.producedCircuits;
    if(event.demandCovered)coveredTicks++;
  }
  return {sales,producedCircuits,coveredTicks};
}
