import {describe,expect,it} from "vitest";
import {createGame} from "../../src/domain/model";
import {startPlaytest,advancePlaytest,annotatePlaytest,resumePlaytest,finishPlaytest,buildPlaytestReport,isPlaytestSession} from "../../src/ui/playtest";
import {resolveBuildCommit} from "../../src/ui/buildProvenance";
const SHA="b".repeat(40);
const game=()=>{const s=createGame();s.paused=false;s.introOpen=false;return s;};
describe("WP5 provenance, player-declared waiting and power samples — RED",()=>{
 it("accepts exact trusted CI commit and fails closed on untrusted or malformed values",()=>{
   expect(resolveBuildCommit(SHA)).toBe(SHA);
   for(const input of [null,undefined,"","v0.4","main","b".repeat(39),"B".repeat(40),"f".repeat(41),0])
     expect(resolveBuildCommit(input)).toBeNull();
 });
 it("preserves original artifact SHA and schema/rules through reload and a later game build",()=>{
   const s=game();s.missionRuleVersion=3;
   const session=startPlaytest(s,1000,SHA);
   expect(session.buildCommit).toBe(SHA);
   const upgraded=game();upgraded.schemaVersion=4;upgraded.missionRuleVersion=4;
   const saved=JSON.parse(JSON.stringify(session));
   const resumed=resumePlaytest(saved,upgraded,100000);
   const report=buildPlaytestReport(finishPlaytest(resumed,upgraded,101000));
   expect(report).toMatchObject({format:"sector-nine-playtest-v1",schemaVersion:3,
     missionRuleVersion:3,buildCommit:SHA});
   expect(isPlaytestSession(saved)).toBe(true);
   expect(resolveBuildCommit("untrusted")).toBeNull();
 });
 it("exports JSON null for local build and does not fabricate missing legacy SHA",()=>{
   const s=startPlaytest(game(),1000,null);
   expect(buildPlaytestReport(s).buildCommit).toBeNull();
   const old=JSON.parse(JSON.stringify(s));
   delete old.buildCommit;delete old.waitingForMissionMs;delete old.poweredTicks;delete old.unpoweredTicks;
   expect(isPlaytestSession(old)).toBe(true);
   const report=buildPlaytestReport(resumePlaytest(old,game(),5000));
   expect(report.buildCommit).toBeNull();
   expect(report.waitingForMissionMs??0).toBe(0);
 });
 it("separates waiting for stability from waiting for credits and reconciles wall time",()=>{
   const s=game();
   let rec=startPlaytest(s,0,SHA);
   rec=annotatePlaytest(rec,"waiting_mission",1000);
   rec=advancePlaytest(rec,s,4000);
   rec=annotatePlaytest(rec,"waiting",4000);
   rec=advancePlaytest(rec,s,6000);
   rec=annotatePlaytest(rec,"planning",6000);
   rec=advancePlaytest(rec,s,7000);
   const paused=game();paused.paused=true;
   rec=advancePlaytest(rec,paused,8000);
   rec=advancePlaytest(rec,paused,9000);
   const result=buildPlaytestReport(finishPlaytest(rec,paused,9000));
   expect(result.waitingForMissionMs).toBe(3000);
   expect(result.waitingMs).toBe(2000);
   expect(result.planningMs).toBe(2000);
   expect(result.pausedMs).toBe(1000);
   expect(result.unclassifiedMs).toBe(1000);
   expect(result.wallMs).toBe(9000);
   expect(result.wallMs).toBe(result.pausedMs+result.planningMs+result.waitingMs+
      result.waitingForMissionMs+result.unclassifiedMs);
 });
 it("counts only newly observed engine power ticks and never estimates missing samples",()=>{
   const s=game();let rec=startPlaytest(s,1000,SHA);
   s.tick=3;s.power={tick:3,supply:1,demand:1,served:1,demandCovered:true,
     unpoweredProcessingTicks:0,coalBurned:0,lastServedFabricatorId:0,
     history:[{tick:1,supply:1,demand:1,served:1,demandCovered:true,unpoweredProcessingTicks:0,coalBurned:0},
       {tick:2,supply:0,demand:1,served:0,demandCovered:false,unpoweredProcessingTicks:1,coalBurned:0},
       {tick:3,supply:1,demand:1,served:1,demandCovered:true,unpoweredProcessingTicks:0,coalBurned:0}]};
   rec=advancePlaytest(rec,s,4000);
   rec=advancePlaytest(rec,s,4500);
   expect(buildPlaytestReport(rec)).toMatchObject({poweredTicks:2,unpoweredTicks:1});
   expect(isPlaytestSession(JSON.parse(JSON.stringify(rec)))).toBe(true);
 });
 it("rejects malformed provenance and timing rather than silently trusting them",()=>{
   const s=startPlaytest(game(),1000,SHA);
   for(const bad of ["abc","A".repeat(40),false,123]){
     const corrupt={...s,buildCommit:bad};
     expect(isPlaytestSession(corrupt)).toBe(false);
   }
   expect(isPlaytestSession({...s,waitingForMissionMs:-1})).toBe(false);
 });
});