import {expect,it} from "vitest";
import {createGame,STEP,type Direction,type GameState} from "../../../src/domain/model";
import {begin,place,setPause} from "../../../src/game/commands";
import {tick} from "../../../src/simulation/engine";
import {tickWithPriority,type PriorityOutlets} from "./v0.6-priority-prototype";

function layout(direction:Direction, blocked:readonly boolean[]=[false,false]) {
  let state=begin(createGame());
  state.technologies!.circuit_fabrication=true;
  const [dx,dy]=STEP[direction];
  const tiles=[[5+dx,5+dy],[5-dy,5+dx]] as const;
  const splitter=place(state,"splitter",5,5,direction);
  expect(splitter.ok).toBe(true);
  state=splitter.state;
  const splitterId=state.entities.at(-1)!.id;
  state.entities.at(-1)!.belt="iron_ore";
  state.materialLedger!.iron_ore.opening++;
  const outlets:number[]=[];
  for(const [index,[x,y]] of tiles.entries()){
    if(blocked[index]){
      outlets.push(-1);
      continue;
    }
    const outlet=place(state,"conveyor",x,y,"N");
    expect(outlet.ok,outlet.message).toBe(true);
    state=outlet.state;
    outlets.push(state.entities.at(-1)!.id);
  }
  const cargo=(snapshot:GameState,id:number)=>snapshot.entities.find(e=>e.id===id)?.belt;
  return {state,splitterId,outlets,cargo};
}

it.each(["N","E","S","W"] as const)("priority outlet follows the splitter's %s orientation",direction=>{
  const {state,splitterId,outlets,cargo}=layout(direction);
  for(const outlet of [1,0] as const){
    const options:PriorityOutlets=new Map([[splitterId,outlet]]);
    const before=structuredClone(state);
    const next=tickWithPriority(state,options);
    expect(state).toEqual(before);
    expect(cargo(next,outlets[outlet])).toBe("iron_ore");
    expect(cargo(next,outlets[1-outlet])).toBeNull();
    expect(cargo(next,splitterId)).toBeNull();
    expect(next.entities.find(e=>e.id===splitterId)?.splitterNext).toBe(0);
  }
});

it("falls back when the preferred outlet is unavailable and holds cargo when both outlets are unavailable",()=>{
  const alternate=layout("N",[true,false]);
  const fallback=tickWithPriority(alternate.state,new Map([[alternate.splitterId,0]]));
  expect(alternate.cargo(fallback,alternate.outlets[1])).toBe("iron_ore");
  const blocked=layout("N",[true,true]);
  const held=tickWithPriority(blocked.state,new Map([[blocked.splitterId,0]]));
  expect(blocked.cargo(held,blocked.splitterId)).toBe("iron_ore");
  expect(held.balanceCents).toBe(blocked.state.balanceCents);
});

it("matches the engine in alternating mode and advances no cargo while paused",()=>{
  const {state,splitterId}=layout("N");
  expect(tickWithPriority(state,new Map())).toEqual(tick(state));
  const paused=setPause(state,true);
  expect(tickWithPriority(paused,new Map([[splitterId,1]]))).toBe(paused);
});

it("uses the current arbiter when the preferred outlet has a competing source",()=>{
  const {state,splitterId,outlets,cargo}=layout("N");
  const result=place(state,"conveyor",4,4,"E");
  expect(result.ok,result.message).toBe(true);
  const contested=result.state;
  contested.entities.at(-1)!.belt="coal";
  contested.materialLedger!.coal.opening++;
  contested.arbiters[String(outlets[0])]=splitterId;
  const priorities:PriorityOutlets=new Map([[splitterId,0]]);
  const lost=tickWithPriority(contested,priorities);
  expect(cargo(lost,outlets[0])).toBe("coal");
  expect(cargo(lost,outlets[1])).toBeNull();
  expect(cargo(lost,splitterId)).toBe("iron_ore");

  const next=tickWithPriority(lost,priorities);
  expect(cargo(next,outlets[0])).toBe("coal");
  expect(cargo(next,outlets[1])).toBe("iron_ore");
  expect(cargo(next,splitterId)).toBeNull();
});
