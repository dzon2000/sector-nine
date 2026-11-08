import {describe,expect,it} from "vitest";
import {createGame,ITEMS,type GameState,type Item} from "../../src/domain/model";
import {tick,runTicks} from "../../src/simulation/engine";
import {remove} from "../../src/game/commands";
import {validateSave} from "../../src/persistence/indexedDb";

function legacy():GameState{
 const s=createGame();
 s.schemaVersion=1;
 s.tick=500;s.paused=false;s.introOpen=false;s.mission.activeId="M4";
 s.entities.push(
  {id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:"iron_ingot",oreInput:0,cycle:null,status:"working"},
  {id:3,kind:"iron_mine",x:3,y:5,direction:"E",output:"iron_ore",belt:null,oreInput:0,cycle:null,status:"blocked_output"},
  {id:4,kind:"conveyor",x:4,y:5,direction:"E",output:null,belt:"iron_ore",oreInput:0,cycle:null,status:"working"},
  {id:5,kind:"furnace",x:5,y:5,direction:"E",output:null,belt:null,oreInput:1,cycle:2,status:"working"},
  {id:6,kind:"conveyor",x:6,y:5,direction:"E",output:null,belt:"iron_ingot",oreInput:0,cycle:null,status:"working"},
  {id:7,kind:"conveyor",x:7,y:5,direction:"E",output:null,belt:null,oreInput:0,cycle:null,status:"waiting_for_inputs"},
  {id:8,kind:"conveyor",x:8,y:5,direction:"E",output:null,belt:null,oreInput:0,cycle:null,status:"waiting_for_inputs"}
 );
 s.nextId=9;
 delete s.materialLedger;delete s.sales;delete s.technologies;delete s.coalDeposits;
 delete s.totalRevenueCents;delete s.totalCostCents;delete s.foundryStorySeen;
 for(const e of s.entities){delete e.inputBuffers;delete e.reservedInputs;}
 return s;
}
function onHand(s:GameState):Record<Item,number>{
 const quantities=Object.fromEntries(ITEMS.map(item=>[item,0])) as Record<Item,number>;
 for(const e of s.entities){
  if(e.output)quantities[e.output]++;
  if(e.belt)quantities[e.belt]++;
  for(const item of ITEMS){
   quantities[item]+=(e.inputBuffers?.[item]??0)+(e.reservedInputs?.[item]??0);
  }
 }
 return quantities;
}
function conserved(s:GameState){
 const stock=onHand(s);
 for(const item of ITEMS){
  const l=s.materialLedger![item];
  expect(l.opening+l.produced-l.consumed-l.sold-l.demolished, `Audit balance for ${item}`).toBe(stock[item]);
 }
}
describe("PR #2 review regressions",()=>{
 it("migration records opening stock, not fictional production, and conserves through 600 ticks and demolition",()=>{
  let s=validateSave(legacy());
  const expected=onHand(s);
  for(const item of ITEMS){
   expect(s.materialLedger![item].opening).toBe(expected[item]);
   expect(s.materialLedger![item].produced).toBe(0);
  }
  conserved(s);
  const opening=structuredClone(s.materialLedger);
  s=tick(s);
  expect(s.materialLedger!.iron_ingot.sold).toBe(1);
  conserved(s);
  s=runTicks(s,600);
  conserved(s);
  const machine=s.entities.find(e=>e.kind==="furnace")!;
  s=remove(s,machine.id,true).state;
  conserved(s);
  expect(s.materialLedger!.iron_ore.opening).toBe(opening!.iron_ore.opening);
  expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
 });
 it("uses typed buffers as authority while keeping a validated legacy furnace mirror",()=>{
  const s=validateSave(legacy());
  const furnace=s.entities.find(e=>e.kind==="furnace")!;
  expect(furnace.inputBuffers?.iron_ore).toBe(furnace.oreInput);
  expect(()=>validateSave({...s,entities:s.entities.map(e=>e.id===furnace.id?{...e,oreInput:3}:e)})).toThrow(/inventory|buffer|legacy/i);
  const next=runTicks(s,50);
  for(const e of next.entities.filter(e=>e.kind==="furnace"))
   expect(e.oreInput).toBe(e.inputBuffers?.iron_ore??0);
  conserved(next);
 });
 it("rejects malformed technology state, coal deposits and unknown/illegal inventory types",()=>{
  const s=createGame();
  const malformed=[
   {...s,technologies:{}},
   {...s,technologies:{coal_extraction:1,mechanical_components:false,advanced_smelting:false}},
   {...s,coalDeposits:{}},
   {...s,coalDeposits:[{x:5,y:9},{x:7,y:8}]},
   {...s,entities:s.entities.map(e=>({...e,inputBuffers:{unknown_item:1}}))},
   {...s,entities:s.entities.map(e=>({...e,reservedInputs:{other:1}}))},
   {...s,materialLedger:{...s.materialLedger,iron_ore:{produced:0,consumed:0,sold:0,demolished:0,opening:-1}}}
  ];
  for(const bad of malformed)expect(()=>validateSave(bad)).toThrow();
  expect(validateSave(s)).toEqual(s);
 });
});
