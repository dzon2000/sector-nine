import {describe,expect,it} from "vitest";
import {createGame,DEFINITIONS,REVENUE,RECIPES,DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,TERMINAL,ITEMS,stockOnHand} from "../../src/domain/model";
import {begin,setPause,place,remove} from "../../src/game/commands";
import {beginChapterII} from "../../src/game/chapterTwo";
import {availableTransmissions} from "../../src/game/chapterNarrative";
import {tick,runTicks} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

describe("WP6 release gates — immutable economics, save ancestry and sandbox",()=>{
 it("freezes legacy v0.1–v0.3 numbers and Option A new sites/costs",()=>{
   expect(Object.fromEntries(["iron_mine","furnace","conveyor","coal_mine","assembler","advanced_furnace"].map(
     kind=>[kind,DEFINITIONS[kind as keyof typeof DEFINITIONS].price]))).toEqual({
     iron_mine:4500,furnace:8000,conveyor:500,coal_mine:6500,assembler:13000,advanced_furnace:18000
   });
   expect(REVENUE).toEqual({iron_ore:200,iron_ingot:700,coal:300,gear:2100,steel:2600,
     copper_ore:400,silicon:500,circuit:3000});
   expect(RECIPES).toEqual({
     iron_ingot:{input:{iron_ore:2},output:"iron_ingot",durationTicks:4,operatingCostCents:160},
     gear:{input:{iron_ingot:2},output:"gear",durationTicks:5,operatingCostCents:250},
     steel:{input:{iron_ingot:2,coal:1},output:"steel",durationTicks:8,operatingCostCents:350},
     circuit:{input:{copper_ore:2,silicon:1},output:"circuit",durationTicks:6,operatingCostCents:300}
   });
   expect(DEPOSITS).toEqual([{x:3,y:5},{x:2,y:2},{x:2,y:9}]);
   expect(COAL_DEPOSITS).toEqual([{x:7,y:9},{x:5,y:9}]);
   expect(COPPER_DEPOSITS).toEqual([{x:8,y:2}]);
   expect(SILICON_DEPOSITS).toEqual([{x:8,y:9}]);
   expect(TERMINAL).toEqual({x:10,y:5});
 });
 it("explicit v0.3 DONE -> v0.4 preserves occupied deposits, old ledgers, state and free-play after Chapter II completion",()=>{
   let old=begin(createGame());old.mission.activeId="DONE";
   old.technologies={coal_extraction:true,mechanical_components:true,advanced_smelting:true};
   let created=place(old,"conveyor",8,2,"E");expect(created.ok).toBe(true);old=created.state;
   old=runTicks(old,4);old.paused=true;
   const original=validateSave(JSON.parse(JSON.stringify(old)));
   expect(original.schemaVersion).toBe(3);
   expect(original.mission.activeId).toBe("DONE");
   expect(availableTransmissions(original)).toEqual([]);
   const beforeJSON=JSON.stringify(original);
   const begun=beginChapterII(original);expect(begun.ok).toBe(true);
   let chapter=begun.state;
   expect(JSON.stringify(original)).toBe(beforeJSON);
   expect(chapter.schemaVersion).toBe(4);
   expect(chapter.missionRuleVersion).toBe(4);
   expect(chapter.mission.activeId).toBe("M8");
   expect(chapter.balanceCents).toBe(original.balanceCents);
   expect(chapter.entities).toEqual(original.entities);
   expect(chapter.sales).toEqual(original.sales);
   expect(chapter.materialLedger).toEqual(original.materialLedger);
   expect(chapter.diagnostics).toEqual(original.diagnostics);
   expect(chapter.chapterII?.foundryCompleted).toBe(true);
   expect(availableTransmissions(chapter)).toEqual(["opening"]);
   expect(place(chapter,"copper_mine",8,2,"E").ok).toBe(false);
   chapter=validateSave(JSON.parse(JSON.stringify(chapter)));
   expect(beginChapterII(chapter).ok).toBe(false);
   // Acceptance fixture explicitly models a previously validated M10 completion,
   // not another claim of a physically played campaign.
   chapter.mission.activeId="DONE";chapter.chapterII!.completed=true;chapter.chapterII!.metrics=null;
   chapter.technologies!.resource_surveying=true;chapter.technologies!.circuit_fabrication=true;chapter.technologies!.industrial_power=true;
   chapter=validateSave(JSON.parse(JSON.stringify(chapter)));
   expect(availableTransmissions(chapter)).toEqual(["opening","m8","m9","m10"]);
   chapter.paused=false;
   const advanced=tick(chapter);
   expect(advanced.tick).toBe(chapter.tick+1);
   expect(advanced.mission.activeId).toBe("DONE");
   expect(advanced.chapterII?.completed).toBe(true);
   expect(advanced.chapterII?.foundryCompleted).toBe(true);
   expect(validateSave(JSON.parse(JSON.stringify(advanced)))).toEqual(advanced);
 });
 it("recovers a misplaced build by demolition without creating cash or losing physical materials",()=>{
   let s=createGame();const before=s.balanceCents;
   const placed=place(s,"conveyor",0,0,"E");expect(placed.ok).toBe(true);s=placed.state;
   const id=s.entities.find(e=>e.x===0&&e.y===0)!.id;
   const denied=remove(s,id,false);expect(denied.ok).toBe(false);
   const cleared=remove(s,id,true);expect(cleared.ok).toBe(true);s=cleared.state;
   expect(s.entities.length).toBe(1);
   expect(s.balanceCents).toBe(before-DEFINITIONS.conveyor.price+
     Math.floor(DEFINITIONS.conveyor.price*0.75));
   const onHand=stockOnHand(s.entities);
   for(const item of ITEMS){
     const l=s.materialLedger![item];
     expect(l.opening+l.produced-l.consumed-l.sold-l.demolished-l.burned).toBe(onHand[item]);
   }
   expect(tick(setPause(s,true))).toEqual(setPause(s,true));
 });
});