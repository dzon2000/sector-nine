import {CHECKPOINTS,chapterPlaytestOrigin,isChapterPlaytestOrigin,type ChapterPlaytestOrigin,type CheckpointId} from "../game/chapterPlaytest";
import {beginChapterII} from "../game/chapterTwo";
import {beginChapterIII} from "../game/chapterThree";
import {isChapterIVAvailable} from "../game/chapterFour";
import type {GameState} from "../domain/model";
import {createSaveSlot,validateSave} from "./indexedDb";

interface ChapterPlaytestSave {game:GameState;origin:ChapterPlaytestOrigin}
const checkpointUrls={
  ii:new URL("../game/checkpoints/ii.json",import.meta.url).href,
  iii:new URL("../game/checkpoints/iii.json",import.meta.url).href,
  "iv-independent":new URL("../game/checkpoints/iv-independent.json",import.meta.url).href,
  "iv-corporate":new URL("../game/checkpoints/iv-corporate.json",import.meta.url).href,
};

function validateChapterPlaytest(value:unknown):ChapterPlaytestSave{
  if(!value||typeof value!=="object")throw Error("Chapter playtest save is missing or corrupt.");
  const {game,origin}=value as Partial<ChapterPlaytestSave>;
  const state=validateSave(game);
  if(!isChapterPlaytestOrigin(origin)||origin.checkpointTick>state.tick||state.introOpen||!state.introSeen||
    (state.mission.activeId!=="DONE"&&!state.chapterII?.started)||
    (origin.chapter!=="II"&&!state.chapterII?.completed)||
    (origin.chapter==="IV"&&(state.chapterIII?.completed.at(-1)!=="M13"||
      state.chapterIII.route!==origin.recipientRoute)))
    throw Error("Invalid chapter playtest start metadata. Data preserved.");
  return {game:state,origin:chapterPlaytestOrigin(origin.checkpointId,origin.checkpointTick)};
}

export const chapterPlaytestSlot=createSaveSlot("chapter-playtest",validateChapterPlaytest);

export function validateChapterCheckpoint(id:CheckpointId,value:unknown):ChapterPlaytestSave{
  const game=validateSave(value);
  const start=CHECKPOINTS[id];
  const available=start.chapter==="II"?beginChapterII(game).ok:
    start.chapter==="III"?beginChapterIII(game).ok:
    isChapterIVAvailable(game)&&game.chapterIII?.route===start.recipientRoute;
  if(!available||!game.paused||game.introOpen||!game.introSeen||game.tick<=0)
    throw Error("Checkpoint does not match the selected chapter handoff.");
  return {game,origin:chapterPlaytestOrigin(id,game.tick)};
}

export async function fetchChapterCheckpoint(id:CheckpointId):Promise<ChapterPlaytestSave>{
  const response=await fetch(checkpointUrls[id],{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Chapter checkpoint unavailable (HTTP ${response.status}).`);
  return validateChapterCheckpoint(id,await response.json());
}
