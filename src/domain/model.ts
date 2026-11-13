export type Direction = "N" | "E" | "S" | "W";
export type Item = "iron_ore" | "iron_ingot" | "coal" | "gear" | "steel" | "copper_ore" | "silicon" | "circuit";
export type RecipeId = "iron_ingot" | "gear" | "steel" | "circuit";
export type Inventory = Partial<Record<Item,number>>;
export type MaterialEvent = "opening" | "produced" | "consumed" | "sold" | "demolished" | "burned";
export type MaterialLedger = Record<Item,Record<MaterialEvent,number>>;
export const ITEMS: readonly Item[]=["iron_ore","iron_ingot","coal","gear","steel","copper_ore","silicon","circuit"];
export const PROCESSORS:readonly Kind[]=["furnace","assembler","advanced_furnace","circuit_fabricator"];
export function recipeFor(kind:Kind):Recipe|null{
  if(kind==="furnace")return RECIPES.iron_ingot;
  if(kind==="assembler")return RECIPES.gear;
  if(kind==="advanced_furnace")return RECIPES.steel;
  if(kind==="circuit_fabricator")return RECIPES.circuit;
  return null;
}
export function stockOnHand(entities:readonly Entity[]):Record<Item,number>{
  const stock=emptySales();
  for(const e of entities){
    if(e.output)stock[e.output]++;
    if(e.belt)stock[e.belt]++;
    for(const item of ITEMS){
      stock[item]+=(e.inputBuffers?.[item]??0)+(e.reservedInputs?.[item]??0);
    }
  }
  return stock;
}
export function emptyLedger():MaterialLedger {
  return Object.fromEntries(ITEMS.map(item=>[item,{opening:0,produced:0,consumed:0,sold:0,demolished:0,burned:0}])) as MaterialLedger;
}
export function emptySales():Record<Item,number>{return Object.fromEntries(ITEMS.map(item=>[item,0])) as Record<Item,number>;}
export interface Recipe { input: Inventory; output: Item; durationTicks: number; operatingCostCents: number; }
export const RECIPES: Record<RecipeId,Recipe> = {
  iron_ingot:{input:{iron_ore:2},output:"iron_ingot",durationTicks:4,operatingCostCents:160},
  gear:{input:{iron_ingot:2},output:"gear",durationTicks:5,operatingCostCents:250},
  steel:{input:{iron_ingot:2,coal:1},output:"steel",durationTicks:8,operatingCostCents:350},
  circuit:{input:{copper_ore:2,silicon:1},output:"circuit",durationTicks:6,operatingCostCents:300}
};
export type Kind = "iron_mine" | "coal_mine" | "furnace" | "assembler" | "advanced_furnace" | "conveyor" | "sell_terminal" | "copper_mine" | "silicon_extractor" | "circuit_fabricator" | "coal_generator";
export type Status = "working" | "waiting_for_inputs" | "blocked_output" | "paused";
export type MissionId = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "DONE";
export interface Entity {
  id: number; kind: Kind; x: number; y: number; direction: Direction;
  output: Item | null; belt: Item | null; oreInput: number;
  cycle: number | null; status: Status;
  inputBuffers?: Inventory; reservedInputs?: Inventory;
  /** Generator stored powered ticks, charged only after physical fuel intake. */
  fuelTicksRemaining?: number;
}
export interface Accounting { tick: number; revenueCents: number; costCents: number; }
export type DiagnosticStatus = "working"|"input_starved"|"output_blocked"|"idle";
export interface DiagnosticEntityTick {
  status:DiagnosticStatus;
  completedUnits:number;
  conveyorMoves:number;
  conveyorStalledTicks:number;
}
export interface DiagnosticTick {
  tick:number;
  entities:Record<string,DiagnosticEntityTick>;
  terminalSales:Record<Item,number>;
}
export interface DiagnosticHistory { samples:DiagnosticTick[]; }
export interface MissionSaleTick { tick:number; sales:Record<Item,number>; }
export interface MissionMetrics {
  activatedAtTick:number;
  salesTicks:MissionSaleTick[];
  streakTicks:number;
  lastEvaluatedTick?:number;
}
export interface PowerTick { tick:number; supply:number; demand:number; served:number; demandCovered:boolean; unpoweredProcessingTicks:number; coalBurned:number; }
export interface PowerState extends PowerTick { lastServedFabricatorId:number; history:PowerTick[]; }
export const POWER_CANDIDATE={fuelTicksPerCoal:12,generatorSupply:1,fabricatorDemand:1} as const;
export interface GameState {
  schemaVersion: 1 | 2 | 3; width: 12; height: 12; tick: number; paused: boolean;
  balanceCents: number; entities: Entity[]; nextId: number;
  missionRuleVersion?:2|3;
  missionMetrics?:MissionMetrics|null;
  diagnostics?:DiagnosticHistory;
  /** WP1 headless-only additive state; full schema migration belongs to WP2. */
  power?:PowerState;
  arbiters: Record<string, number>;
  rollingEvents: Accounting[]; lastEvent: Accounting;
  totalOreProduced: number; totalIngotProduced: number;
  mission: { activeId: MissionId; soldOre: number; soldIngot: number; profitStreakTicks: number; soldCoal?:number; soldGear?:number; soldSteel?:number; };
  introSeen: boolean; introOpen: boolean; tutorialEnabled: boolean;
  foundryStorySeen?:boolean;
  coalDeposits?: {x:number;y:number}[];
  sales?: Record<Item,number>;
  materialLedger?: MaterialLedger;
  totalRevenueCents?:number; totalCostCents?:number;
  technologies?: Record<"coal_extraction"|"mechanical_components"|"advanced_smelting",boolean>;
}
export const DEPOSITS = [{x:3,y:5},{x:2,y:2},{x:2,y:9}] as const;
export const COAL_DEPOSITS = [{x:7,y:9},{x:5,y:9}] as const;
export const COPPER_DEPOSITS = [{x:8,y:2}] as const;
export const SILICON_DEPOSITS = [{x:8,y:9}] as const;
export const TERMINAL = {x:10,y:5} as const;
export const DEFINITIONS = {
  iron_mine: { price:4500, label:"Iron Mine" },
  coal_mine: { price:6500, label:"Coal Mine" },
  assembler: { price:13000, label:"Mechanical Assembler" },
  advanced_furnace: { price:18000, label:"Advanced Furnace" },
  furnace: { price:8000, label:"Furnace" },
  conveyor: { price:500, label:"Conveyor" },
  sell_terminal: { price:0, label:"Sales Terminal" },
  copper_mine: {price:7500,label:"Copper Mine"},
  silicon_extractor: {price:8500,label:"Silicon Extractor"},
  circuit_fabricator: {price:16000,label:"Circuit Fabricator"},
  coal_generator: {price:11000,label:"Coal Generator"}
} as const;
export const REVENUE: Record<Item,number> = {iron_ore:200,iron_ingot:700,coal:300,gear:2100,steel:2600,copper_ore:400,silicon:500,circuit:3000};
export const STEP: Record<Direction,[number,number]> = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
export const rotate = (d:Direction):Direction => ({N:"E",E:"S",S:"W",W:"N"})[d] as Direction;
export const location = (x:number,y:number) => `${x},${y}`;
export function createGame():GameState {
  return { schemaVersion:3,missionRuleVersion:3,missionMetrics:null,diagnostics:{samples:[]},width:12,height:12,tick:0,paused:true,balanceCents:30000,
    sales:emptySales(),materialLedger:emptyLedger(),totalRevenueCents:0,totalCostCents:0,
    coalDeposits:COAL_DEPOSITS.map(d=>({...d})),technologies:{coal_extraction:false,mechanical_components:false,advanced_smelting:false},
    power:{tick:0,supply:0,demand:0,served:0,demandCovered:false,unpoweredProcessingTicks:0,coalBurned:0,lastServedFabricatorId:0,history:[]},
    nextId:2,arbiters:{},rollingEvents:[],lastEvent:{tick:0,revenueCents:0,costCents:0},
    totalOreProduced:0,totalIngotProduced:0,
    entities:[{id:1,kind:"sell_terminal",x:10,y:5,direction:"W",output:null,belt:null,oreInput:0,inputBuffers:{},reservedInputs:{},cycle:null,status:"waiting_for_inputs"}],
    mission:{activeId:"M1",soldOre:0,soldIngot:0,soldCoal:0,soldGear:0,soldSteel:0,profitStreakTicks:0},
    introSeen:false,introOpen:true,tutorialEnabled:true,foundryStorySeen:false };
}
export const money = (cents:number) => (cents/100).toFixed(2)+" Cr";
export function stats(s:GameState) {
  if(s.rollingEvents.length<60) return null;
  const revenueCents=s.rollingEvents.reduce((v,e)=>v+e.revenueCents,0);
  const costCents=s.rollingEvents.reduce((v,e)=>v+e.costCents,0);
  return {revenueCents,costCents,profitCents:revenueCents-costCents};
}
