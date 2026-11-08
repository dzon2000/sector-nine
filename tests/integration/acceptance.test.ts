import {describe,expect,it} from "vitest";
import {createGame,stats,type Direction,type GameState,type Item} from "../../src/domain/model";
import {place,remove,reset,setPause,turn} from "../../src/game/commands";
import {runTicks,tick} from "../../src/simulation/engine";
import {updateMission} from "../../src/game/missions";
import {validateSave} from "../../src/persistence/indexedDb";

type Placeable = "iron_mine" | "furnace" | "conveyor";
function add(s:GameState,kind:Placeable,x:number,y:number,direction:Direction="E"):GameState{
  const r=place(s,kind,x,y,direction);
  expect(r.ok,r.message).toBe(true);
  return r.state;
}
function running(s:GameState):GameState{return setPause(s,false);}
function entity(s:GameState,x:number,y:number){
  const e=s.entities.find(e=>e.x===x&&e.y===y);
  expect(e).toBeDefined();
  return e!;
}
function reference():GameState{
  let s=createGame();
  s=add(s,"iron_mine",3,5);
  s=add(s,"conveyor",4,5);
  s=add(s,"furnace",5,5);
  for(let x=6;x<=9;x++)s=add(s,"conveyor",x,5);
  return running(s);
}
function direct():GameState{
  let s=createGame();
  s=add(s,"iron_mine",3,5);
  for(let x=4;x<=9;x++)s=add(s,"conveyor",x,5);
  return running(s);
}
function stock(s:GameState):number{
  return s.entities.reduce((sum,e)=>sum+Number(e.output!==null)+Number(e.belt!==null)+e.oreInput+
    (e.kind==="furnace"&&e.cycle!==null?2:0),0);
}

describe("AC-02/03/14/15: construction and recovery",()=>{
  it("rejects out-of-bounds, occupied, invalid deposit and insufficient funds without mutation",()=>{
    const s=createGame();
    for(const [kind,x,y] of [
      ["iron_mine",4,5],["conveyor",3,5],["furnace",10,5],
      ["conveyor",-1,1],["conveyor",12,0]
    ] as const){
      const r=place(s,kind,x,y,"E");
      expect(r.ok).toBe(false);
      expect(r.message.length).toBeGreaterThan(5);
      expect(r.state).toBe(s);
      expect(s.balanceCents).toBe(30000);
    }
    const poor={...s,balanceCents:499};
    expect(place(poor,"conveyor",4,5,"E").ok).toBe(false);
    expect(poor.balanceCents).toBe(499);
  });
  it("refunds once, destroys buffered items only on confirmed demolition and protects terminal",()=>{
    let s=add(createGame(),"iron_mine",3,5);
    s=running(s);s=runTicks(s,2);
    expect(entity(s,3,5).output).toBe("iron_ore");
    const no=remove(s,2,false);
    expect(no.ok).toBe(false);expect(no.state).toBe(s);
    const after=remove(s,2,true).state;
    expect(after.entities).toHaveLength(1);
    expect(after.balanceCents).toBe(s.balanceCents+3375);
    expect(remove(after,2,true).ok).toBe(false);
    expect(remove(after,1,true).ok).toBe(false);
  });
  it("can reset debt; production continues while purchases remain blocked",()=>{
    let s=running(add(createGame(),"iron_mine",3,5));
    s.balanceCents=-100;
    expect(place(s,"conveyor",4,5,"E").ok).toBe(false);
    s=runTicks(s,2);
    expect(s.totalOreProduced).toBe(1);
    expect(s.balanceCents).toBe(-160);
    expect(reset()).toEqual(createGame());
  });
});

