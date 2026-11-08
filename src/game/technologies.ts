import type {GameState} from "../domain/model";

export type TechnologyId="coal_extraction"|"mechanical_components"|"advanced_smelting";
export type TechnologyState="locked"|"available"|"unlocked";

export interface TechnologyDefinition {
  id:TechnologyId;
  label:string;
  unlocks:string;
  costCents:number;
}
export const TECHNOLOGIES:Record<TechnologyId,TechnologyDefinition>={
  coal_extraction:{id:"coal_extraction",label:"Coal Extraction",unlocks:"Coal Mine",costCents:8000},
  mechanical_components:{id:"mechanical_components",label:"Mechanical Components",unlocks:"Mechanical Assembler",costCents:12000},
  advanced_smelting:{id:"advanced_smelting",label:"Advanced Smelting",unlocks:"Advanced Furnace",costCents:18000}
};
export const TECHNOLOGY_ORDER:readonly TechnologyId[]=[
  "coal_extraction","mechanical_components","advanced_smelting"
];

export interface TechnologyStatus {
  status:TechnologyState;
  missing:string[];
  requirements:string[];
  costCents:number;
  affordable:boolean;
}

function completedM4(state:GameState):boolean{
  // DONE is the v0.1 post-M4 state, including migrated saves.
  // v0.2 missions M5-M7 also imply M4 was completed previously.
  return ["DONE","M5","M6","M7"].includes(state.mission.activeId);
}
export function technologyStatus(state:GameState,id:TechnologyId):TechnologyStatus {
  const tech=TECHNOLOGIES[id];
  const unlocked=state.technologies?.[id]===true;
  const ingots=state.sales?.iron_ingot??0;
  const coal=state.sales?.coal??0;
  const gears=state.sales?.gear??0;
  const requirements:string[]=[];
  const missing:string[]=[];
  const require=(label:string,met:boolean)=>{
    requirements.push(label);
    if(!met)missing.push(label);
  };
  if(id==="coal_extraction"){
    require("Complete M4 (Restore Profitability)",completedM4(state));
  } else if(id==="mechanical_components"){
    require("Complete M4 (Restore Profitability)",completedM4(state));
    require(`Sell 20 iron ingots (${Math.min(20,ingots)}/20)`,ingots>=20);
  } else {
    require("Own Coal Extraction",state.technologies?.coal_extraction===true);
    require("Own Mechanical Components",state.technologies?.mechanical_components===true);
    require(`Sell 10 coal (${Math.min(10,coal)}/10)`,coal>=10);
    require(`Sell 8 gears (${Math.min(8,gears)}/8)`,gears>=8);
  }
  return {
    status:unlocked?"unlocked":missing.length===0?"available":"locked",
    missing,requirements,costCents:tech.costCents,affordable:state.balanceCents>=tech.costCents
  };
}

export interface TechnologyPurchaseResult {ok:boolean;message:string;state:GameState;}
export function purchaseTechnology(state:GameState,id:TechnologyId):TechnologyPurchaseResult {
  if(!Object.prototype.hasOwnProperty.call(TECHNOLOGIES,id)){
    return {ok:false,message:"Unknown technology.",state};
  }
  const current=technologyStatus(state,id);
  if(current.status==="unlocked")return {ok:false,message:"Technology already unlocked.",state};
  if(current.status==="locked")return {ok:false,message:`Missing prerequisites: ${current.missing.join("; ")}.`,state};
  if(!current.affordable)return {ok:false,message:"Insufficient credits for technology purchase.",state};
  if(!state.technologies)return {ok:false,message:"Technology state unavailable.",state};
  const next=structuredClone(state);
  next.balanceCents-=TECHNOLOGIES[id].costCents;
  next.technologies![id]=true;
  return {ok:true,message:`${TECHNOLOGIES[id].label} unlocked for ${(TECHNOLOGIES[id].costCents/100).toFixed(2)} Cr.`,state:next};
}
