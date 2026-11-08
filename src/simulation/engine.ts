import {REVENUE,STEP,location,stats,type Entity,type GameState,type Item} from "../domain/model";
import {updateMission} from "../game/missions";
type Request={source:Entity;target:Entity;item:Item};
function at(s:GameState,x:number,y:number){return s.entities.find(e=>e.x===x&&e.y===y);}
function output(e:Entity):Item|null{return e.kind==="conveyor"?e.belt:e.output;}
function clear(e:Entity){if(e.kind==="conveyor")e.belt=null;else e.output=null;}
function directionTo(e:Entity):[number,number]{const [x,y]=STEP[e.direction];return [e.x+x,e.y+y];}
function accepts(target:Entity,source:Entity,item:Item):boolean{
  if(target.kind==="iron_mine")return false;
  if(target.kind==="furnace")return item==="iron_ore"&&target.oreInput<4&&!(source.x===target.x+STEP[target.direction][0]&&source.y===target.y+STEP[target.direction][1]);
  if(target.kind==="conveyor")return target.belt===null;
  return true;
}
export function tick(state:GameState):GameState {
  if(state.paused)return state;
  const s:GameState=structuredClone(state);
  s.tick++;
  let revenueCents=0,costCents=0;
  // Phase 1: finish due cycles; output cannot be replaced if occupied.
  for(const e of s.entities){
    if(e.kind==="iron_mine"){
      if(e.output===null){
        e.cycle=(e.cycle??2)-1;
        if(e.cycle===0){e.output="iron_ore";e.cycle=null;s.totalOreProduced++;costCents+=60;}
      }
    }else if(e.kind==="furnace"&&e.cycle!==null){
      if(e.cycle>0)e.cycle--;
      if(e.cycle===0&&e.output===null){
        e.output="iron_ingot";e.cycle=null;costCents+=160;s.totalIngotProduced++;
      }
    }
  }
  // Phase 2: plan transfers from a snapshot. A newly arrived belt item cannot move again.
  // A vacated belt is a valid destination. Every source proposes at most one item.
  const requests:Request[]=[];
  for(const e of s.entities){
    const item=output(e);if(!item||e.kind==="sell_terminal")continue;
    const [x,y]=directionTo(e),target=at(s,x,y);
    if(target&&accepts(target,e,item))requests.push({source:e,target,item});
    else if(target?.kind==="conveyor"&&target.belt!==null)requests.push({source:e,target,item});
  }
  const byTarget=new Map<number,Request[]>();
  for(const r of requests){const a=byTarget.get(r.target.id)??[];a.push(r);byTarget.set(r.target.id,a);}
  const planned=new Map<number,Request>();
  for(const [id,reqs] of byTarget){
    const target=reqs[0].target;
    // Reject transfers to a furnace whose buffer is already full or wrong-side input.
    const viable=reqs.filter(r=>accepts(target,r.source,r.item) || (target.kind==="conveyor"&&target.belt!==null));
    if(!viable.length)continue;
    viable.sort((a,b)=>a.source.id-b.source.id);
    const last=s.arbiters[String(id)]??-1;
    const chosen=viable.find(r=>r.source.id>last)??viable[0];
    planned.set(id,chosen);
  }
  // Resolve dependencies through chains without allowing duplicated or repeated movement.
  const approved=new Set<number>();
  const visiting=new Set<number>();
  function canMove(r:Request):boolean{
    if(approved.has(r.source.id))return true;
    if(visiting.has(r.source.id))return false;
    visiting.add(r.source.id);
    let possible=false;
    if(r.target.kind==="sell_terminal")possible=true;
    else if(r.target.kind==="furnace")possible=accepts(r.target,r.source,r.item);
    else if(r.target.kind==="conveyor"){
      if(r.target.belt===null)possible=true;
      else{
        const next=planned.get(r.target.id);
        possible=!!next&&canMove(next);
      }
    }
    visiting.delete(r.source.id);
    if(possible)approved.add(r.source.id);
    return possible;
  }
  for(const r of planned.values())canMove(r);
  // Depart all sources first, then arrive at destinations.
  const transfers=[...planned.values()].filter(r=>approved.has(r.source.id));
  for(const r of transfers)clear(r.source);
  for(const r of transfers){
    const t=r.target;
    s.arbiters[String(t.id)]=r.source.id;
    if(t.kind==="conveyor"){t.belt=r.item;costCents+=5;}
    else if(t.kind==="furnace")t.oreInput++;
    else if(t.kind==="sell_terminal"){
      revenueCents+=REVENUE[r.item];
      if(r.item==="iron_ore")s.mission.soldOre++;
      else s.mission.soldIngot++;
    }
  }
  // Phase 3: start new furnace cycles when enough ore is buffered.
  for(const e of s.entities){
    if(e.kind==="furnace"&&e.cycle===null&&e.output===null&&e.oreInput>=2){
      e.oreInput-=2;e.cycle=4;
    }
    if(e.kind==="sell_terminal")e.status="waiting_for_inputs";
    else if(e.kind==="conveyor")e.status=e.belt?"working":"waiting_for_inputs";
    else if(e.kind==="iron_mine")e.status=e.output?"blocked_output":"working";
    else e.status=e.cycle===0||e.output?"blocked_output":e.cycle!==null?"working":"waiting_for_inputs";
  }
  // Phase 4: accounting and progression; capital expenditure is intentionally excluded.
  s.balanceCents+=revenueCents-costCents;
  s.lastEvent={tick:s.tick,revenueCents,costCents};
  s.rollingEvents.push(s.lastEvent);
  if(s.rollingEvents.length>60)s.rollingEvents.shift();
  updateMission(s);
  return s;
}
export function runTicks(s:GameState,count:number):GameState {
  for(let i=0;i<count;i++)s=tick(s);
  return s;
}
export function benchmark(s:GameState){return {tick:s.tick,stats:stats(s),ore:s.totalOreProduced,ingots:s.mission.soldIngot};}