describe("AC-05/06/07/08/09/16: material movement invariants",()=>{
  it("moves through a right-angle turn only once per tick and never charges for a failed transfer",()=>{
    let s=createGame();
    s=add(s,"conveyor",4,4,"S");
    s=add(s,"conveyor",4,5,"E");
    s=add(s,"conveyor",5,5,"E");
    entity(s,4,4).belt="iron_ore";
    s=running(s);
    s=tick(s);
    expect(entity(s,4,4).belt).toBeNull();
    expect(entity(s,4,5).belt).toBe("iron_ore");
    expect(entity(s,5,5).belt).toBeNull();
    expect(s.lastEvent.costCents).toBe(5);
    s=tick(s);
    expect(entity(s,5,5).belt).toBe("iron_ore");
    expect(s.lastEvent.costCents).toBe(5);
    s=tick(s);
    expect(entity(s,5,5).belt).toBe("iron_ore");
    expect(s.lastEvent.costCents).toBe(0);
  });
  it("fills a blocked conveyor chain to capacity without item loss or charges on blocked ticks",()=>{
    let s=createGame();
    s=add(s,"iron_mine",3,5);
    s=add(s,"conveyor",4,5);
    s=add(s,"conveyor",5,5);
    s=runTicks(running(s),100);
    expect(s.totalOreProduced).toBe(3);
    expect(stock(s)).toBe(3);
    expect(entity(s,3,5).output).toBe("iron_ore");
    expect(entity(s,4,5).belt).toBe("iron_ore");
    expect(entity(s,5,5).belt).toBe("iron_ore");
    expect(s.lastEvent.costCents).toBe(0);
    expect(s.mission.soldOre).toBe(0);
  });
  it("moves into an occupied belt when that belt departs atomically in the same tick",()=>{
    let s=createGame();
    s=add(s,"conveyor",8,5);
    s=add(s,"conveyor",9,5);
    entity(s,8,5).belt="iron_ore";
    entity(s,9,5).belt="iron_ingot";
    s=tick(running(s));
    expect(entity(s,8,5).belt).toBeNull();
    expect(entity(s,9,5).belt).toBe("iron_ore");
    expect(s.mission.soldIngot).toBe(1);
    expect(s.lastEvent.revenueCents).toBe(700);
    expect(s.lastEvent.costCents).toBe(5);
  });
  it("round-robins two producers competing for one belt and survives serialization",()=>{
    let s=createGame();
    s=add(s,"conveyor",5,4,"S");
    s=add(s,"conveyor",4,5,"E");
    s=add(s,"conveyor",5,5,"E");
    const a=entity(s,5,4).id,b=entity(s,4,5).id,target=entity(s,5,5).id;
    const winners:number[]=[];
    for(let i=0;i<8;i++){
      entity(s,5,4).belt="iron_ore";
      entity(s,4,5).belt="iron_ingot";
      entity(s,5,5).belt=null;
      s=tick(running(s));
      const item=entity(s,5,5).belt;
      expect(item=== "iron_ore"||item==="iron_ingot").toBe(true);
      winners.push(item==="iron_ore"?a:b);
      expect(stock(s)).toBe(2);
      expect(s.arbiters[String(target)]).toBe(winners[i]);
      s=validateSave(JSON.parse(JSON.stringify(s)));
    }
    expect(winners).toEqual([a,b,a,b,a,b,a,b]);
  });
  it("keeps exact ore conservation for an ore-only line over thousands of ticks",()=>{
    let s=runTicks(direct(),2000);
    expect(s.totalOreProduced).toBe(s.mission.soldOre+stock(s));
    expect(s.mission.soldIngot).toBe(0);
    expect(s.totalIngotProduced).toBe(0);
  });
  it("keeps exact ore-equivalent conservation through furnace cycles",()=>{
    let s=reference();
    for(let i=0;i<1500;i++){
      s=tick(s);
      const onHand=s.entities.reduce((sum,e)=>sum+e.oreInput+
        (e.output==="iron_ore"?1:0)+(e.belt==="iron_ore"?1:0)+
        2*(Number(e.output==="iron_ingot")+Number(e.belt==="iron_ingot")+
          Number(e.kind==="furnace"&&e.cycle!==null)),0);
      expect(s.totalOreProduced).toBe(s.mission.soldOre+2*s.mission.soldIngot+onHand);
    }
  });
  it("replaying an identical sequence yields an identical snapshot and integer ledger",()=>{
    const first=runTicks(reference(),800);
    const second=runTicks(reference(),800);
    expect(first).toEqual(second);
    for(const event of first.rollingEvents){
      expect(Number.isSafeInteger(event.revenueCents)).toBe(true);
      expect(Number.isSafeInteger(event.costCents)).toBe(true);
    }
  });
});

