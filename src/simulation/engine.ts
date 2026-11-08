import {REVENUE,RECIPES,STEP,location,stats,type Entity,type GameState,type Item} from "../domain/model";
import {updateMission} from "../game/missions";
type Request={source:Entity;target:Entity;item:Item};
function at(s:GameState,x:number,y:number){return s.entities.find(e=>e.x===x&&e.y===y);}
function output(e:Entity):Item|null{return e.kind==="conveyor"?e.belt:e.output;}
function clear(e:Entity){if(e.kind==="conveyor")e.belt=null;else e.output=null;}
function directionTo(e:Entity):[number,number]{const [x,y]=STEP[e.direction];return [e.x+x,e.y+y];}
function accepts(target:Entity,source:Entity,item:Item):boolean{
  if(target.kind==="iron_mine"||target.kind==="coal_mine")return false;
  if(target.kind==="assembler"||target.kind==="advanced_furnace"){
    const recipe=target.kind==="assembler"?RECIPES.gear:RECIPES.steel;
    return !!recipe.input[item]&&(target.inputBuffers?.[item]??0)<4&&!(source.x===target.x+STEP[target.direction][0]&&source.y===target.y+STEP[target.direction][1]);
  }
  if(target.kind==="furnace")return item==="iron_ore"&&target.oreInput<4&&!(source.x===target.x+STEP[target.direction][0]&&source.y===target.y+STEP[target.direction][1]);
  if(target.kind==="conveyor")return target.belt===null;
  return true;
}
export function tick(state:GameState):GameState {
  if(state.paused)return state;
  const s:GameState=structuredClone(state);
  s.tick++;
  let revenueCents=0,costCents=0;
  const audit=(item:Item,event:"produced"|"consumed"|"sold"|"demolished",quantity=1)=>{if(s.materialLedger)s.materialLedger[item][event]+=quantity;};
  // Phase 1: finish due cycles; output cannot be replaced if occupied.
  for(const e of s.entities){
    if(e.kind==="iron_mine"||e.kind==="coal_mine"){
      if(e.output===null){
        e.cycle=(e.cycle??(e.kind==="coal_mine"?3:2))-1;
        if(e.cycle===0){e.output=e.kind==="coal_mine"?"coal":"iron_ore";e.cycle=null;if(e.kind==="iron_mine")s.totalOreProduced++;audit(e.output!,"produced");costCents+=e.kind==="coal_mine"?80:60;}
      }
    }else if(["furnace","assembler","advanced_furnace"].includes(e.kind)&&e.cycle!==null){
      if(e.cycle>0)e.cycle--;
      if(e.cycle===0&&e.output===null){
        const recipe=e.kind==="assembler"?RECIPES.gear:e.kind==="advanced_furnace"?RECIPES.steel:RECIPES.iron_ingot;
        for(const [item,qty] of Object.entries(e.reservedInputs??recipe.input))audit(item as Item,"consumed",qty);
        e.output=recipe.output;e.cycle=null;e.reservedInputs={};audit(recipe.output,"produced");costCents+=recipe.operatingCostCents;if(e.kind==="furnace")s.totalIngotProduced++;
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
  const bySource=new Map<number,Request>([...planned.values()].map(r=>[r.source.id,r]));
  const approved=new Set<number>();
  const visiting=new Set<number>();
  function canMove(r:Request):boolean{
    if(approved.has(r.source.id))return true;
    if(visiting.has(r.source.id))return false;
    visiting.add(r.source.id);
    let possible=false;
    if(r.target.kind==="sell_terminal")possible=true;
    else if(["furnace","assembler","advanced_furnace"].includes(r.target.kind))possible=accepts(r.target,r.source,r.item);
    else if(r.target.kind==="conveyor"){
      if(r.target.belt===null)possible=true;
      else{
        const next=bySource.get(r.target.id);
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
    else if(t.kind==="furnace"){t.oreInput++;t.inputBuffers={...(t.inputBuffers??{}),iron_ore:t.oreInput};}
    else if(t.kind==="assembler"||t.kind==="advanced_furnace")t.inputBuffers={...(t.inputBuffers??{}),[r.item]:(t.inputBuffers?.[r.item]??0)+1};
    else if(t.kind==="sell_terminal"){
      revenueCents+=REVENUE[r.item];
      if(s.sales)s.sales[r.item]++;
      audit(r.item,"sold");
      if(r.item==="iron_ore")s.mission.soldOre++;
      else if(r.item==="iron_ingot")s.mission.soldIngot++;
    }
  }
  // Phase 3: start new furnace cycles when enough ore is buffered.
  for(const e of s.entities){
    if(["furnace","assembler","advanced_furnace"].includes(e.kind)&&e.cycle===null&&e.output===null){
      const recipe=e.kind==="assembler"?RECIPES.gear:e.kind==="advanced_furnace"?RECIPES.steel:RECIPES.iron_ingot;
      const inventory=e.kind==="furnace"?{...e.inputBuffers,iron_ore:e.oreInput}:e.inputBuffers??{};
      if(Object.entries(recipe.input).every(([item,qty])=>(inventory[item as Item]??0)>=qty)){
        for(const [item,qty] of Object.entries(recipe.input)){
          inventory[item as Item]=(inventory[item as Item]??0)-qty;
        }
        e.inputBuffers=inventory;e.reservedInputs={...recipe.input};e.cycle=recipe.durationTicks;
        if(e.kind==="furnace")e.oreInput=inventory.iron_ore??0;
      }
    }
    if(e.kind==="sell_terminal")e.status="waiting_for_inputs";
    else if(e.kind==="conveyor")e.status=e.belt?"working":"waiting_for_inputs";
    else if(e.kind==="iron_mine"||e.kind==="coal_mine")e.status=e.output?"blocked_output":"working";
    else e.status=e.cycle===0||e.output?"blocked_output":e.cycle!==null?"working":"waiting_for_inputs";
  }
  // Phase 4: accounting and progression; capital expenditure is intentionally excluded.
  s.balanceCents+=revenueCents-costCents;
  if(s.totalRevenueCents!==undefined)s.totalRevenueCents+=revenueCents;
  if(s.totalCostCents!==undefined)s.totalCostCents+=costCents;
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
