import {describe,expect,it} from "vitest";
import {createGame,type GameState} from "../../src/domain/model";
import {updateMission} from "../../src/game/missions";
import {tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

function atMission(id:"M5"|"M6"|"M7"):GameState{
 const s=createGame();s.mission.activeId=id;s.missionRuleVersion=2;s.missionMetrics=null;s.paused=false;s.introOpen=false;return s;
}
function sell(s:GameState,item:"coal"|"gear"|"steel",n=1):GameState{
 let next=s;
 for(let i=0;i<n;i++){
   const t=structuredClone(next);
   t.entities.push({id:t.nextId++,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:item,oreInput:0,inputBuffers:{},reservedInputs:{},cycle:null,status:"working"});
   next=tick(t);
   next.entities=next.entities.filter(e=>e.kind!=="conveyor");
 }
 return next;
}
describe("WP5 mission progression and narrative (AC-13, AC-15)",()=>{
 it("M4 completion starts M5 instead of ending Chapter I campaign permanently",()=>{
   const s=createGame();s.mission.activeId="M4";s.mission.profitStreakTicks=59;
   s.rollingEvents=Array.from({length:60},(_,i)=>({tick:i,revenueCents:100,costCents:0}));
   updateMission(s);
   expect(s.mission.activeId).toBe("M5");
   expect(s.foundryStorySeen).toBe(false);
 });
 it("M5 increments on coal terminal sales only, not production or lifetime counter",()=>{
   let s=atMission("M5");
   s.sales!.coal=100;s.materialLedger!.coal.produced=200;
   updateMission(s);expect(s.mission.activeId).toBe("M5");
   s=sell(s,"coal",9);
   expect(s.mission.activeId).toBe("M5");
   expect(s.mission.soldCoal).toBe(9);
   s=sell(s,"coal");
   expect(s.mission.activeId).toBe("M6");
   expect(s.mission.soldCoal).toBe(10);
 });
 it("M6 counts eight gears sold after activation and advances sequentially",()=>{
   let s=atMission("M6");
   s.sales!.gear=200;
   s=sell(s,"gear",7);
   expect(s.mission.activeId).toBe("M6");
   s=sell(s,"gear");
   expect(s.mission.activeId).toBe("M7");
   expect(s.mission.soldGear).toBe(8);
 });
 it("M7 needs both advanced smelting unlock and eight steel terminal deliveries",()=>{
   let s=atMission("M7");
   s=sell(s,"steel",8);
   expect(s.mission.activeId).toBe("M7");
   expect(s.mission.soldSteel).toBe(8);
   s.technologies!.advanced_smelting=true;
   updateMission(s);
   expect(s.mission.activeId).toBe("DONE");
 });
 it("does not count sold gear towards the next M7 steel mission",()=>{
   let s=atMission("M6");
   s.technologies!.advanced_smelting=true;
   s=sell(s,"gear",8);
   expect(s.mission.activeId).toBe("M7");
   expect(s.mission.soldSteel).toBe(0);
   s=sell(s,"steel",7);
   expect(s.mission.activeId).toBe("M7");
 });
 it("migrates v1 DONE to M5, retains lifetime sales and protects existing structures",()=>{
   const old=createGame();
   old.schemaVersion=1;old.mission.activeId="DONE";old.mission.soldIngot=22;
   delete old.technologies;delete old.coalDeposits;
   for(const e of old.entities){delete e.inputBuffers;delete e.reservedInputs;}
   const next=validateSave(old);
   expect(next.mission.activeId).toBe("M5");
   expect(next.sales!.iron_ingot).toBe(22);
   expect(next.mission.soldCoal).toBe(0);
   expect(next.foundryStorySeen).toBe(false);
   expect(validateSave(next)).toEqual(next);
 });
 it("upgrades pre-WP5 v2 snapshots once and preserves existing financial history",()=>{
   const old=createGame();
   old.mission.activeId="DONE";
   old.balanceCents=9743;
   old.tick=145;
   delete old.foundryStorySeen;
   delete old.mission.soldCoal;delete old.mission.soldGear;delete old.mission.soldSteel;
   const restored=validateSave(old);
   expect(restored.mission.activeId).toBe("M5");
   expect(restored.balanceCents).toBe(9743);
   expect(restored.tick).toBe(145);
   expect(restored.foundryStorySeen).toBe(false);
   expect(validateSave(restored)).toEqual(restored);
 });
 it("persisted narrative acknowledgement survives reload without modifying economy",()=>{
   const s=atMission("M5");s.foundryStorySeen=true;
   const restored=validateSave(JSON.parse(JSON.stringify(s)));
   expect(restored.foundryStorySeen).toBe(true);
   expect(restored.balanceCents).toBe(s.balanceCents);
 });
});
