import {describe,expect,it} from "vitest";
import {createGame,type GameState} from "../../src/domain/model";
import {acceptChapterIIIContract,beginChapterIII} from "../../src/game/chapterThree";
import {runTicks,tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

function chapterTwoComplete():GameState {
  const game=createGame();
  game.mission.activeId="DONE";
  game.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
  Object.assign(game.technologies!,{
    coal_extraction:true,mechanical_components:true,advanced_smelting:true,
    resource_surveying:true,circuit_fabrication:true,industrial_power:true
  });
  return game;
}

const idleCampaign={route:null,completed:[],active:null};

describe("Chapter III current saves",()=>{
  it("accepts an existing current save before Chapter III starts",()=>{
    const game=chapterTwoComplete();
    expect(validateSave(game)).toEqual(game);
  });

  it("rejects Chapter III progress before Chapter II is complete",()=>{
    expect(()=>validateSave({...createGame(),chapterIII:idleCampaign})).toThrow(/invalid chapter iii/i);
  });

  it.each([
    {route:"corporate",completed:[],active:null},
    {route:null,completed:["M11","M12"],active:null},
    {route:"independent",completed:["M12"],active:null},
    {route:"independent",completed:["M11","M12","M13","M13"],active:null},
    {route:"independent",completed:["M11"],active:{id:"M13",activatedAtTick:0,ticks:[],streakTicks:0}},
    {route:null,completed:["M11"],active:{id:"M12",activatedAtTick:0,ticks:[],streakTicks:0}},
    {route:null,completed:[],active:{id:"M11",activatedAtTick:1,ticks:[],streakTicks:0}},
    {route:null,completed:[],active:{id:"M11",activatedAtTick:0,ticks:[],streakTicks:1}}
  ])("rejects impossible Chapter III progression states",chapterIII=>{
    expect(()=>validateSave({...chapterTwoComplete(),chapterIII})).toThrow(/invalid chapter iii/i);
  });

  it("preserves a chosen route before activation and a completed archive in free play",()=>{
    const game=chapterTwoComplete();
    for(const completed of [["M11"],["M11","M12","M13"]]){
      const snapshot={...game,chapterIII:{route:"independent",completed,active:null}};
      expect(validateSave(snapshot)).toEqual(snapshot);
    }
  });

  it("restores an active rolling window and rejects skipped, malformed and fabricated ticks",()=>{
    const started=beginChapterIII({...chapterTwoComplete(),paused:false});
    expect(started.ok).toBe(true);
    const accepted=acceptChapterIIIContract(validateSave(started.state),"M11");
    expect(accepted.ok).toBe(true);
    const partial=runTicks(accepted.state,59);
    expect(validateSave(partial)).toEqual(partial);
    const after=runTicks(partial,2);
    const restored=validateSave(JSON.parse(JSON.stringify(after)));
    expect(restored).toEqual(after);
    expect(runTicks(restored,10)).toEqual(runTicks(after,10));
    expect(tick(restored)).toEqual(tick(after));
    expect(after.chapterIII!.active!.ticks).toHaveLength(60);

    const corruptions:Array<(state:GameState)=>void>=[
      state=>{state.chapterIII!.active!.ticks.shift();},
      state=>{state.chapterIII!.active!.ticks[0].tick++;},
      state=>{state.chapterIII!.active!.ticks[0].sold.circuit=2;},
      state=>{state.chapterIII!.active!.ticks[0].produced.gear=-1;},
      state=>{state.chapterIII!.active!.ticks[0].coalBurned=1;},
      state=>{state.chapterIII!.active!.ticks[0].profitCents=50;},
      state=>{state.chapterIII!.active!.streakTicks=1;}
    ];
    for(const corrupt of corruptions){
      const snapshot=structuredClone(after);
      corrupt(snapshot);
      expect(()=>validateSave(snapshot)).toThrow(/invalid chapter iii/i);
    }
  });

  it("rejects malformed Chapter III payloads without repairing them",()=>{
    const malformed={...chapterTwoComplete(),chapterIII:null};
    expect(()=>validateSave(malformed)).toThrow(/invalid chapter iii/i);
    expect(malformed.chapterIII).toBeNull();
  });
});
