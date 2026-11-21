import type {GameState,Kind,MissionId} from "../domain/model";
import {CHAPTER_III_CONTRACTS,CHAPTER_III_ROUTES,type ChapterIIIContractId,type ChapterIIIRoute} from "../domain/contracts";
import {resolveBuildCommit} from "./buildProvenance";
import type {SimulationSpeed} from "./simulationClock";

/** Local UI/test-harness-only timing. Never called by the deterministic simulation. */
export type PlaytestActivity="unclassified"|"planning"|"waiting"|"waiting_mission";
function extractionDeposit(kind:Kind,x:number,y:number):string|null {
  const name=({iron_mine:"iron",coal_mine:"coal",copper_mine:"copper",
    silicon_extractor:"silicon"} as Partial<Record<Kind,string>>)[kind];
  return name?`${name}:(${x},${y})`:null;
}
export type PlaytestCommand=
  | {kind:"place";entityKind:Kind;x:number;y:number}
  | {kind:"turn"|"demolish";entityKind?:Kind;x:number;y:number}
  | {kind:"research";technology:string};
export type PlaytestCommandEvent = PlaytestCommand & {tick:number;elapsedMs:number};
interface PlaytestSpeedEvent {speed:SimulationSpeed;tick:number;elapsedMs:number}
export interface PlaytestTransition {tick:number;from:MissionId;to:MissionId}
type ContractTransition =
  | {type:"chapter_started"}
  | {type:"route_confirmed";route:ChapterIIIRoute}
  | {type:"contract_accepted"|"contract_completed";contract:ChapterIIIContractId};
type TimedContractTransition=ContractTransition & {tick:number;elapsedMs:number};
interface ContractProgress {
  route:ChapterIIIRoute|null;
  active:ChapterIIIContractId|null;
  completedCount:number;
}

function contractProgress(game:GameState):ContractProgress|null {
  const chapter=game.chapterIII;
  return chapter?{route:chapter.route,active:chapter.active?.id??null,completedCount:chapter.completed.length}:null;
}

