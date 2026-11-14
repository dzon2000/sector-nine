import {REVENUE,STEP,recipeFor,stats,emptySales,POWER_CANDIDATE,type DiagnosticEntityTick,type Entity,type GameState,type Item} from "../domain/model";
import {recordDiagnostics} from "../game/diagnostics";
import {recordMissionTick} from "../game/missionMetrics";
import {updateMission} from "../game/missions";
type Request={source:Entity;target:Entity;item:Item};
function at(s:GameState,x:number,y:number){return s.entities.find(e=>e.x===x&&e.y===y);}
function output(e:Entity):Item|null{return e.kind==="conveyor"||e.kind==="splitter"?e.belt:e.output;}
function clear(e:Entity){if(e.kind==="conveyor"||e.kind==="splitter")e.belt=null;else e.output=null;}
function directionTo(e:Entity):[number,number]{const [x,y]=STEP[e.direction];return [e.x+x,e.y+y];}
function accepts(target:Entity,source:Entity,item:Item):boolean{
  if(["iron_mine","coal_mine","copper_mine","silicon_extractor"].includes(target.kind))return false;
  if(target.kind==="coal_generator")return item==="coal" && (target.inputBuffers?.coal??0)<4;
  const recipe=recipeFor(target.kind);
  if(recipe)return (recipe.input[item]??0)>0&&(target.inputBuffers?.[item]??0)<4&&
    !(source.x===target.x+STEP[target.direction][0]&&source.y===target.y+STEP[target.direction][1]);
  if(target.kind==="conveyor"||target.kind==="splitter")return target.belt===null;
  return true;
}
export function tick(state:GameState):GameState {
  if(state.paused)return state;
  const s:GameState=structuredClone(state);
  s.tick++;
  let revenueCents=0,costCents=0;
  const tickSales=emptySales();
  const completions=new Map<number,number>();
  const completed=(id:number)=>completions.set(id,(completions.get(id)??0)+1);
  const audit=(item:Item,event:"produced"|"consumed"|"sold"|"demolished",quantity=1)=>{if(s.materialLedger)s.materialLedger[item][event]+=quantity;};
  // Preserve the exact v0.3 state shape until electronics are first introduced.
  const tracksPower=Boolean(s.power||s.entities.some(e=>e.kind==="coal_generator"||e.kind==="circuit_fabricator"));
  // Site-wide power is based solely on beginning-of-tick stored fuel.
  const power=s.power??{tick:0,supply:0,demand:0,served:0,demandCovered:false,
    unpoweredProcessingTicks:0,coalBurned:0,lastServedFabricatorId:0,history:[]};
  if(tracksPower)s.power=power;
  const generators=s.entities.filter(e=>e.kind==="coal_generator");
  const fueled=generators.filter(e=>(e.fuelTicksRemaining??0)>0);
  const supply=fueled.length*POWER_CANDIDATE.generatorSupply;
  for(const generator of fueled)generator.fuelTicksRemaining!--;
  const requesting=s.entities.filter(e=>e.kind==="circuit_fabricator"&&e.cycle!==null&&e.cycle>0&&e.output===null)
    .sort((a,b)=>a.id-b.id);
  const firstAfter=requesting.findIndex(e=>e.id>power.lastServedFabricatorId);
  const start=firstAfter<0?0:firstAfter;
  const servedIds=new Set<number>();
  for(let i=0;i<Math.min(supply,requesting.length);i++){
    const id=requesting[(start+i)%requesting.length].id;
    servedIds.add(id);
    power.lastServedFabricatorId=id;
  }
  const demand=requesting.length;
  const served=servedIds.size;
  const deficient=demand-served;
  // Phase 1: finish due cycles; output cannot be replaced if occupied.
  for(const e of s.entities){
    if(["iron_mine","coal_mine","copper_mine","silicon_extractor"].includes(e.kind)){
      if(e.output===null){
        e.cycle=(e.cycle??({coal_mine:3,iron_mine:2,copper_mine:2,silicon_extractor:4} as const)[e.kind as "coal_mine"|"iron_mine"|"copper_mine"|"silicon_extractor"])-1;
        if(e.cycle===0){e.output=({coal_mine:"coal",iron_mine:"iron_ore",copper_mine:"copper_ore",silicon_extractor:"silicon"} as const)[e.kind as "coal_mine"|"iron_mine"|"copper_mine"|"silicon_extractor"];e.cycle=null;if(e.kind==="iron_mine")s.totalOreProduced++;completed(e.id);audit(e.output!,"produced");costCents+=({coal_mine:80,iron_mine:60,copper_mine:70,silicon_extractor:90} as const)[e.kind as "coal_mine"|"iron_mine"|"copper_mine"|"silicon_extractor"];}
      }
    }else if(recipeFor(e.kind)&&e.cycle!==null){
      if(e.cycle>0&&(e.kind!=="circuit_fabricator"||servedIds.has(e.id)))e.cycle--;
      if(e.cycle===0&&e.output===null){
        const recipe=recipeFor(e.kind)!;
        for(const [item,qty] of Object.entries(e.reservedInputs??recipe.input))audit(item as Item,"consumed",qty);
        e.output=recipe.output;e.cycle=null;e.reservedInputs={};completed(e.id);audit(recipe.output,"produced");costCents+=recipe.operatingCostCents;if(e.kind==="furnace")s.totalIngotProduced++;
      }
    }
  }
  // Phase 2: plan transfers from a snapshot. A newly arrived belt item cannot move again.
  // A vacated belt is a valid destination. Every source proposes at most one item.
  const requests:Request[]=[];
  for(const e of s.entities){
    const item=output(e);if(!item||e.kind==="sell_terminal")continue;
    if(e.kind==="splitter"){
      const [fx,fy]=STEP[e.direction];
      const outlets:[[number,number],[number,number]]=[[fx,fy],[-fy,fx]];
      const preferred=e.splitterNext??0;
      for(const index of [preferred,1-preferred]){
        const [dx,dy]=outlets[index];
        const target=at(s,e.x+dx,e.y+dy);
        if(!target)continue;
        // Conservative fallback: only the free destination is considered here.
        // Occupied moving conveyor chains may be eligible after full arbitration.
        if(accepts(target,e,item)){
          requests.push({source:e,target,item});
          break;
        }
      }
    }else{
      const [x,y]=directionTo(e),target=at(s,x,y);
      if(target&&accepts(target,e,item))requests.push({source:e,target,item});
      else if((target?.kind==="conveyor"||target?.kind==="splitter")&&target.belt!==null)
        requests.push({source:e,target,item});
    }
  }
  const byTarget=new Map<number,Request[]>();
  for(const r of requests){const a=byTarget.get(r.target.id)??[];a.push(r);byTarget.set(r.target.id,a);}
  const planned=new Map<number,Request>();
  for(const [id,reqs] of byTarget){
    const target=reqs[0].target;
    // Reject transfers to a furnace whose buffer is already full or wrong-side input.
    const viable=reqs.filter(r=>accepts(target,r.source,r.item) || ((target.kind==="conveyor"||target.kind==="splitter")&&target.belt!==null));
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
    else if(recipeFor(r.target.kind)||r.target.kind==="coal_generator")possible=accepts(r.target,r.source,r.item);
    else if(r.target.kind==="conveyor"||r.target.kind==="splitter"){
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
  // Belt occupancy at the exact transfer boundary, before departures and arrivals.
  const conveyorOccupiedAtTransfer=new Set(s.entities.filter(e=>(e.kind==="conveyor"||e.kind==="splitter")&&e.belt!==null).map(e=>e.id));
  // Depart all sources first, then arrive at destinations.
  const transfers=[...planned.values()].filter(r=>approved.has(r.source.id));
  for(const r of transfers){
    if(r.source.kind==="splitter"){
      const [fx,fy]=STEP[r.source.direction];
      const side:[number,number]=[-fy,fx];
      const isForward=r.target.x===r.source.x+fx&&r.target.y===r.source.y+fy;
      const chosen=isForward?0:1;
      r.source.splitterNext=(1-chosen) as 0|1;
    }
    clear(r.source);
  }
  for(const r of transfers){
    const t=r.target;
    s.arbiters[String(t.id)]=r.source.id;
    if(t.kind==="conveyor"||t.kind==="splitter"){t.belt=r.item;costCents+=5;}
    else if(recipeFor(t.kind)||t.kind==="coal_generator"){
      t.inputBuffers={...(t.inputBuffers??{}),[r.item]:(t.inputBuffers?.[r.item]??0)+1};
      if(t.kind==="furnace")t.oreInput=t.inputBuffers.iron_ore??0; // Legacy read-only mirror for v0.1-compatible snapshots.
    }
    else if(t.kind==="sell_terminal"){
      revenueCents+=REVENUE[r.item];
      tickSales[r.item]++;
      if(s.sales)s.sales[r.item]++;
      audit(r.item,"sold");
      if(r.item==="iron_ore")s.mission.soldOre++;
      else if(r.item==="iron_ingot")s.mission.soldIngot++;
      else if(r.item==="coal"&&s.mission.activeId==="M5")s.mission.soldCoal=(s.mission.soldCoal??0)+1;
      else if(r.item==="gear"&&s.mission.activeId==="M6")s.mission.soldGear=(s.mission.soldGear??0)+1;
      else if(r.item==="steel"&&s.mission.activeId==="M7")s.mission.soldSteel=(s.mission.soldSteel??0)+1;
    }
  }
  // Capture genuine movement outcomes after arbitration, before new cycles begin.
  const diagnosticDepartures=new Set(transfers.map(r=>r.source.id));
  // Coal physically transferred this tick can fuel only later active ticks.
  let coalBurned=0;
  for(const e of generators){
    if((e.fuelTicksRemaining??0)===0 && (e.inputBuffers?.coal??0)>0){
      e.inputBuffers!.coal=(e.inputBuffers!.coal??0)-1;
      e.fuelTicksRemaining=POWER_CANDIDATE.fuelTicksPerCoal;
      if(s.materialLedger)s.materialLedger.coal.burned=(s.materialLedger.coal.burned??0)+1;
      coalBurned++;
    }
  }
  // Phase 3: start any processor when its typed inputs satisfy its declarative recipe.
  for(const e of s.entities){
    if(recipeFor(e.kind)&&e.cycle===null&&e.output===null){
      const recipe=recipeFor(e.kind)!;
      const inventory={...(e.inputBuffers??{})};
      if(Object.entries(recipe.input).every(([item,qty])=>(inventory[item as Item]??0)>=qty)){
        for(const [item,qty] of Object.entries(recipe.input)){
          inventory[item as Item]=(inventory[item as Item]??0)-qty;
        }
        e.inputBuffers=inventory;e.reservedInputs={...recipe.input};e.cycle=recipe.durationTicks;
        if(e.kind==="furnace")e.oreInput=inventory.iron_ore??0; // Mirror; typed inventory is authoritative.
      }
    }
    if(e.kind==="sell_terminal")e.status="waiting_for_inputs";
    else if(e.kind==="conveyor"||e.kind==="splitter")e.status=e.belt?"working":"waiting_for_inputs";
    else if(["iron_mine","coal_mine","copper_mine","silicon_extractor"].includes(e.kind))e.status=e.output?"blocked_output":"working";
    else if(e.kind==="coal_generator")e.status=(e.fuelTicksRemaining??0)>0?"working":"waiting_for_inputs";
    else e.status=e.cycle===0||e.output?"blocked_output":e.cycle!==null?"working":"waiting_for_inputs";
  }
  // Exactly one mutually exclusive machine status per completed active tick.
  const observations:Record<string,DiagnosticEntityTick>={};
  for(const e of s.entities){
    let status:DiagnosticEntityTick["status"]="idle";
    if(["iron_mine","coal_mine","copper_mine","silicon_extractor"].includes(e.kind)){
      status=e.output!==null?"output_blocked":"working";
    }else if(e.kind==="coal_generator"){
      status=(e.fuelTicksRemaining??0)>0?"working":"input_starved";
    }else if(recipeFor(e.kind)){
      if(e.output!==null)status="output_blocked";
      else if(e.cycle!==null)status="working";
      else status="input_starved";
    }
    observations[String(e.id)]={
      status,completedUnits:completions.get(e.id)??0,
      conveyorMoves:(e.kind==="conveyor"||e.kind==="splitter")&&diagnosticDepartures.has(e.id)?1:0,
      conveyorStalledTicks:(e.kind==="conveyor"||e.kind==="splitter")&&conveyorOccupiedAtTransfer.has(e.id)&&
        !diagnosticDepartures.has(e.id)?1:0
    };
  }
  const powerTick={tick:s.tick,supply,demand,served,demandCovered:demand>0&&served===demand,
    unpoweredProcessingTicks:deficient,coalBurned};
  if(tracksPower){
    Object.assign(power,powerTick);
    power.history.push(powerTick);
    if(power.history.length>60)power.history.shift();
  }
  // Phase 4: accounting and progression; capital expenditure is intentionally excluded.
  s.balanceCents+=revenueCents-costCents;
  if(s.totalRevenueCents!==undefined)s.totalRevenueCents+=revenueCents;
  if(s.totalCostCents!==undefined)s.totalCostCents+=costCents;
  s.lastEvent={tick:s.tick,revenueCents,costCents};
  s.rollingEvents.push(s.lastEvent);
  if(s.rollingEvents.length>60)s.rollingEvents.shift();
  recordMissionTick(s,tickSales);
  recordDiagnostics(s,observations,tickSales);
  updateMission(s);
  return s;
}
export function runTicks(s:GameState,count:number):GameState {
  for(let i=0;i<count;i++)s=tick(s);
  return s;
}
export function benchmark(s:GameState){return {tick:s.tick,stats:stats(s),ore:s.totalOreProduced,ingots:s.mission.soldIngot};}
