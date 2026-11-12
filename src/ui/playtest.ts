import type {GameState,Kind,MissionId} from "../domain/model";

/** Local UI/test-harness-only timing. Never called by the deterministic simulation. */
export type PlaytestActivity="unclassified"|"planning"|"waiting";
export type PlaytestCommand=
  | {kind:"place";entityKind:Kind;x:number;y:number}
  | {kind:"turn"|"demolish";entityKind?:Kind;x:number;y:number}
  | {kind:"research";technology:string};
export type PlaytestCommandEvent = PlaytestCommand & {tick:number;elapsedMs:number};
export interface PlaytestTransition {tick:number;from:MissionId;to:MissionId}
export interface PlaytestSession {
  active:boolean;
  startedAt:number;
  lastObservedAt:number;
  lastTick:number;
  lastMission:MissionId;
  lastPaused:boolean;
  activity:PlaytestActivity;
  wallMs:number;
  pausedMs:number;
  planningMs:number;
  waitingMs:number;
  unclassifiedMs:number;
  activeTicks:number;
  commands:Record<PlaytestCommand["kind"],number>;
  commandEvents:PlaytestCommandEvent[];
  usedDeposits:string[];
  inputStarvedEntityTicks:number;
  outputBlockedEntityTicks:number;
  missionTransitions:PlaytestTransition[];
}
/** All durations are explicitly classified by prior known state; no subjective inference. */
function elapsed(s:PlaytestSession,now:number):PlaytestSession{
  if(!s.active)return s;
  const duration=Math.max(0,now-s.lastObservedAt);
  const next={...s,lastObservedAt:Math.max(now,s.lastObservedAt),wallMs:s.wallMs+duration};
  if(s.lastPaused)next.pausedMs+=duration;
  else if(s.activity==="planning")next.planningMs+=duration;
  else if(s.activity==="waiting")next.waitingMs+=duration;
  else next.unclassifiedMs+=duration;
  return next;
}
export function startPlaytest(game:GameState,now:number):PlaytestSession{
  return {active:true,startedAt:now,lastObservedAt:now,lastTick:game.tick,lastMission:game.mission.activeId,
    lastPaused:game.paused||game.introOpen,activity:"unclassified",
    wallMs:0,pausedMs:0,planningMs:0,waitingMs:0,unclassifiedMs:0,activeTicks:0,
    commands:{place:0,turn:0,demolish:0,research:0},commandEvents:[],
    usedDeposits:game.entities.filter(e=>e.kind==="iron_mine"||e.kind==="coal_mine")
      .map(e=>`${e.kind==="iron_mine"?"iron":"coal"}:(${e.x},${e.y})`),
    inputStarvedEntityTicks:0,outputBlockedEntityTicks:0,missionTransitions:[]};
}
export function annotatePlaytest(session:PlaytestSession,activity:PlaytestActivity,now:number):PlaytestSession{
  const s=elapsed(session,now);
  return {...s,activity};
}
export function advancePlaytest(session:PlaytestSession,game:GameState,now:number):PlaytestSession{
  const s=elapsed(session,now);
  if(!session.active)return s;
  const next={...s,lastPaused:game.paused||game.introOpen,lastTick:game.tick,
    lastMission:game.mission.activeId,activeTicks:s.activeTicks+Math.max(0,game.tick-s.lastTick)};
  if(game.mission.activeId!==s.lastMission){
    next.missionTransitions=[...s.missionTransitions,{tick:game.tick,from:s.lastMission,to:game.mission.activeId}];
  }
  const newSamples=(game.diagnostics?.samples??[]).filter(sample=>sample.tick>s.lastTick);
  for(const sample of newSamples){
    for(const e of Object.values(sample.entities)){
      if(e.status==="input_starved")next.inputStarvedEntityTicks++;
      if(e.status==="output_blocked")next.outputBlockedEntityTicks++;
    }
  }
  return next;
}
export function recordPlaytestCommand(session:PlaytestSession,command:PlaytestCommand,now:number):PlaytestSession{
  if(!session.active)return session;
  const s=elapsed(session,now);
  const usedDeposits=[...s.usedDeposits];
  if(command.kind==="place" && (command.entityKind==="iron_mine"||command.entityKind==="coal_mine")){
    const deposit=`${command.entityKind==="iron_mine"?"iron":"coal"}:(${command.x},${command.y})`;
    if(!usedDeposits.includes(deposit))usedDeposits.push(deposit);
  }
  return {...s,commands:{...s.commands,[command.kind]:s.commands[command.kind]+1},
    commandEvents:[...s.commandEvents,{...command,tick:s.lastTick,elapsedMs:s.wallMs}],usedDeposits};
}
export function resumePlaytest(saved:PlaytestSession,game:GameState,now:number):PlaytestSession{
  // Time between browser sessions is excluded. Game is normally paused on unload/hidden tab.
  return {...saved,lastObservedAt:now,lastTick:game.tick,lastMission:game.mission.activeId,
    lastPaused:game.paused||game.introOpen};
}
export function finishPlaytest(session:PlaytestSession,game:GameState,now:number):PlaytestSession{
  return {...advancePlaytest(session,game,now),active:false};
}
export function buildPlaytestReport(s:PlaytestSession){
  return {format:"sector-nine-playtest-v1" as const,
    activeTicks:s.activeTicks,wallMs:s.wallMs,pausedMs:s.pausedMs,
    planningMs:s.planningMs,waitingMs:s.waitingMs,unclassifiedMs:s.unclassifiedMs,
    commands:{...s.commands},commandEvents:s.commandEvents.map(e=>({...e})),
    usedDeposits:[...s.usedDeposits],missionTransitions:s.missionTransitions.map(e=>({...e})),
    inputStarvedEntityTicks:s.inputStarvedEntityTicks,outputBlockedEntityTicks:s.outputBlockedEntityTicks};
}
