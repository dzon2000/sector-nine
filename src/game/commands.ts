import {createGame,DEFINITIONS,DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,ITEMS,STEP,rotate,type Direction,type Entity,type GameState,type Kind} from "../domain/model";
export type CommandResult={ok:boolean;message:string;state:GameState};
function copy(s:GameState):GameState{return structuredClone(s);}
export function place(s:GameState,kind:Exclude<Kind,"sell_terminal">,x:number,y:number,direction:Direction):CommandResult {
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=s.width||y>=s.height)
    return {ok:false,message:"Tile outside the map.",state:s};
  if(s.entities.some(e=>e.x===x&&e.y===y))return {ok:false,message:"Tile is occupied.",state:s};
  if(kind==="furnace"&&["M1","M2"].includes(s.mission.activeId))return {ok:false,message:"Complete M2 to unlock the furnace.",state:s};
  const technology=({coal_mine:"coal_extraction",assembler:"mechanical_components",advanced_furnace:"advanced_smelting"} as const)[kind as "coal_mine"|"assembler"|"advanced_furnace"];
  if(technology&&!s.technologies?.[technology])return {ok:false,message:"Technology not unlocked.",state:s};
  if(kind==="copper_mine"&&!COPPER_DEPOSITS.some(d=>d.x===x&&d.y===y))return {ok:false,message:"Copper mines require a copper deposit.",state:s};
  if(kind==="silicon_extractor"&&!SILICON_DEPOSITS.some(d=>d.x===x&&d.y===y))return {ok:false,message:"Silicon extractors require a silicon deposit.",state:s};
  if(kind==="coal_mine"&&!COAL_DEPOSITS.some(d=>d.x===x&&d.y===y))return {ok:false,message:"Coal mines require a coal deposit.",state:s};
  if(kind==="iron_mine"&&!DEPOSITS.some(d=>d.x===x&&d.y===y))
    return {ok:false,message:"Mines must be placed on an iron deposit.",state:s};
  if(kind!=="coal_mine"&&COAL_DEPOSITS.some(d=>d.x===x&&d.y===y))return {ok:false,message:"Deposit reserved for coal mining.",state:s};
  if(kind!=="iron_mine"&&DEPOSITS.some(d=>d.x===x&&d.y===y))
    return {ok:false,message:"Deposit reserved for an iron mine.",state:s};
  const price=DEFINITIONS[kind].price;
  if(s.balanceCents<price)return {ok:false,message:"Insufficient credits for construction.",state:s};
  const n=copy(s);
  n.balanceCents-=price;
  n.entities.push({id:n.nextId++,kind,x,y,direction,output:null,belt:null,oreInput:0,inputBuffers:{},reservedInputs:{},cycle:null,status:"waiting_for_inputs",...(kind==="coal_generator"?{fuelTicksRemaining:0}:{})});
  return {ok:true,message:`${DEFINITIONS[kind].label} constructed for ${(price/100).toFixed(2)} Cr.`,state:n};
}
export function turn(s:GameState,id:number):CommandResult {
  const n=copy(s), e=n.entities.find(e=>e.id===id);
  if(!e||e.kind==="sell_terminal")return {ok:false,message:"Cannot rotate this object.",state:s};
  e.direction=rotate(e.direction);return {ok:true,message:"Object rotated.",state:n};
}
export function remove(s:GameState,id:number,confirmed=false):CommandResult {
  const e=s.entities.find(e=>e.id===id);
  if(!e||e.kind==="sell_terminal")return {ok:false,message:"Sales terminal cannot be removed.",state:s};
  if(!confirmed)return {ok:false,message:"Confirm demolition. Buffered items will be destroyed.",state:s};
  const n=copy(s);
  if(n.materialLedger){
    const demolish=(item:keyof typeof n.materialLedger,quantity:number)=>{n.materialLedger![item].demolished+=quantity;};
    if(e.output)demolish(e.output,1);
    if(e.belt)demolish(e.belt,1);
    for(const item of ITEMS)demolish(item,e.inputBuffers?.[item]??0);
    for(const item of ITEMS)demolish(item,e.reservedInputs?.[item]??0);
  }
  n.entities=n.entities.filter(e=>e.id!==id);
  // Entity IDs are stable. Never retain demolished machine/conveyor samples.
  for(const sample of n.diagnostics?.samples??[])delete sample.entities[String(id)];
  const refund=Math.floor(DEFINITIONS[e.kind].price*0.75);
  n.balanceCents+=refund;
  return {ok:true,message:`Demolished. Refunded ${(refund/100).toFixed(2)} Cr; buffered items destroyed.`,state:n};
}
export function setPause(s:GameState,paused:boolean):GameState {
  const n=copy(s);n.paused=paused;return n;
}
export function begin(s:GameState):GameState {
  const n=copy(s);n.introSeen=true;n.introOpen=false;n.paused=false;return n;
}
export function reset():GameState{return createGame();}
export function neighbor(e:Entity):[number,number]{const [dx,dy]=STEP[e.direction];return [e.x+dx,e.y+dy];}
