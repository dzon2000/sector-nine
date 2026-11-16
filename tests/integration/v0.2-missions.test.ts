import {describe,expect,it} from "vitest";
import {createGame,type GameState} from "../../src/domain/model";
import {updateMission} from "../../src/game/missions";
import {tick} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

function atMission(id:"M5"|"M6"|"M7"):GameState{
 const s=createGame();s.mission.activeId=id;s.missionMetrics=null;s.paused=false;s.introOpen=false;return s;
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
 it("persisted narrative acknowledgement survives reload without modifying economy",()=>{
   const s=atMission("M5");s.foundryStorySeen=true;
   const restored=validateSave(JSON.parse(JSON.stringify(s)));
   expect(restored.foundryStorySeen).toBe(true);
   expect(restored.balanceCents).toBe(s.balanceCents);
 });
});
