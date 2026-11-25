export const CHECKPOINTS={
  ii:{chapter:"II",startingMission:"M8",recipientRoute:null},
  iii:{chapter:"III",startingMission:"M11",recipientRoute:null},
  "iv-independent":{chapter:"IV",startingMission:"M14",recipientRoute:"independent"},
  "iv-corporate":{chapter:"IV",startingMission:"M14",recipientRoute:"corporate"},
} as const;

export type CheckpointId=keyof typeof CHECKPOINTS;
export type ChapterPlaytestOrigin={kind:"chapter-playtest";checkpointId:CheckpointId;checkpointTick:number} &
  (typeof CHECKPOINTS)[CheckpointId];

export function chapterPlaytestOrigin(id:CheckpointId,tick:number):ChapterPlaytestOrigin{
  return {kind:"chapter-playtest",checkpointId:id,checkpointTick:tick,...CHECKPOINTS[id]};
}

export function isChapterPlaytestOrigin(value:unknown):value is ChapterPlaytestOrigin{
  if(!value||typeof value!=="object")return false;
  const origin=value as Partial<ChapterPlaytestOrigin>;
  if(origin.kind!=="chapter-playtest"||typeof origin.checkpointId!=="string"||
    !Object.hasOwn(CHECKPOINTS,origin.checkpointId)||!Number.isSafeInteger(origin.checkpointTick)||
    origin.checkpointTick!<=0)return false;
  const expected=CHECKPOINTS[origin.checkpointId];
  return origin.chapter===expected.chapter&&origin.startingMission===expected.startingMission&&
    origin.recipientRoute===expected.recipientRoute;
}
