import {describe,expect,it} from "vitest";
import {createGame} from "../../src/domain/model";
import {place} from "../../src/game/commands";
import {beginChapterII} from "../../src/game/chapterTwo";
import {validateSave} from "../../src/persistence/indexedDb";

describe("v0.5 current saves",()=>{
  it("uses one format and rule identity from M1 through both chapters and free play",()=>{
    const game=createGame();
    expect(game.schemaVersion).toBe(5);
    expect(validateSave(game)).toEqual(game);
    game.mission.activeId="DONE";
    game.chapterII={foundryCompleted:true,started:false,completed:false,storySeen:false,metrics:null};
    Object.assign(game.technologies!,{coal_extraction:true,mechanical_components:true,advanced_smelting:true});
    const chapter=beginChapterII(validateSave(game));
    expect(chapter.ok).toBe(true);
    expect(chapter.state.schemaVersion).toBe(game.schemaVersion);
    expect(chapter.state.missionRuleVersion).toBe(game.missionRuleVersion);
    expect(validateSave(chapter.state)).toEqual(chapter.state);
    chapter.state.mission.activeId="DONE";
    Object.assign(chapter.state.technologies!,{resource_surveying:true,circuit_fabrication:true,industrial_power:true});
    Object.assign(chapter.state.chapterII!,{completed:true,metrics:null});
    expect(validateSave(chapter.state)).toEqual(chapter.state);
  });

  it.each([1,2,3,4,99])("rejects unsupported schema %i with a specific error",schemaVersion=>{
    expect(()=>validateSave({...createGame(),schemaVersion})).toThrow(/unsupported save schema/i);
  });

  it("rejects malformed current snapshots without synthesizing fields",()=>{
    const {diagnostics,...withoutDiagnostics}=createGame();
    expect(diagnostics).toBeDefined();
    expect(()=>validateSave(withoutDiagnostics)).toThrow(/diagnostic/i);
    expect(()=>validateSave({})).toThrow(/corrupt/i);
  });
  it("rejects a processing cycle without its exact reserved inputs",()=>{
    const game=createGame();
    game.mission.activeId="M3";
    const built=place(game,"furnace",5,5,"E").state;
    const furnace=built.entities.find(entity=>entity.kind==="furnace")!;
    furnace.cycle=1;
    expect(()=>validateSave(built)).toThrow(/reservation/i);
    furnace.reservedInputs={iron_ore:2};
    expect(validateSave(built)).toEqual(built);
    furnace.cycle=50;
    expect(()=>validateSave(built)).toThrow(/processing cycle/i);
  });

  it("rejects a mine with a completed cycle and empty output",()=>{
    const built=place(createGame(),"iron_mine",3,5,"E").state;
    built.entities.find(entity=>entity.kind==="iron_mine")!.cycle=0;
    expect(()=>validateSave(built)).toThrow(/extraction cycle/i);
  });
});
