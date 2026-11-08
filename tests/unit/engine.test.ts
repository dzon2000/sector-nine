import {describe,it,expect} from "vitest";
import {createGame,stats} from "../../src/domain/model";
import {place,remove,setPause,turn} from "../../src/game/commands";
import {runTicks,tick} from "../../src/simulation/engine";
const build=(s:ReturnType<typeof createGame>,kind:"iron_mine"|"furnace"|"conveyor",x:number,y:number,direction:"N"|"E"|"S"|"W"="E")=>{
 const r=place(s,kind,x,y,direction);expect(r.ok,r.message).toBe(true);return r.state;
};
describe("v0.1 core",()=>{
 it("AC01 starts with a fixed world",()=>{const s=createGame();expect([s.width,s.height,s.balanceCents,s.entities[0].x,s.entities[0].y]).toEqual([12,12,30000,10,5]);});
 it("AC02 rejects invalid or unaffordable construction without charges",()=>{
  const s=createGame();expect(place(s,"iron_mine",4,5,"E").state).toBe(s);
  expect(place(s,"furnace",10,5,"E").ok).toBe(false);
  let n=s;for(let i=0;i<10;i++)n=build(n,"conveyor",i,0);
  expect(place(n,"furnace",4,4,"E").ok).toBe(true);
 });
 it("AC03 refunds 75% capital",()=>{let s=build(createGame(),"iron_mine",3,5);expect(s.balanceCents).toBe(25500);expect(remove(s,2,false).ok).toBe(false);s=remove(s,2,true).state;expect(s.balanceCents).toBe(28875);});
 it("AC04 mine produces exactly once each two active ticks",()=>{let s=build(createGame(),"iron_mine",3,5);expect(tick(s)).toBe(s);s=setPause(s,false);s=tick(s);expect(s.totalOreProduced).toBe(0);s=tick(s);expect(s.totalOreProduced).toBe(1);expect(s.balanceCents).toBe(25440);expect(runTicks(setPause(s,true),50).tick).toBe(2);});
 it("AC07 backpressure stalls without extra mining charges",()=>{let s=setPause(build(createGame(),"iron_mine",3,5),false);s=runTicks(s,100);expect(s.totalOreProduced).toBe(1);expect(s.balanceCents).toBe(25440);});
 it("AC09 ore sale once and ledger excludes purchases",()=>{
  let s=createGame();s=build(s,"iron_mine",3,5);
  for(let x=4;x<10;x++)s=build(s,"conveyor",x,5);
  s=runTicks(setPause(s,false),15);expect(s.mission.soldOre).toBeGreaterThan(0);
  expect(s.rollingEvents.some(e=>e.revenueCents===200)).toBe(true);
 });
 it("AC13 deterministic save continuation",()=>{
  let s=build(createGame(),"iron_mine",3,5);
  for(let x=4;x<10;x++)s=build(s,"conveyor",x,5);
  s=setPause(s,false);const first=runTicks(s,200);
  const saved=JSON.parse(JSON.stringify(runTicks(s,80)));
  expect(runTicks(saved,120)).toEqual(first);
 });
 it("AC11 no profit shown before 60 ticks",()=>{const s=setPause(createGame(),false);expect(stats(runTicks(s,59))).toBe(null);expect(stats(runTicks(s,60))).not.toBe(null);});
 it("AC15 reset remains possible in operational debt",()=>{let s=setPause(build(createGame(),"iron_mine",3,5),false);s=runTicks(s,2);s.balanceCents=-100;expect(place(s,"conveyor",4,5,"E").ok).toBe(false);expect(tick(s).tick).toBe(3);});
});
