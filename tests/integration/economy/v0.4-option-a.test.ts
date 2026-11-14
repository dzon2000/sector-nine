import {describe,expect,it} from "vitest";
import {createGame,stockOnHand,ITEMS,type GameState,type Item} from "../../../src/domain/model";
import {place} from "../../../src/game/commands";
import {tick,runTicks} from "../../../src/simulation/engine";
import {validateSave} from "../../../src/persistence/indexedDb";

const make=()=>{
 let s:any=createGame();s.paused=false;s.mission.activeId="DONE";s.balanceCents=1000000;
 const add=(kind:string,x:number,y:number,direction:"N"|"E"|"S"|"W"="E")=>{
   const r=place(s,kind as any,x,y,direction);expect(r.ok,r.message).toBe(true);s=r.state;
   return s.entities.find((e:any)=>e.x===x&&e.y===y);
 };
 return {add,get state(){return s as GameState},set state(v:GameState){s=v;}};
};
function conserved(s:GameState){
 const stock=stockOnHand(s.entities);
 for(const item of ITEMS){const l=s.materialLedger![item];
   expect(l.opening+l.produced-l.consumed-l.sold-l.demolished-l.burned,item).toBe(stock[item]);}
}
describe("WP3 Option A experimental splitter: RED-before-implementation",()=>{
 it("copper mine produces one unit every two active ticks, not three",()=>{
   const f=make();f.add("copper_mine",8,2,"N");
   const s=runTicks(f.state,2);
   expect(s.materialLedger!.copper_ore.produced).toBe(1);
   conserved(s);
 });
 it("takes a physical item, alternates forward and clockwise outlets without duplication",()=>{
   const f=make();
   f.add("splitter",5,5,"E");f.add("conveyor",6,5,"E");f.add("conveyor",5,6,"S");
   let s:any=f.state;
   const split=s.entities.find((e:any)=>e.kind==="splitter");
   split.belt="copper_ore";s.materialLedger.copper_ore.opening=1;
   s=tick(s);
   expect(s.entities.find((e:any)=>e.x===6&&e.y===5).belt).toBe("copper_ore");
   expect(split.id).toBeGreaterThan(1);
   expect(s.entities.find((e:any)=>e.id===split.id).belt).toBeNull();
   expect(s.entities.find((e:any)=>e.id===split.id).splitterNext).toBe(1);
   s.entities.find((e:any)=>e.id===split.id).belt="copper_ore";
   s.materialLedger.copper_ore.opening++;
   s=tick(s);
   expect(s.entities.find((e:any)=>e.x===5&&e.y===6).belt).toBe("copper_ore");
   expect(s.entities.find((e:any)=>e.id===split.id).splitterNext).toBe(0);
   conserved(s);
   expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
 });
 it("falls back to unblocked outlet without flipping direction after unsuccessful blocked tick",()=>{
   const f=make();f.add("splitter",5,5,"E");f.add("conveyor",6,5,"E");f.add("conveyor",5,6,"S");
   const s:any=f.state;
   const split=s.entities.find((e:any)=>e.kind==="splitter");
   split.belt="silicon";s.materialLedger.silicon.opening++;
   const blocked=s.entities.find((e:any)=>e.x===6&&e.y===5);
   blocked.belt="coal";s.materialLedger.coal.opening++;
   let after=tick(s) as any;
   expect(after.entities.find((e:any)=>e.x===5&&e.y===6).belt).toBe("silicon");
   expect(after.entities.find((e:any)=>e.id===split.id).splitterNext).toBe(0);
   conserved(after);
   // When both exits are blocked, splitter must neither discard nor bill the item.
   const second=after.entities.find((e:any)=>e.id===split.id);
   second.belt="silicon";after.materialLedger.silicon.opening++;
   after=runTicks(after,2) as any;
   expect(after.entities.find((e:any)=>e.id===split.id).belt).toBe("silicon");
   conserved(after);
 });
 it("is deterministic across entity order and save reload",()=>{
   const f=make();f.add("splitter",5,5,"E");f.add("conveyor",6,5,"S");f.add("conveyor",5,6,"W");
   let s:any=f.state;const split=s.entities.find((e:any)=>e.kind==="splitter");
   split.belt="silicon";s.materialLedger.silicon.opening++;
   s=tick(s);
   const shuffled=JSON.parse(JSON.stringify(s));shuffled.entities.reverse();
   expect(runTicks(validateSave(JSON.parse(JSON.stringify(s))),10).entities.sort((a,b)=>a.id-b.id))
     .toEqual(runTicks(shuffled,10).entities.sort((a,b)=>a.id-b.id));
 });
 it("rejects lost or invalid splitter cursor without silently changing saved routing",()=>{
   const f=make();f.add("splitter",5,5,"E");
   const original=f.state;
   expect(validateSave(JSON.parse(JSON.stringify(original)))).toEqual(original);
   for(const bad of [-1,2,null,undefined,"forward"]){
     const corrupted:any=structuredClone(original);
     const e=corrupted.entities.find((x:any)=>x.kind==="splitter");
     if(bad===undefined)delete e.splitterNext;
     else e.splitterNext=bad;
     expect(()=>validateSave(corrupted)).toThrow(/splitter/i);
   }
 });

});