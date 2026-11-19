import {expect,it} from "vitest";
import {createGame, type GameState} from "../../src/domain/model";
import {summarizeChapterIVTicks,type ChapterIVTick} from "../../src/domain/chapterFour";
import {beginChapterIV,currentChapterIVWindow,recordChapterIVTick} from "../../src/game/chapterFour";
import {begin,place,remove} from "../../src/game/commands";
import {runTicks} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

function checkpoint(){
  const state=begin(createGame());
  state.mission.activeId="DONE";
  Object.assign(state.technologies!,{resource_surveying:true,circuit_fabrication:true,industrial_power:true});
  state.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
  state.chapterIII={completed:["M11","M12","M13"],active:null,route:"independent"};
  return state;
}
function window(offset:number,gear=true):ChapterIVTick[]{
  return Array.from({length:30},(_,i)=>{
    const circuit=Number(i%5===0);
    const gears=Number(gear&&i%6===0);
    return {tick:offset+i+1,circuitSales:circuit,circuitProduced:circuit,gearSales:gears,gearProduced:gears};
  });
}
function advance(state:GameState,samples:ChapterIVTick[]){
  for(const sample of samples){state.tick=sample.tick;recordChapterIVTick(state,sample);}
}
it("allows explicit activation only after M13 and requires two independent full windows",()=>{
  expect(beginChapterIV(begin(createGame())).ok).toBe(false);
  const initial=checkpoint();
  const state=beginChapterIV(initial).state;
  expect(initial.chapterIV).toBeUndefined();
  expect(beginChapterIV(state).ok).toBe(false);
  advance(state,window(0).slice(0,29));
  expect(currentChapterIVWindow(state)).toBeNull();
  expect(state.chapterIV?.activeId).toBe("M14");
  advance(state,window(0).slice(29));
  expect(state.chapterIV).toMatchObject({completed:["M14"],activeId:"M15",activatedAtTick:30,ticks:[]});
  advance(state,window(30));
  expect(state.chapterIV).toMatchObject({completed:["M14","M15"],activeId:null,ticks:[]});
  advance(state,window(60));
  expect(state.chapterIV?.completed).toEqual(["M14","M15"]);
});
it("counts both window edges and rejects stockpile-only circuit or gear sales",()=>{
  const gapped=window(0);
  gapped[0].circuitSales=0;
  gapped[29].circuitSales=1;
  expect(summarizeChapterIVTicks(gapped).maxCircuitGap).toBe(5);
  const leading=window(0);
  leading[0].circuitSales=0;
  leading[1].circuitSales=0;
  expect(summarizeChapterIVTicks(leading).maxCircuitGap).toBe(5);
  const trailing=window(0);
  trailing[25].circuitSales=0;
  expect(summarizeChapterIVTicks(trailing).maxCircuitGap).toBe(9);
  const state=beginChapterIV(checkpoint()).state;
  advance(state,window(0).map(s=>({...s,circuitProduced:0})));
  expect(state.chapterIV?.activeId).toBe("M14");
  advance(state,window(30));
  expect(state.chapterIV?.activeId).toBe("M15");
  advance(state,window(60).map(s=>({...s,gearProduced:0})));
  expect(state.chapterIV?.activeId).toBe("M15");
});
it("validates active window, route and ordered archive state on restore",()=>{
  const state=runTicks(beginChapterIV(checkpoint()).state,12);
  const restored=validateSave(JSON.parse(JSON.stringify(state)));
  expect(restored).toEqual(state);
  expect(runTicks(restored,20)).toEqual(runTicks(state,20));
  const malformed=[
    {...state.chapterIV!,route:"corporate"},
    {...state.chapterIV!,completed:["M15"]},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.slice(1)},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.map(s=>({...s,gearSales:-1}))},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.map(s=>({...s,circuitSales:2,gearSales:2}))},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.map(s=>({...s,circuitSales:1}))},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.map(s=>({...s,circuitProduced:144}))},
    {...state.chapterIV!,ticks:state.chapterIV!.ticks.map(s=>({...s,gearProduced:1}))},
  ];
  for(const chapterIV of malformed)expect(()=>validateSave({...state,chapterIV})).toThrow(/Chapter IV/);
});

it("rejects fabricated fresh production backed only by historical ledger totals",()=>{
  const initial=checkpoint();
  initial.materialLedger!.circuit.produced=20;
  initial.materialLedger!.circuit.sold=20;
  initial.sales!.circuit=20;
  const active=runTicks(beginChapterIV(initial).state,12);
  expect(validateSave(active)).toEqual(active);

  active.chapterIV!.ticks[0].circuitProduced=6;
  expect(()=>validateSave(active)).toThrow(/Chapter IV/);
});

it("rejects Chapter IV completion without qualifying windows",()=>{
  const state=runTicks(beginChapterIV(checkpoint()).state,65);
  Object.assign(state.chapterIV!,{
    completed:["M14","M15"],activeId:null,activatedAtTick:30,ticks:[],
  });
  expect(()=>validateSave(state)).toThrow(/Chapter IV/);
});

it("preserves production evidence when the producing machine is demolished",()=>{
  const initial=checkpoint();
  initial.technologies!.mechanical_components=true;
  const placed=place(initial,"assembler",5,5,"N");
  expect(placed.ok).toBe(true);
  const assembler=placed.state.entities[1];
  assembler.cycle=1;
  assembler.reservedInputs={iron_ingot:2};
  placed.state.materialLedger!.iron_ingot.opening=2;

  const produced=runTicks(beginChapterIV(placed.state).state,1);
  expect(produced.chapterIV!.ticks[0].gearProduced).toBe(1);
  const demolished=remove(produced,assembler.id,true);
  expect(demolished.ok).toBe(true);
  const sample=demolished.state.diagnostics!.samples[0];
  expect(sample.entities[String(assembler.id)]).toBeUndefined();
  expect(sample.chapterIVProduction?.gear).toBe(1);
  expect(validateSave(JSON.parse(JSON.stringify(demolished.state)))).toEqual(demolished.state);
});
