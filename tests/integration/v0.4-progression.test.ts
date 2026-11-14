import {describe,expect,it} from "vitest";
import {createGame,emptySales,type GameState} from "../../src/domain/model";
import {place,begin} from "../../src/game/commands";
import {beginChapterII,chapterWindow} from "../../src/game/chapterTwo";
import {technologyStatus,purchaseTechnology} from "../../src/game/technologies";
import {updateMission} from "../../src/game/missions";
import {tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

const done=()=>{const s=createGame();s.mission.activeId="DONE";s.technologies!.coal_extraction=true;
 s.technologies!.mechanical_components=true;s.technologies!.advanced_smelting=true;
 return s;};
const sales=(patch:Record<string,number>)=>({...emptySales(),...patch});
function injectEvents(s:GameState, events:{circuit?:number;steel?:number;produced?:number;covered?:boolean}[]){
 for(const e of events){const step=s.tick+1;
   // No engine state cheating: this isolated mission-rule contract calls
   // the same deterministic chapter observer as tick() with authoritative deltas.
   const {recordChapterTick}=requireChapter();
   s.tick=step;
   recordChapterTick(s,sales({circuit:e.circuit??0,steel:e.steel??0}),
     e.produced??0, e.covered??false);
   updateMission(s);
 }
}
function requireChapter(){return {recordChapterTick:recordChapterTickImported};}
import {recordChapterTick as recordChapterTickImported} from "../../src/game/chapterTwo";

describe("v0.4 WP2 red-first chapter & migration",()=>{
 it("opens Chapter II explicitly, preserving a completed foundry save and all physical stock",()=>{
   const original=done();original.balanceCents=71321;original.paused=true;
   const activated=beginChapterII(original);
   expect(activated.ok).toBe(true);
   const s=activated.state;
   expect(s.schemaVersion).toBe(4);
   expect(s.missionRuleVersion).toBe(4);
   expect(s.mission.activeId).toBe("M8");
   expect(s.chapterII).toMatchObject({foundryCompleted:true,started:true,completed:false});
   expect(s.balanceCents).toBe(original.balanceCents);
   expect(s.entities).toEqual(original.entities);
   expect(s.paused).toBe(true);
   expect(original.mission.activeId).toBe("DONE");
   expect(beginChapterII(s).ok).toBe(false);
   expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
 });
 it("does not start Chapter II early or accidentally on loading legacy DONE",()=>{
   const s=createGame();
   expect(beginChapterII(s).ok).toBe(false);
   const loaded=validateSave(done());
   expect(loaded.mission.activeId).toBe("DONE");
   expect(loaded.chapterII?.started??false).toBe(false);
   expect(loaded.missionRuleVersion).toBe(3);
 });
 it("gates copper, silicon, fabricators, splitter and generator behind separate paid research",()=>{
   let s=beginChapterII(done()).state;
   expect(place(s,"copper_mine",8,2,"E").ok).toBe(false);
   expect(place(s,"circuit_fabricator",4,4,"E").ok).toBe(false);
   expect(place(s,"splitter",4,4,"E").ok).toBe(false);
   expect(place(s,"coal_generator",4,4,"E").ok).toBe(false);
   s.balanceCents=100000;
   expect(technologyStatus(s,"resource_surveying").status).toBe("available");
   const purchased=purchaseTechnology(s,"resource_surveying");
   expect(purchased.ok).toBe(true);s=purchased.state;
   expect(s.balanceCents).toBe(92000);
   expect(purchaseTechnology(s,"resource_surveying").ok).toBe(false);
   expect(place(s,"copper_mine",8,2,"E").ok).toBe(true);
   expect(place(s,"silicon_extractor",8,9,"E").ok).toBe(true);
   expect(technologyStatus(s,"circuit_fabrication").status).toBe("locked");
   s.sales!.copper_ore=10;s.sales!.silicon=10;
   // Progression, rather than lifetime sales, is the unlock prerequisite.
   expect(technologyStatus(s,"circuit_fabrication").status).toBe("locked");
   injectEvents(s,Array.from({length:10},()=>({circuit:0})));
   expect(technologyStatus(s,"circuit_fabrication").status).toBe("locked");
 });
 it("M8 and M9 only count physically sold, post-activation products and require paid research",()=>{
   let s=beginChapterII(done()).state;s.balanceCents=100000;
   s=purchaseTechnology(s,"resource_surveying").state;
   const old={...s.sales!};old.copper_ore=999;old.silicon=999;s.sales=old;
   injectEvents(s,[{circuit:0}]);
   expect(s.mission.activeId).toBe("M8");
   for(let i=0;i<9;i++)injectEvents(s,[{circuit:0}]);
   const {recordChapterTick}=requireChapter();
   for(let i=0;i<10;i++){
     s.tick++;recordChapterTick(s,sales({copper_ore:1,silicon:1}),0,false);updateMission(s);
   }
   expect(s.mission.activeId).toBe("M9");
   expect(technologyStatus(s,"circuit_fabrication").status).toBe("available");
   s=purchaseTechnology(s,"circuit_fabrication").state;
   s=purchaseTechnology(s,"industrial_power").state;
   expect(s.balanceCents).toBe(70000);
   for(let i=0;i<4;i++){s.tick++;recordChapterTick(s,sales({circuit:1}),1,true);updateMission(s);}
   expect(s.mission.activeId).toBe("M10");
   expect(s.chapterII?.metrics?.activatedAtTick).toBe(s.tick);
 });
 it("M10 requires full post-activation rolling windows, 11 produced AND sold, steel, 57 covered demand ticks, 60-streak",()=>{
   let s=beginChapterII(done()).state;
   s.mission.activeId="M10";s.chapterII!.metrics={activatedAtTick:s.tick,salesTicks:[],streakTicks:0};
   const step=(circuits:number,steel:number,produced:number,covered=true)=>{
     s.tick++;recordChapterTickImported(s,sales({circuit:circuits,steel}),produced,covered);updateMission(s);
   };
   for(let i=0;i<59;i++)step(i<11?1:0,i<5?1:0,i<11?1:0);
   expect(chapterWindow(s)).toBeNull();
   expect(s.mission.activeId).toBe("M10");
   step(0,0,0);
   expect(s.chapterII!.metrics!.streakTicks).toBe(1);
   for(let i=0;i<59;i++)step(i<11?1:0,i<5?1:0,i<11?1:0);
   expect(s.mission.activeId).toBe("M10");
   step(0,0,0);
   expect(s.mission.activeId).toBe("DONE");
   expect(s.chapterII!.completed).toBe(true);
 });
 it("rejects stale, negative, nonconsecutive or overlong chapter windows without mutating original save",()=>{
   const s=beginChapterII(done()).state;
   const corrupted=structuredClone(s);
   corrupted.chapterII!.metrics!.streakTicks=-1;
   expect(()=>validateSave(corrupted)).toThrow();
   expect(s.chapterII!.metrics!.streakTicks).toBe(0);
   const missing=structuredClone(s);delete (missing as any).chapterII;
   expect(()=>validateSave(missing)).toThrow();
 });
 it("retains schema and rule version for active legacy M6/M7 and never introduces offline ticks",()=>{
   for(const version of [2,3] as const){
     const s=createGame();s.mission.activeId="M7";s.missionRuleVersion=version;
     s.missionMetrics=version===3?{activatedAtTick:0,salesTicks:[],streakTicks:0}:null;
     const restored=validateSave(JSON.parse(JSON.stringify(s)));
     expect(restored.missionRuleVersion).toBe(version);
     expect(restored.mission.activeId).toBe("M7");
     const paused={...restored,paused:true};expect(tick(paused)).toEqual(paused);
   }
 });
});