export interface PlaytestSession {
  active:boolean;
  /** Optional only for recordings created before provenance support. */
  schemaVersion?:1|2|3|4|5;
  missionRuleVersion?:2|3|4|5;
  /** Original build provenance; absent in old sessions, null for untrusted/local builds. */
  buildCommit?:string|null;
  startedAt:number;
  lastObservedAt:number;
  lastTick:number;
  lastMission:MissionId;
  lastPaused:boolean;
  activity:PlaytestActivity;
  wallMs:number;
  pausedMs:number;
  /** Optional for local recordings created before speed controls. */
  activeWallMs?:number;
  speedEvents?:PlaytestSpeedEvent[];
  planningMs:number;
  waitingMs:number;
  /** Player-classified waiting for mission qualification/stability (not credit shortage). */
  waitingForMissionMs?:number;
  unclassifiedMs:number;
  /** Actual observed, nonzero-demand simulation power ticks; never extrapolated. */
  poweredTicks?:number;
  unpoweredTicks?:number;
  activeTicks:number;
  commands:Record<PlaytestCommand["kind"],number>;
  commandEvents:PlaytestCommandEvent[];
  usedDeposits:string[];
  inputStarvedEntityTicks:number;
  outputBlockedEntityTicks:number;
  missionTransitions:PlaytestTransition[];
  lastContractProgress?:ContractProgress|null;
  contractTransitions?:TimedContractTransition[];
}
/** Ignore malformed local recorder data; it must never block the game save. */
export function isPlaytestSession(value:unknown):value is PlaytestSession{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  const safe=(field:string)=>Number.isSafeInteger(v[field])&&(v[field] as number)>=0;
  if(v.buildCommit!==undefined&&v.buildCommit!==null&&
    resolveBuildCommit(v.buildCommit)===null)return false;
  for(const optional of ["waitingForMissionMs","poweredTicks","unpoweredTicks","activeWallMs"]){
    if(v[optional]!==undefined&&(!Number.isSafeInteger(v[optional])||(v[optional] as number)<0))return false;
  }
  if((v.schemaVersion!==undefined && ![1,2,3,4,5].includes(v.schemaVersion as number))||
    (v.missionRuleVersion!==undefined && ![2,3,4,5].includes(v.missionRuleVersion as number)))return false;
  if(typeof v.active!=="boolean"||typeof v.lastPaused!=="boolean"||
    !["unclassified","planning","waiting","waiting_mission"].includes(String(v.activity))||
    !["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","DONE"].includes(String(v.lastMission)))return false;
  for(const field of ["startedAt","lastObservedAt","lastTick","wallMs","pausedMs","planningMs",
    "waitingMs","unclassifiedMs","activeTicks","inputStarvedEntityTicks","outputBlockedEntityTicks"])
    if(!safe(field))return false;
  if(v.speedEvents!==undefined&&(!Array.isArray(v.speedEvents)||v.speedEvents.some(event=>
    !event||typeof event!=="object"||(event.speed!==1&&event.speed!==2)||
    !Number.isSafeInteger(event.tick)||event.tick<0||
    !Number.isSafeInteger(event.elapsedMs)||event.elapsedMs<0||event.elapsedMs>(v.wallMs as number))))return false;
  if(!v.commands||typeof v.commands!=="object"||Array.isArray(v.commands))return false;
  const commands=v.commands as Record<string,unknown>;
  if(["place","turn","demolish","research"].some(k=>!Number.isSafeInteger(commands[k])||
    (commands[k] as number)<0))return false;
  if(!Array.isArray(v.commandEvents)||!Array.isArray(v.usedDeposits)||
    !Array.isArray(v.missionTransitions)||v.commandEvents.length>100000||
    v.missionTransitions.length>10000||v.usedDeposits.length>100)return false;
  if(v.usedDeposits.some(x=>typeof x!=="string"||x.length>100))return false;
  if(v.commandEvents.some(x=>!x||typeof x!=="object"||
    !["place","turn","demolish","research"].includes(x.kind)||
    !Number.isSafeInteger(x.tick)||x.tick<0||
    !Number.isSafeInteger(x.elapsedMs)||x.elapsedMs<0))return false;
  if(v.missionTransitions.some(x=>!x||typeof x!=="object"||
    !Number.isSafeInteger(x.tick)||x.tick<0||
    !["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","DONE"].includes(x.from)||
    !["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","DONE"].includes(x.to)))return false;
  if(v.lastContractProgress!==undefined&&v.lastContractProgress!==null){
    const progress=v.lastContractProgress as Partial<ContractProgress>;
    if(typeof progress!=="object"||Array.isArray(progress)||
      (progress.route!==null&&!CHAPTER_III_ROUTES.includes(progress.route!))||
      (progress.active!==null&&!CHAPTER_III_CONTRACTS.includes(progress.active!))||
      !Number.isInteger(progress.completedCount)||progress.completedCount!<0||
      progress.completedCount!>CHAPTER_III_CONTRACTS.length)return false;
  }
  if(v.contractTransitions!==undefined&&(!Array.isArray(v.contractTransitions)||
    v.contractTransitions.length>10000||v.contractTransitions.some(event=>{
      if(!event||typeof event!=="object"||!Number.isSafeInteger(event.tick)||event.tick<0||
        !Number.isSafeInteger(event.elapsedMs)||event.elapsedMs<0)return true;
      switch(event.type){
        case "chapter_started":return false;
        case "route_confirmed":return !CHAPTER_III_ROUTES.includes(event.route);
        case "contract_accepted":
        case "contract_completed":return !CHAPTER_III_CONTRACTS.includes(event.contract);
        default:return true;
      }
    })))return false;
  return true;
}
/** All durations are explicitly classified by prior known state; no subjective inference. */
function elapsed(s:PlaytestSession,now:number):PlaytestSession{
  if(!s.active)return s;
  const duration=Math.max(0,now-s.lastObservedAt);
  const next={...s,lastObservedAt:Math.max(now,s.lastObservedAt),wallMs:s.wallMs+duration};
  if(s.lastPaused)next.pausedMs+=duration;
  else{
    next.activeWallMs=activePlaytestWallMs(s)+duration;
    if(s.activity==="planning")next.planningMs+=duration;
    else if(s.activity==="waiting")next.waitingMs+=duration;
    else if(s.activity==="waiting_mission")next.waitingForMissionMs=(next.waitingForMissionMs??0)+duration;
    else next.unclassifiedMs+=duration;
  }
  return next;
}
export function activePlaytestWallMs(session:PlaytestSession):number{
  return session.activeWallMs??Math.max(0,session.wallMs-session.pausedMs);
}

function observeSpeed(session:PlaytestSession,speed:SimulationSpeed):PlaytestSpeedEvent[]{
  const events=session.speedEvents??[];
  if(events.at(-1)?.speed===speed)return events;
  return [...events,{speed,tick:session.lastTick,elapsedMs:session.wallMs}];
}

