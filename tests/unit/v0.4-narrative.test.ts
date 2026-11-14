import {describe,expect,it} from "vitest";
import {createGame} from "../../src/domain/model";
import {availableTransmissions,CHAPTER_TRANSMISSIONS} from "../../src/game/chapterNarrative";
const begin=()=>{const s=createGame();s.schemaVersion=4;s.missionRuleVersion=4;s.chapterII={
 foundryCompleted:true,started:true,completed:false,storySeen:false,metrics:null};
 s.mission.activeId="M8";return s;};
describe("WP5 approved Chapter II narrative",()=>{
 it("keeps narrative opt-in and unlocks messages only after real mission progress",()=>{
   const s=begin();
   expect(availableTransmissions(s)).toEqual(["opening"]);
   s.mission.activeId="M9";
   expect(availableTransmissions(s)).toEqual(["opening","m8"]);
   s.mission.activeId="M10";
   expect(availableTransmissions(s)).toEqual(["opening","m8","m9"]);
   s.mission.activeId="DONE";s.chapterII!.completed=true;
   expect(availableTransmissions(s)).toEqual(["opening","m8","m9","m10"]);
   expect(availableTransmissions(createGame())).toEqual([]);
 });
 it("preserves exact unknown client, Prometheus and corporate override narrative beats",()=>{
   expect(CHAPTER_TRANSMISSIONS.opening.pages.map(p=>p.text).join(" ")).toMatch(/Steel was the key, not the destination/);
   expect(CHAPTER_TRANSMISSIONS.m8.pages[0].text).toMatch(/PROJECT PROMETHEUS/);
   expect(CHAPTER_TRANSMISSIONS.m9.pages[0].text).toMatch(/power itself/);
   expect(CHAPTER_TRANSMISSIONS.m10.pages.map(p=>p.text).join(" ")).toMatch(/SUBLEVEL 03/);
   expect(CHAPTER_TRANSMISSIONS.m10.pages.map(p=>p.text).join(" ")).toMatch(/Suspend investigation/);
 });
});