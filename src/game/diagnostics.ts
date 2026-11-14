import {emptySales,recipeFor,type DiagnosticEntityTick,type DiagnosticStatus,type DiagnosticTick,type Entity,type GameState,type Item} from "../domain/model";

export function recordDiagnostics(state:GameState,observations:Readonly<Record<string,DiagnosticEntityTick>>,terminalSales:Readonly<Record<Item,number>>):void {
  if(!state.diagnostics)state.diagnostics={samples:[]};
  // Sample machine states once per active simulation tick, after material transfers and cycle starts.
  const entities:Record<string,DiagnosticEntityTick>={};
  for(const entity of state.entities){
    const sample=observations[String(entity.id)];
    if(sample)entities[String(entity.id)]={...sample};
  }
  state.diagnostics.samples.push({tick:state.tick,entities,terminalSales:{...terminalSales}});
  if(state.diagnostics.samples.length>60)state.diagnostics.samples.shift();
}
function samples(state:GameState):readonly DiagnosticTick[]{return state.diagnostics?.samples??[];}

export interface EntityDiagnosticSummary {
  ticks:number;
  workingTicks:number;
  inputStarvedTicks:number;
  outputBlockedTicks:number;
  completedUnits:number;
  completedPer60Ticks:number;
  conveyorMoves:number;
  conveyorStalledTicks:number;
}
export function entityDiagnostics(state:GameState,id:number):EntityDiagnosticSummary|null{
  if(!state.entities.some(e=>e.id===id))return null;
  const entries=samples(state).map(t=>t.entities[String(id)]).filter((v):v is DiagnosticEntityTick=>v!==undefined);
  if(!entries.length)return null;
  const count=(status:DiagnosticStatus)=>entries.filter(e=>e.status===status).length;
  const completedUnits=entries.reduce((sum,e)=>sum+e.completedUnits,0);
  return {
    ticks:entries.length,
    workingTicks:count("working"),
    inputStarvedTicks:count("input_starved"),
    outputBlockedTicks:count("output_blocked"),
    completedUnits,
    completedPer60Ticks:completedUnits*60/entries.length,
    conveyorMoves:entries.reduce((sum,e)=>sum+e.conveyorMoves,0),
    conveyorStalledTicks:entries.reduce((sum,e)=>sum+e.conveyorStalledTicks,0)
  };
}
export function terminalDiagnostics(state:GameState):{ticks:number;sales:Record<Item,number>;totalSales:number}{
  const history=samples(state);
  const sales=emptySales();
  for(const tick of history)for(const item of Object.keys(sales) as Item[])sales[item]+=tick.terminalSales[item];
  return {ticks:history.length,sales,totalSales:Object.values(sales).reduce((sum,value)=>sum+value,0)};
}
/** Only engine-derived facts. No inference from animation or wall-clock time. */
export function diagnosticHint(state:GameState,id:number):string{
  const entity=state.entities.find(e=>e.id===id);
  if(!entity)return "Select an existing structure.";
  const current=samples(state).at(-1)?.entities[String(id)];
  if(entity.kind==="sell_terminal")return "Inspect terminal intake by item to find actual sales throughput.";
  if(entity.kind==="conveyor"){
    if(current?.conveyorStalledTicks)return "Occupied conveyor could not move this tick. Check the next tile, its input capacity and direction.";
    if(current?.conveyorMoves)return "Conveyor transferred an item this tick.";
    return "Conveyor has no pending transfer; check upstream supply.";
  }
  if(current?.status==="output_blocked")return "Output blocked: inspect downstream belts and machine inputs.";
  if(entity.kind==="coal_generator"){
    const fuel=entity.fuelTicksRemaining??0;
    if(fuel===0)return "Generator fuel depleted. Route physical coal into its input; fuel powers subsequent active ticks.";
    return "Generator active: fuel remaining "+fuel+"/12 powered ticks. Inspect site-wide power demand and supply.";
  }
  // A running fabricator with an existing cycle is waiting for actual power,
  // not missing recipe inputs; preserve stronger output-blocked diagnostics.
  if(entity.kind==="circuit_fabricator"&&entity.cycle!==null &&
    state.power?.tick===state.tick&&state.power.demand>state.power.served){
    return "Power shortage: "+state.power.served+"/"+state.power.demand+
      " processing requests served. Supply fueled generators; inspect coal input.";
  }
  const recipe=recipeFor(entity.kind);
  if((current?.status==="input_starved"||
    (entity.kind==="circuit_fabricator"&&current===undefined&&entity.cycle===null)) && recipe){
    const missing=Object.entries(recipe.input).filter(([item,needed])=>
      (entity.inputBuffers?.[item as Item]??0)<needed);
    if(missing.length)return "Missing "+missing.map(([item])=>item.replaceAll("_"," ")).join(" and ")+". Route enough inputs to start a cycle.";
  }
  if(current?.status==="working")return "Processing normally. Check completed units and terminal demand.";
  if(entity.kind==="iron_mine"||entity.kind==="coal_mine")
    return "Check mine direction and downstream output flow.";
  return "Inspect input buffers, output route and operating share.";
}