describe("AC-10/11: exact reference-line economy",()=>{
  it("costs 150 Cr in capital without distorting operating profit",()=>{
    const s=reference();
    expect(s.balanceCents).toBe(15000);
    expect(s.rollingEvents).toHaveLength(0);
    expect(stats(s)).toBeNull();
  });
  it("reaches exactly 30 ore and 15 ingot sales per steady-state 60 ticks, 58.50 Cr profit",()=>{
    const warm=runTicks(reference(),600);
    const s=runTicks(warm,60);
    expect(s.totalOreProduced-warm.totalOreProduced).toBe(30);
    expect(s.mission.soldIngot-warm.mission.soldIngot).toBe(15);
    expect(stats(s)).toEqual({revenueCents:10500,costCents:4650,profitCents:5850});
  });
});

describe("AC-12: mission edges",()=>{
  it("requires a full rolling window and exactly 60 qualifying ticks for M4",()=>{
    let s=running(createGame());
    s.mission.activeId="M4";
    for(let i=1;i<=118;i++){
      s.tick=i;
      s.rollingEvents.push({tick:i,revenueCents:100,costCents:0});
      if(s.rollingEvents.length>60)s.rollingEvents.shift();
      updateMission(s);
      expect(s.mission.activeId).toBe("M4");
      expect(s.mission.profitStreakTicks).toBe(Math.max(0,i-59));
    }
    s.tick=119;
    s.rollingEvents.push({tick:119,revenueCents:100,costCents:0});
    s.rollingEvents.shift();
    updateMission(s);
    expect(s.mission.activeId).toBe("DONE");
  });
  it("resets M4 streak immediately if profit falls below threshold",()=>{
    const s=createGame();s.mission.activeId="M4";s.mission.profitStreakTicks=25;
    s.rollingEvents=Array.from({length:60},(_,i)=>({tick:i+1,revenueCents:0,costCents:0}));
    updateMission(s);
    expect(s.mission.profitStreakTicks).toBe(0);
  });
  it("advances sequentially based on sales rather than output inventory",()=>{
    const s=createGame();
    s.totalOreProduced=1;
    updateMission(s);expect(s.mission.activeId).toBe("M1");
    s.entities.push({id:2,kind:"iron_mine",x:3,y:5,direction:"E",output:null,belt:null,oreInput:0,cycle:null,status:"working"});
    updateMission(s);expect(s.mission.activeId).toBe("M2");
    s.totalIngotProduced=100;
    updateMission(s);expect(s.mission.activeId).toBe("M2");
    s.mission.soldOre=10;updateMission(s);expect(s.mission.activeId).toBe("M3");
    s.mission.soldIngot=20;updateMission(s);expect(s.mission.activeId).toBe("M4");
  });
});

describe("AC-13: snapshot integrity and resume",()=>{
  it("resumes with identical cycles, buffers, arbiters, mission, money and accounting",()=>{
    let s=runTicks(reference(),127);
    expect(s.entities.some(e=>e.kind==="furnace")).toBe(true);
    const restored=validateSave(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual(s);
    expect(runTicks(restored,600)).toEqual(runTicks(s,600));
  });
  it("does not advance simulation while paused; no wall-clock catchup",()=>{
    const s=setPause(runTicks(reference(),42),true);
    expect(runTicks(s,3600)).toBe(s);
  });
  it("rejects invalid schema, duplicate positions and corrupt accounting without resetting",()=>{
    const s=reference();
    expect(()=>validateSave({...s,schemaVersion:2})).toThrow(/schema/i);
    expect(()=>validateSave({...s,arbiters:null})).toThrow(/validation/i);
    expect(()=>validateSave({...s,arbiters:[]})).toThrow(/validation/i);
    expect(()=>validateSave({...s,arbiters:{"3":-1}})).toThrow(/validation/i);
    expect(()=>validateSave({...s,arbiters:{"3":1.5}})).toThrow(/validation/i);
    expect(()=>validateSave({...s,entities:[...s.entities,s.entities[0]]})).toThrow(/overlapping/i);
    expect(()=>validateSave({...s,rollingEvents:[{tick:1,revenueCents:1.5,costCents:0}]})).toThrow(/accounting/i);
    expect(()=>validateSave({...s,entities:s.entities.filter(e=>e.kind!=="sell_terminal")})).toThrow(/terminal/i);
  });
});
