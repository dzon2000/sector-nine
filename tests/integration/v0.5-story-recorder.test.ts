import {describe,expect,it} from "vitest";
import {createGame} from "../../src/domain/model";
import {availableTransmissions,CHAPTER_TRANSMISSIONS} from "../../src/game/chapterNarrative";
import {acceptChapterIIIContract,beginChapterIII,chooseChapterIIIRoute} from "../../src/game/chapterThree";
import {validateSave} from "../../src/persistence/indexedDb";
import {advancePlaytest,annotatePlaytest,buildPlaytestReport,isPlaytestSession,resumePlaytest,startPlaytest} from "../../src/ui/playtest";

function afterChapterTwo(){
  const game=createGame();
  game.mission.activeId="DONE";
  game.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
  for(const key of Object.keys(game.technologies!)){
    game.technologies![key as keyof typeof game.technologies]=true;
  }
  return game;
}

describe("Project Prometheus story and evidence",()=>{
  it.each(["independent","corporate"] as const)("unlocks the %s reply and shared conclusion across reload without changing the save",route=>{
    const start=beginChapterIII(afterChapterTwo()).state;
    expect(availableTransmissions(start)).toContain("prometheus-opening");
    expect(availableTransmissions(start)).not.toContain("prometheus-archive");
    start.chapterIII!.completed=["M11"];
    expect(availableTransmissions(start)).toContain("prometheus-archive");
    const chosen=chooseChapterIIIRoute(start,route,true).state;
    const other=route==="independent"?"corporate":"independent";
    expect(availableTransmissions(chosen)).toContain("prometheus-"+route);
    expect(availableTransmissions(chosen)).not.toContain("prometheus-"+other);
    expect(availableTransmissions(chosen)).not.toContain("prometheus-interlock");
    chosen.chapterIII!.completed=["M11","M12","M13"];
    const saved=validateSave(JSON.parse(JSON.stringify(chosen)));
    const before=structuredClone(saved);
    const available=availableTransmissions(saved);
    expect(available).toContain("prometheus-interlock");
    expect(available).toContain("prometheus-conclusion");
    expect(availableTransmissions(saved).map(id=>CHAPTER_TRANSMISSIONS[id].pages)).toHaveLength(available.length);
    expect(saved).toEqual(before);
  });

  it("exports observed contract events once, preserves provenance and keeps waiting categories distinct",()=>{
    const game=afterChapterTwo();
    const build="a".repeat(40);
    let recording=startPlaytest(game,100,build);
    const started=beginChapterIII(game).state;
    recording=advancePlaytest(recording,started,200);
    const active=acceptChapterIIIContract(started,"M11").state;
    recording=advancePlaytest(recording,active,300);
    const complete=structuredClone(active);
    complete.tick=89;
    complete.paused=false;
    complete.chapterIII!.active=null;
    complete.chapterIII!.completed=["M11"];
    recording=advancePlaytest(recording,complete,400);
    recording=annotatePlaytest(recording,"waiting",400);
    const confirmed=chooseChapterIIIRoute(complete,"independent",true).state;
    recording=advancePlaytest(recording,confirmed,500);
    recording=annotatePlaytest(recording,"waiting_mission",500);
    const next=acceptChapterIIIContract(confirmed,"M12").state;
    recording=advancePlaytest(recording,next,600);
    recording=advancePlaytest(resumePlaytest(recording,next,5000),next,5100);
    const report=buildPlaytestReport(recording);
    expect(report.contractTransitions.map(event=>[event.type,event.tick])).toEqual([
      ["chapter_started",0],["contract_accepted",0],["contract_completed",89],
      ["route_confirmed",89],["contract_accepted",89]
    ]);
    expect(report).toMatchObject({buildCommit:build,schemaVersion:5,missionRuleVersion:5,
      chapterIIIRoute:"independent",waitingMs:100,waitingForMissionMs:200});
    expect(report.contractTransitions).toContainEqual({type:"route_confirmed",route:"independent",tick:89,elapsedMs:400});
    expect(JSON.stringify(report)).not.toMatch(/startedAt|lastObservedAt|lastContractProgress/);
    expect(isPlaytestSession(recording)).toBe(true);
    expect(isPlaytestSession({...recording,contractTransitions:[{type:"route_confirmed",route:"other",tick:89,elapsedMs:0}]})).toBe(false);
  });

  it("resumes a legacy recording without inventing events before observation",()=>{
    const game=beginChapterIII(afterChapterTwo()).state;
    const legacy=startPlaytest(game,0);
    const resumed=resumePlaytest({...legacy,lastContractProgress:undefined,contractTransitions:undefined},game,1000);
    expect(buildPlaytestReport(advancePlaytest(resumed,game,1100)).contractTransitions).toEqual([]);
  });
});
