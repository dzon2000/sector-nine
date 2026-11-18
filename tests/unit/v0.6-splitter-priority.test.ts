import {expect,it} from "vitest";
import {createGame,STEP,type Direction} from "../../src/domain/model";
import {begin,place,setSplitterMode} from "../../src/game/commands";
import {validateSave} from "../../src/persistence/indexedDb";
import {beginChapterIV} from "../../src/game/chapterFour";
import {tick} from "../../src/simulation/engine";

function ready(){
  const state=begin(createGame());
  state.mission.activeId="DONE";
  state.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
  Object.assign(state.technologies!,{resource_surveying:true,circuit_fabrication:true,industrial_power:true});
  state.chapterIII={route:"independent",completed:["M11","M12","M13"],active:null};
  return beginChapterIV(state).state;
}

it("rejects early priority commands and pre-Chapter IV persisted priority",()=>{
  const state=begin(createGame());
  state.technologies!.circuit_fabrication=true;
  const placed=place(state,"splitter",5,5,"N").state;
  const splitter=placed.entities[1];
  expect(setSplitterMode(placed,splitter.id,"forward")).toMatchObject({ok:false,state:placed});
  splitter.splitterMode="forward";
  expect(()=>validateSave(placed)).toThrow(/splitter.*mode/i);
});

it.each(["N","E","S","W"] as const)("retains local outlet priority and alternating cursor when facing %s",(direction:Direction)=>{
  const state=ready();
  const splitter=place(state,"splitter",5,5,direction).state;
  const [dx,dy]=STEP[direction];
  const forward=place(splitter,"conveyor",5+dx,5+dy,"N").state;
  const both=place(forward,"conveyor",5-dy,5+dx,"N").state;
  const entity=both.entities[1];
  entity.belt="iron_ore";
  both.materialLedger!.iron_ore.opening++;
  const changed=setSplitterMode(both,entity.id,"clockwise");
  expect(changed.ok).toBe(true);
  expect(changed.state.entities[1].belt).toBe("iron_ore");
  expect(changed.state.tick).toBe(0);
  const restored=validateSave(JSON.parse(JSON.stringify(changed.state)));
  expect(tick(restored)).toEqual(tick(changed.state));
  const moved=tick(restored);
  expect(moved.entities[3].belt).toBe("iron_ore");
  expect(moved.entities[2].belt).toBeNull();
  expect(moved.entities[1].splitterNext).toBe(0);
  expect(setSplitterMode(moved,entity.id,"alternating").state.entities[1].splitterNext).toBe(0);
  expect(setSplitterMode(both,both.entities[0].id,"forward").ok).toBe(false);
  const invalid=structuredClone(changed.state);
  (invalid.entities[1] as {splitterMode?:string}).splitterMode="invalid";
  expect(()=>validateSave(invalid)).toThrow(/splitter.*mode/i);
});

it("falls back only on snapshot ineligibility and preserves the existing contested-target arbiter",()=>{
  const initial=ready();
  const [s,forward,clockwise,other]=[
    ["splitter",5,5,"N"],
    ["conveyor",5,4,"N"],
    ["conveyor",6,5,"N"],
    ["conveyor",4,4,"E"],
  ] as const;
  let state=initial;
  for(const [kind,x,y,direction] of [s,forward,clockwise,other]){
    const command=place(state,kind,x,y,direction);
    expect(command.ok,command.message).toBe(true);
    state=command.state;
  }
  const [splitter,preferred,fallback,competitor]=state.entities.slice(1);
  splitter.belt="iron_ore";
  competitor.belt="coal";
  state.materialLedger!.iron_ore.opening++;
  state.materialLedger!.coal.opening++;
  state.arbiters[String(preferred.id)]=splitter.id;
  const priority=setSplitterMode(state,splitter.id,"forward").state;
  const lost=tick(priority);
  const cargo=(s:typeof state,id:number)=>s.entities.find(entity=>entity.id===id)?.belt;
  expect(cargo(lost,preferred.id)).toBe("coal");
  expect(cargo(lost,fallback.id)).toBeNull();
  expect(cargo(lost,splitter.id)).toBe("iron_ore");
  const moved=tick(lost);
  expect(cargo(moved,fallback.id)).toBe("iron_ore");
  expect(cargo(moved,splitter.id)).toBeNull();
  const blocked=structuredClone(lost);
  blocked.entities.find(entity=>entity.id===fallback.id)!.belt="gear";
  blocked.materialLedger!.gear.opening++;
  expect(cargo(tick(blocked),splitter.id)).toBe("iron_ore");
  const paused={...lost,paused:true};
  expect(tick(paused)).toBe(paused);
});
