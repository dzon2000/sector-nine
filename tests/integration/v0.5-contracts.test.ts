import {describe,expect,it} from "vitest";
import type {ContractTick} from "../../src/domain/contracts";
import {createGame,emptyLedger,emptySales,REVENUE,type GameState} from "../../src/domain/model";
import {
  acceptChapterIIIContract,beginChapterIII,chooseChapterIIIRoute,currentChapterIIIWindow,recordContractTick,
} from "../../src/game/chapterThree";
import {begin} from "../../src/game/commands";
import {tick} from "../../src/simulation/engine";

function completedChapterII():GameState {
  const state=begin(createGame());
  state.mission.activeId="DONE";
  state.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:false,metrics:null};
  return state;
}

function startedChapterIII():GameState {
  const result=beginChapterIII(completedChapterII());
  expect(result.ok).toBe(true);
  return result.state;
}

function advanceContract(state:GameState,count:number,options:{produce?:boolean;covered?:boolean;burnExtra?:boolean}={}):void {
  const active=state.chapterIII!.active!;
  for(let i=0;i<count;i++){
    const offset=(++state.tick-active.activatedAtTick-1)%60;
    const sold={circuit:Number(offset<13),gear:Number(offset>=13&&offset<25),steel:Number(offset>=25&&offset<32)};
    const produced=options.produce===false?{circuit:0,gear:0,steel:0}:sold;
    recordContractTick(state,{
      tick:state.tick,sold,produced,demandCovered:options.covered??true,
      coalBurned:Number(offset%12===0||options.burnExtra===true&&(offset===1||offset===59)),profitCents:1000,
    });
  }
}

describe("Project Prometheus contracts",()=>{
  it("requires Chapter II completion and explicit, ordered commands",()=>{
    const before=begin(createGame());
    expect(beginChapterIII(before)).toMatchObject({ok:false,state:before});
    expect(acceptChapterIIIContract(before,"M11").ok).toBe(false);
    const started=startedChapterIII();
    expect(started.chapterIII).toEqual({route:null,completed:[],active:null});
    expect(started.mission.activeId).toBe("DONE");
    expect(beginChapterIII(started)).toMatchObject({ok:false,state:started});
    expect(acceptChapterIIIContract(started,"M13").ok).toBe(false);
    expect(chooseChapterIIIRoute(started,"corporate",true).ok).toBe(false);
    const active=acceptChapterIIIContract(started,"M11");
    expect(active.ok).toBe(true);
    expect(started.chapterIII?.active).toBeNull();
    expect(active.state.chapterIII?.active?.activatedAtTick).toBe(started.tick);
    expect(acceptChapterIIIContract(active.state,"M11").ok).toBe(false);
  });

  it("counts only complete post-activation windows and grants each archive reward once",()=>{
    const started=startedChapterIII();
    started.tick=120;
    const state=acceptChapterIIIContract(started,"M11").state;
    const prior:ContractTick={tick:120,sold:{circuit:20,gear:20,steel:20},produced:{circuit:20,gear:20,steel:20},
      demandCovered:true,coalBurned:0,profitCents:60000};
    recordContractTick(state,prior);
    advanceContract(state,59);
    expect(currentChapterIIIWindow(state)).toBeNull();
    advanceContract(state,1);
    expect(state.chapterIII?.active?.streakTicks).toBe(1);
    const latest=state.chapterIII!.active!.ticks.at(-1)!;
    recordContractTick(state,latest);
    expect(state.chapterIII?.active?.streakTicks).toBe(1);
    advanceContract(state,28);
    expect(state.chapterIII?.active?.streakTicks).toBe(29);
    advanceContract(state,1);
    expect(state.chapterIII).toEqual({route:null,completed:["M11"],active:null});
    expect(acceptChapterIIIContract(state,"M11").ok).toBe(false);
    expect(acceptChapterIIIContract(state,"M12").ok).toBe(false);
    expect(chooseChapterIIIRoute(state,"independent").ok).toBe(false);
    expect(chooseChapterIIIRoute(state,"independent",1 as never).ok).toBe(false);
    const chosen=chooseChapterIIIRoute(state,"independent",true);
    expect(chosen.ok).toBe(true);
    expect(chosen.state.chapterIII?.route).toBe("independent");
    expect(chosen.state.chapterIII?.active).toBeNull();
    expect(chooseChapterIIIRoute(chosen.state,"corporate",true).ok).toBe(false);
    expect(state.chapterIII?.route).toBeNull();
  });

  it("rejects an absent contract id after all archive rewards have been granted",()=>{
    const complete={...startedChapterIII(),
      chapterIII:{route:"corporate",completed:["M11","M12","M13"],active:null},
    } satisfies GameState;
    expect(acceptChapterIIIContract(complete,undefined as never)).toMatchObject({ok:false,state:complete});
  });

  it("rejects qualifying sales from stockpiles, zero-demand power and excess fuel",()=>{
    const started=startedChapterIII();
    const m11=acceptChapterIIIContract(started,"M11").state;
    advanceContract(m11,89,{produce:false});
    expect(m11.chapterIII?.active?.streakTicks).toBe(0);
    advanceContract(m11,150);
    expect(m11.chapterIII?.completed).toEqual(["M11"]);

    const chosen=chooseChapterIIIRoute(m11,"independent",true).state;
    const m12=acceptChapterIIIContract(chosen,"M12").state;
    advanceContract(m12,60,{covered:false});
    expect(m12.chapterIII?.active?.streakTicks).toBe(0);
    advanceContract(m12,60,{burnExtra:true});
    expect(m12.chapterIII?.active?.streakTicks).toBe(0);
    advanceContract(m12,60);
    expect(m12.chapterIII?.active?.streakTicks).toBe(1);
    advanceContract(m12,1,{covered:false});
    expect(m12.chapterIII?.active?.streakTicks).toBe(0);
  });

  it("records authoritative physical production, sales and accounting after the tick",()=>{
    const state=acceptChapterIIIContract(startedChapterIII(),"M11").state;
    state.sales=emptySales();
    state.materialLedger=emptyLedger();
    state.entities.push({id:2,kind:"assembler",x:9,y:5,direction:"E",cycle:1,oreInput:0,output:null,belt:null,
      inputBuffers:{},reservedInputs:{iron_ingot:2},status:"working"});
    state.nextId=3;
    const paused={...state,paused:true};
    expect(tick(paused)).toBe(paused);
    expect(paused.chapterIII?.active?.ticks).toEqual([]);
    const next=tick(state);
    expect(next.chapterIII?.active?.ticks).toEqual([{
      tick:1,sold:{circuit:0,gear:1,steel:0},produced:{circuit:0,gear:1,steel:0},
      demandCovered:false,coalBurned:0,profitCents:REVENUE.gear-250,
    }]);
    expect(next.balanceCents-state.balanceCents).toBe(REVENUE.gear-250);
    expect(next.materialLedger?.gear).toMatchObject({produced:1,sold:1});
  });
});
