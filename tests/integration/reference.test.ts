import {describe,it,expect} from "vitest";
import {createGame,stats,type GameState} from "../../src/domain/model";
import {place,setPause} from "../../src/game/commands";
import {runTicks} from "../../src/simulation/engine";
function build(kind:"iron_mine"|"furnace"|"conveyor",x:number,y:number,s:GameState){
 const r=place(s,kind,x,y,"E");expect(r.ok,r.message).toBe(true);return r.state;
}
describe("reference economy",()=>{
 it("AC05/AC10 produces ingots with no duplicated inventory",()=>{
  let s=createGame();s=build("iron_mine",3,5,s);s=build("conveyor",4,5,s);s=build("furnace",5,5,s);
  for(let x=6;x<=9;x++)s=build("conveyor",x,5,s);
  s=runTicks(setPause(s,false),1200);
  const p=stats(s)!;
  expect(s.mission.soldIngot).toBeGreaterThan(200);
  expect(p.revenueCents).toBeGreaterThanOrEqual(9800);
  expect(p.profitCents).toBeGreaterThanOrEqual(5000);
  expect(["M2","M3","M4","DONE"]).toContain(s.mission.activeId);
  expect(s.totalOreProduced).toBeGreaterThanOrEqual(s.mission.soldIngot*2);
 });
 it("AC12 M4 requires completed window and streak",()=>{
  let s=createGame();s.mission.activeId="M4";s=setPause(s,false);s=runTicks(s,180);
  expect(s.mission.activeId).toBe("M4");expect(s.mission.profitStreakTicks).toBe(0);
 });
});
