import {emptySales,type GameState,type Item,type MissionMetrics} from "../domain/model";

/** Start a fresh mission-local measurement epoch after its activation tick. */
export function activateMissionMetrics(activatedAtTick:number):MissionMetrics {
  return {activatedAtTick,salesTicks:[],streakTicks:0};
}

/** Record one complete active tick, including zero-sale ticks. */
export function recordMissionTick(state:GameState,sales:Readonly<Record<Item,number>>):void {
  if(state.missionRuleVersion!==3 || !["M6","M7"].includes(state.mission.activeId))return;
  const metrics=state.missionMetrics;
  if(!metrics || state.tick<=metrics.activatedAtTick)return;
  metrics.salesTicks.push({tick:state.tick,sales:{...sales}});
  if(metrics.salesTicks.length>60)metrics.salesTicks.shift();
}

/** Evaluate only complete, contiguous post-activation windows. */
export function missionWindow(state:GameState):{sales:Record<Item,number>;profitCents:number}|null {
  const metrics=state.missionMetrics;
  if(state.missionRuleVersion!==3 || !metrics || metrics.salesTicks.length!==60)return null;
  const first=state.tick-59;
  if(first<=metrics.activatedAtTick || metrics.salesTicks[0]?.tick!==first ||
    metrics.salesTicks.some((event,i)=>event.tick!==first+i))return null;
  if(state.rollingEvents.length!==60 ||
    state.rollingEvents.some((event,i)=>event.tick!==first+i))return null;
  const sales=emptySales();
  for(const event of metrics.salesTicks)for(const item of Object.keys(sales) as Item[])sales[item]+=event.sales[item];
  const profitCents=state.rollingEvents.reduce((sum,e)=>sum+e.revenueCents-e.costCents,0);
  return {sales,profitCents};
}