export function startPlaytest(game:GameState,now:number,buildCommit:string|null=null,
  speed:SimulationSpeed=1,hidden=false):PlaytestSession{
  return {active:true,schemaVersion:game.schemaVersion,missionRuleVersion:game.missionRuleVersion,
    buildCommit:resolveBuildCommit(buildCommit),
    startedAt:now,lastObservedAt:now,lastTick:game.tick,lastMission:game.mission.activeId,
    lastPaused:game.paused||game.introOpen||hidden,activity:"unclassified",
    wallMs:0,pausedMs:0,activeWallMs:0,speedEvents:[{speed,tick:game.tick,elapsedMs:0}],planningMs:0,waitingMs:0,waitingForMissionMs:0,
    poweredTicks:0,unpoweredTicks:0,unclassifiedMs:0,activeTicks:0,
    commands:{place:0,turn:0,demolish:0,research:0},commandEvents:[],
    usedDeposits:game.entities.map(e=>extractionDeposit(e.kind,e.x,e.y))
      .filter((d):d is string=>d!==null),
    inputStarvedEntityTicks:0,outputBlockedEntityTicks:0,missionTransitions:[],
    lastContractProgress:contractProgress(game),contractTransitions:[]};
}
export function annotatePlaytest(session:PlaytestSession,activity:PlaytestActivity,now:number):PlaytestSession{
  const s=elapsed(session,now);
  return {...s,activity};
}
export function advancePlaytest(session:PlaytestSession,game:GameState,now:number,
  speed:SimulationSpeed=session.speedEvents?.at(-1)?.speed??1,hidden=false):PlaytestSession{
  const s=elapsed(session,now);
  if(!session.active)return s;
  const next={...s,lastPaused:game.paused||game.introOpen||hidden,lastTick:game.tick,
    lastMission:game.mission.activeId,activeTicks:s.activeTicks+Math.max(0,game.tick-s.lastTick)};
  next.speedEvents=observeSpeed(next,speed);
  const current=contractProgress(game);
  const previous=s.lastContractProgress;
  next.lastContractProgress=current;
  const event=(transition:ContractTransition)=>{
    next.contractTransitions=[...(s.contractTransitions??[]),{...transition,tick:game.tick,elapsedMs:s.wallMs}];
  };
  if(current&&previous===null){
    event({type:"chapter_started"});
  }else if(current&&previous){
    if(current.route&&previous.route===null)event({type:"route_confirmed",route:current.route});
    else if(current.active&&previous.active===null&&current.completedCount===previous.completedCount)
      event({type:"contract_accepted",contract:current.active});
    else if(previous.active&&current.active===null&&current.completedCount===previous.completedCount+1&&
      game.chapterIII?.completed[previous.completedCount]===previous.active)
      event({type:"contract_completed",contract:previous.active});
  }
  // Count recorded demand ticks only; no generated data for history gaps or idle demand.
  for(const sample of game.power?.history??[]){
    if(sample.tick<=s.lastTick||sample.tick>game.tick||sample.demand===0)continue;
    if(sample.demandCovered)next.poweredTicks=(next.poweredTicks??0)+1;
    else if(sample.served<sample.demand)next.unpoweredTicks=(next.unpoweredTicks??0)+1;
  }
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
  if(command.kind==="place"){
    const deposit=extractionDeposit(command.entityKind,command.x,command.y);
    if(deposit&&!usedDeposits.includes(deposit))usedDeposits.push(deposit);
  }
  return {...s,commands:{...s.commands,[command.kind]:s.commands[command.kind]+1},
    commandEvents:[...s.commandEvents,{...command,tick:s.lastTick,elapsedMs:s.wallMs}],usedDeposits};
}
export function resumePlaytest(saved:PlaytestSession,game:GameState,now:number,hidden=false):PlaytestSession{
  // Time between browser sessions is excluded. Game is normally paused on unload/hidden tab.
  const next={...saved,lastObservedAt:now,lastTick:game.tick,lastMission:game.mission.activeId,
    lastPaused:game.paused||game.introOpen||hidden,
    lastContractProgress:saved.active?contractProgress(game):saved.lastContractProgress};
  if(next.active)next.speedEvents=observeSpeed(next,1);
  return next;
}
export function finishPlaytest(session:PlaytestSession,game:GameState,now:number,hidden=false):PlaytestSession{
  return {...advancePlaytest(session,game,now,undefined,hidden),active:false};
}
export function buildPlaytestReport(s:PlaytestSession){
  return {format:"sector-nine-playtest-v1" as const,
    schemaVersion:s.schemaVersion,missionRuleVersion:s.missionRuleVersion,
    buildCommit:s.buildCommit??null,
    activeTicks:s.activeTicks,wallMs:s.wallMs,pausedMs:s.pausedMs,activeWallMs:activePlaytestWallMs(s),
    speedEvents:(s.speedEvents??[]).map(event=>({...event})),
    planningMs:s.planningMs,waitingMs:s.waitingMs,
    waitingForMissionMs:s.waitingForMissionMs??0,unclassifiedMs:s.unclassifiedMs,
    poweredTicks:s.poweredTicks??0,unpoweredTicks:s.unpoweredTicks??0,
    commands:{...s.commands},commandEvents:s.commandEvents.map(e=>({...e})),
    usedDeposits:[...s.usedDeposits],missionTransitions:s.missionTransitions.map(e=>({...e})),
    chapterIIIRoute:s.lastContractProgress?.route??null,
    contractTransitions:(s.contractTransitions??[]).map(event=>{
      const {type,tick,elapsedMs}=event;
      if(type==="route_confirmed")return {type,tick,elapsedMs,route:event.route};
      if(type==="chapter_started")return {type,tick,elapsedMs};
      return {type,tick,elapsedMs,contract:event.contract};
    }),
    inputStarvedEntityTicks:s.inputStarvedEntityTicks,outputBlockedEntityTicks:s.outputBlockedEntityTicks};
}
