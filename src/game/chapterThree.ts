import {
  CHAPTER_III_CONTRACTS,CHAPTER_III_ROUTES,CONTRACT_STREAK_WINDOWS,CONTRACT_WINDOW_TICKS,
  contractQualifies,summarizeContractTicks,
  type ChapterIIIContractId,type ChapterIIIRoute,type ContractTick,type ContractWindow,
} from "../domain/contracts";
import type {GameState} from "../domain/model";
import type {ChapterCommandResult} from "./chapterTwo";

export function beginChapterIII(state:GameState):ChapterCommandResult {
  if(state.mission.activeId!=="DONE" || !state.chapterII?.started || !state.chapterII.completed || state.chapterIII)
    return {ok:false,message:"Chapter III is unavailable or already started.",state};
  const next=structuredClone(state);
  next.chapterIII={route:null,completed:[],active:null};
  return {ok:true,message:"Chapter III started: Project Prometheus.",state:next};
}

export function acceptChapterIIIContract(state:GameState,id:ChapterIIIContractId):ChapterCommandResult {
  const chapter=state.chapterIII;
  const offer=chapter&&CHAPTER_III_CONTRACTS[chapter.completed.length];
  if(!chapter||chapter.active||offer===undefined||offer!==id||
    (id==="M12"&&chapter.route===null))
    return {ok:false,message:"Contract is unavailable.",state};
  const next=structuredClone(state);
  next.chapterIII!.active={id,activatedAtTick:state.tick,ticks:[],streakTicks:0};
  return {ok:true,message:"Contract accepted.",state:next};
}

export function chooseChapterIIIRoute(state:GameState,route:ChapterIIIRoute,confirmed=false):ChapterCommandResult {
  const chapter=state.chapterIII;
  if(confirmed!==true||!CHAPTER_III_ROUTES.includes(route)||!chapter||chapter.route!==null||
    chapter.active||chapter.completed.length!==1)
    return {ok:false,message:"Route choice is unavailable or unconfirmed.",state};
  const next=structuredClone(state);
  next.chapterIII!.route=route;
  return {ok:true,message:"Route confirmed.",state:next};
}

export function currentChapterIIIWindow(state:GameState):ContractWindow|null {
  const active=state.chapterIII?.active;
  if(!active||active.ticks.length!==CONTRACT_WINDOW_TICKS)return null;
  const first=state.tick-CONTRACT_WINDOW_TICKS+1;
  if(first<=active.activatedAtTick||active.ticks.some((event,index)=>event.tick!==first+index))return null;
  return summarizeContractTicks(active.ticks);
}

/** Records and evaluates one completed active tick on the engine-owned snapshot. */
export function recordContractTick(state:GameState,event:ContractTick):void {
  const chapter=state.chapterIII;
  const active=chapter?.active;
  if(!chapter||!active||state.paused||event.tick!==state.tick)return;
  const priorTick=active.ticks.at(-1)?.tick??active.activatedAtTick;
  if(event.tick!==priorTick+1)return;

  active.ticks.push(event);
  if(active.ticks.length>CONTRACT_WINDOW_TICKS)active.ticks.shift();
  const window=currentChapterIIIWindow(state);
  if(!window)return;

  active.streakTicks=contractQualifies(active.id,chapter.route,window)?active.streakTicks+1:0;
  if(active.streakTicks===CONTRACT_STREAK_WINDOWS){
    chapter.completed.push(active.id);
    chapter.active=null;
  }
}
