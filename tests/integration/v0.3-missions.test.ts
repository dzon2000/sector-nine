import {describe,expect,it} from "vitest";
import {createGame,emptySales,type GameState,type Item} from "../../src/domain/model";
import {activateMissionMetrics,missionWindow,recordMissionTick} from "../../src/game/missionMetrics";
import {updateMission} from "../../src/game/missions";
import {tick,runTicks} from "../../src/simulation/engine";
import {validateSave} from "../../src/persistence/indexedDb";

type Product = "gear"|"steel";
function at(id:"M6"|"M7",version:2|3=3):GameState {
  const s=createGame();s.mission.activeId=id;s.missionRuleVersion=version;
  s.missionMetrics=version===3?activateMissionMetrics(0):null;
  s.paused=false;
  return s;
}
/** Synthetic terminal/accounting event fixture for the mission evaluator, not a physical factory benchmark. */
function advance(s:GameState,products:Partial<Record<Product,number>>,profitCents:number):GameState {
  s=structuredClone(s);
  s.tick++;
  const sales=emptySales();
  for(const item of ["gear","steel"] as const)sales[item]=products[item]??0;
  s.rollingEvents.push({tick:s.tick,revenueCents:profitCents,costCents:0});
  if(s.rollingEvents.length>60)s.rollingEvents.shift();
  recordMissionTick(s,sales);
  updateMission(s);
  return s;
}
function step(s:GameState,gear:number,steel=0,profitCents=300):GameState{
  return advance(s,{gear,steel},profitCents);
}
function gear120(s:GameState, gearCount=9):GameState {
  for(let i=1;i<=178;i++){
    s=step(s,(i-1)%60<gearCount?1:0);
  }
  return s;
}
function m7Sequence(s:GameState,count:number,gearPer60=7,steelPer60=7,profitCents=300):GameState{
  for(let i=0;i<count;i++){
    const slot=i%60;
    s=step(s,slot<gearPer60?1:0,slot>=7&&slot<7+steelPer60?1:0,profitCents);
  }
  return s;
}
describe("WP2 new sustained-throughput mission rules",()=>{
  it("preserves M5 physical coal sales and activates a clean M6 measurement epoch",()=>{
    let s=createGame();s.mission.activeId="M5";s.mission.soldCoal=9;s.paused=false;
    s.entities.push({id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:"coal",oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    s=tick(s);
    expect(s.mission.activeId).toBe("M6");
    expect(s.missionMetrics).toEqual({activatedAtTick:1,salesTicks:[],streakTicks:0});
    expect(s.mission.soldCoal).toBe(10);
  });

  it("M6 excludes partial windows and rejects 8 while accepting 9 gears per trailing 60 ticks",()=>{
    let s=at("M6");
    for(let i=0;i<59;i++)s=step(s,i<9?1:0);
    expect(missionWindow(s)).toBeNull();
    expect(s.missionMetrics?.streakTicks).toBe(0);
    s=step(s,0);
    expect(missionWindow(s)?.sales.gear).toBe(9);
    expect(s.missionMetrics?.streakTicks).toBe(1);
    s=at("M6");
    s=gear120(s,8);
    expect(s.missionMetrics?.streakTicks).toBe(0);
    expect(s.mission.activeId).toBe("M6");
  });

  it("evaluates the same active tick at most once even when the mission evaluator is called again",()=>{
    let s=at("M6");
    for(let i=0;i<60;i++)s=step(s,i<9?1:0);
    expect(s.missionMetrics?.streakTicks).toBe(1);
    updateMission(s);
    updateMission(s);
    expect(s.missionMetrics?.streakTicks).toBe(1);
    s=step(s,1); // Replace the gear leaving the trailing window.
    expect(s.missionMetrics?.streakTicks).toBe(2);
  });

  it("M6 resets immediately when a single rolling window drops from nine gears to eight",()=>{
    let s=at("M6");
    for(let i=0;i<60;i++)s=step(s,i<9?1:0);
    expect(s.missionMetrics?.streakTicks).toBe(1);
    s=step(s,0); // First recorded gear leaves the 60-tick window.
    expect(missionWindow(s)?.sales.gear).toBe(8);
    expect(s.missionMetrics?.streakTicks).toBe(0);
    expect(s.mission.activeId).toBe("M6");
  });

  it("M6 requires full 120 consecutive evaluated windows, resets after one failing tick and never revokes completion",()=>{
    let s=at("M6");
    s=gear120(s);
    expect(s.mission.activeId).toBe("M6");
    expect(s.missionMetrics?.streakTicks).toBe(119); // 60th through 178th tick
    // Deliberately ensure no 120th qualifying evaluated tick before active tick 179.
    s=at("M6");s=gear120(s,9);
    expect(s.mission.activeId).toBe("M6");
    s=step(s,0);
    expect(s.mission.activeId).toBe("M7");
    expect(s.missionMetrics).toEqual({activatedAtTick:179,salesTicks:[],streakTicks:0});
    const done=structuredClone(s);done.mission.activeId="DONE";done.missionMetrics=null;
    expect(updateMission(done)).toBeNull();
    expect(done.mission.activeId).toBe("DONE");
    let reset=at("M6");
    for(let i=0;i<70;i++)reset=step(reset,i%6===0?1:0);
    expect(reset.missionMetrics!.streakTicks).toBeGreaterThan(0);
    for(let i=0;i<60;i++)reset=step(reset,0);
    expect(reset.missionMetrics!.streakTicks).toBe(0);
    expect(reset.mission.activeId).toBe("M6");
  });

  it("M7 requires advanced smelting and each simultaneous gear, steel and profit threshold",()=>{
    for(const [gears,steels,profit,unlocked,passes] of [
      [7,7,300,true,true],[6,7,300,true,false],[7,6,300,true,false],
      [7,7,291,true,false],[7,7,300,false,false]
    ] as const){
      let s=at("M7");s.technologies!.advanced_smelting=unlocked;
      s=m7Sequence(s,178,gears,steels,profit);
      expect(s.mission.activeId,JSON.stringify({gears,steels,profit,unlocked})).toBe("M7");
      s=step(s,0,0,profit);
      expect(s.mission.activeId,JSON.stringify({gears,steels,profit,unlocked})).toBe(passes?"DONE":"M7");
    }
  });

  it("M7 accepts exact 17500 cents and rejects 17499 cents; no research or capital leakage",()=>{
    let s=at("M7");s.technologies!.advanced_smelting=true;
    s= m7Sequence(s,59,7,7,300);
    s=step(s,0,0,17500-59*300);
    expect(missionWindow(s)?.profitCents).toBe(17500);
    expect(s.missionMetrics?.streakTicks).toBe(1);
    s.balanceCents-=18000;
    expect(missionWindow(s)?.profitCents).toBe(17500);
    let bad=at("M7");bad.technologies!.advanced_smelting=true;
    bad=m7Sequence(bad,59,7,7,300);
    bad=step(bad,0,0,17500-59*300-1);
    expect(missionWindow(bad)?.profitCents).toBe(17499);
    expect(bad.missionMetrics?.streakTicks).toBe(0);
  });

  it("M7 resets the streak on one missing condition at the last evaluated tick, and can recover",()=>{
    let s=at("M7");s.technologies!.advanced_smelting=true;
    s=m7Sequence(s,178);
    expect(s.missionMetrics!.streakTicks).toBe(119);
    s=step(s,0,0,-20000);
    expect(s.missionMetrics!.streakTicks).toBe(0);
    expect(s.mission.activeId).toBe("M7");
    s=m7Sequence(s,240);
    expect(s.mission.activeId).toBe("DONE");
  });

  it("rejects only-gears and only-steel factories even when profit is high",()=>{
    for(const [gears,steel] of [[15,0],[0,15]]){
      let s=at("M7");s.technologies!.advanced_smelting=true;
      s=m7Sequence(s,240,gears,steel,600);
      expect(s.mission.activeId).toBe("M7");
      expect(s.missionMetrics!.streakTicks).toBe(0);
    }
  });

  it("retains exact mission evaluation across pause and schema v3 save/restore",()=>{
    let s=at("M7");s.technologies!.advanced_smelting=true;
    s=m7Sequence(s,120);
    expect(s.missionMetrics!.streakTicks).toBeGreaterThan(0);
    const restored=validateSave(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual(s);
    const stopped={...restored,paused:true};
    expect(runTicks(stopped,30)).toEqual(stopped);
    const a=m7Sequence(s,60),b=m7Sequence(restored,60);
    expect(a).toEqual(b);
    expect(a.mission.activeId).toBe("DONE");
  });
});

describe("WP2 legacy mission contracts",()=>{
  it("preserves prior M6 partial progress and completes on exactly eight actual terminal gear sales",()=>{
    let s=at("M6",2);s.mission.soldGear=7;
    s.entities.push({id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:"gear",oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    s=validateSave(JSON.parse(JSON.stringify(s)));
    s=tick(s);
    expect(s.mission.activeId).toBe("M7");
    expect(s.missionRuleVersion).toBe(2);
    expect(s.missionMetrics).toBeNull();
    expect(s.mission.soldGear).toBe(8);
  });
  it("preserves prior M7 partial steel progress, technology gate and already completed DONE",()=>{
    let s=at("M7",2);s.mission.soldSteel=7;
    s.entities.push({id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:"steel",oreInput:0,cycle:null,status:"working",inputBuffers:{},reservedInputs:{}});
    s=tick(s);
    expect(s.mission.activeId).toBe("M7");
    s.technologies!.advanced_smelting=true;
    updateMission(s);
    expect(s.mission.activeId).toBe("DONE");
    expect(validateSave({...s,paused:true}).mission.activeId).toBe("DONE");
  });
  it("v2 active M5 migrates to v3 M6, whereas old M6 and M7 retain v2 rules",()=>{
    for(const id of ["M5","M6","M7","DONE"] as const){
      const s=createGame();s.schemaVersion=2;s.mission.activeId=id;
      delete s.missionRuleVersion;delete s.missionMetrics;
      const n=validateSave(s);
      expect(n.missionRuleVersion).toBe(id==="M6"||id==="M7"?2:3);
      expect(n.mission.activeId).toBe(id);
      expect(validateSave(n)).toEqual(n);
    }
  });
});
