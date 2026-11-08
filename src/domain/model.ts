export type Direction = "N" | "E" | "S" | "W";
export type Item = "iron_ore" | "iron_ingot" | "coal" | "gear" | "steel";
export type RecipeId = "iron_ingot" | "gear" | "steel";
export type Inventory = Partial<Record<Item,number>>;
export type MaterialEvent = "produced" | "consumed" | "sold" | "demolished";
export type MaterialLedger = Record<Item,Record<MaterialEvent,number>>;
export const ITEMS: readonly Item[]=["iron_ore","iron_ingot","coal","gear","steel"];
export function emptyLedger():MaterialLedger {
  return Object.fromEntries(ITEMS.map(item=>[item,{produced:0,consumed:0,sold:0,demolished:0}])) as MaterialLedger;
}
export function emptySales():Record<Item,number>{return Object.fromEntries(ITEMS.map(item=>[item,0])) as Record<Item,number>;}
export interface Recipe { input: Inventory; output: Item; durationTicks: number; operatingCostCents: number; }
export const RECIPES: Record<RecipeId,Recipe> = {
  iron_ingot:{input:{iron_ore:2},output:"iron_ingot",durationTicks:4,operatingCostCents:160},
  gear:{input:{iron_ingot:2},output:"gear",durationTicks:5,operatingCostCents:250},
  steel:{input:{iron_ingot:2,coal:1},output:"steel",durationTicks:8,operatingCostCents:350}
};
export type Kind = "iron_mine" | "coal_mine" | "furnace" | "assembler" | "advanced_furnace" | "conveyor" | "sell_terminal";
export type Status = "working" | "waiting_for_inputs" | "blocked_output" | "paused";
export type MissionId = "M1" | "M2" | "M3" | "M4" | "DONE";
export interface Entity {
  id: number; kind: Kind; x: number; y: number; direction: Direction;
  output: Item | null; belt: Item | null; oreInput: number;
  cycle: number | null; status: Status;
  inputBuffers?: Inventory; reservedInputs?: Inventory;
}
export interface Accounting { tick: number; revenueCents: number; costCents: number; }
export interface GameState {
  schemaVersion: 1 | 2; width: 12; height: 12; tick: number; paused: boolean;
  balanceCents: number; entities: Entity[]; nextId: number;
  arbiters: Record<string, number>;
  rollingEvents: Accounting[]; lastEvent: Accounting;
  totalOreProduced: number; totalIngotProduced: number;
  mission: { activeId: MissionId; soldOre: number; soldIngot: number; profitStreakTicks: number; };
  introSeen: boolean; introOpen: boolean; tutorialEnabled: boolean;
  coalDeposits?: {x:number;y:number}[];
  sales?: Record<Item,number>;
  materialLedger?: MaterialLedger;
  totalRevenueCents?:number; totalCostCents?:number;
  technologies?: Record<"coal_extraction"|"mechanical_components"|"advanced_smelting",boolean>;
}
export const DEPOSITS = [{x:3,y:5},{x:2,y:2},{x:2,y:9}] as const;
export const COAL_DEPOSITS = [{x:7,y:9},{x:5,y:9}] as const;
export const TERMINAL = {x:10,y:5} as const;
export const DEFINITIONS = {
  iron_mine: { price:4500, label:"Iron Mine" },
  coal_mine: { price:6500, label:"Coal Mine" },
  assembler: { price:13000, label:"Mechanical Assembler" },
  advanced_furnace: { price:18000, label:"Advanced Furnace" },
  furnace: { price:8000, label:"Furnace" },
  conveyor: { price:500, label:"Conveyor" },
  sell_terminal: { price:0, label:"Sales Terminal" }
} as const;
export const REVENUE: Record<Item,number> = {iron_ore:200,iron_ingot:700,coal:300,gear:2100,steel:2600};
export const STEP: Record<Direction,[number,number]> = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
export const rotate = (d:Direction):Direction => ({N:"E",E:"S",S:"W",W:"N"})[d] as Direction;
export const location = (x:number,y:number) => `${x},${y}`;
export function createGame():GameState {
  return { schemaVersion:2,width:12,height:12,tick:0,paused:true,balanceCents:30000,
    sales:emptySales(),materialLedger:emptyLedger(),totalRevenueCents:0,totalCostCents:0,
    coalDeposits:COAL_DEPOSITS.map(d=>({...d})),technologies:{coal_extraction:false,mechanical_components:false,advanced_smelting:false},
    nextId:2,arbiters:{},rollingEvents:[],lastEvent:{tick:0,revenueCents:0,costCents:0},
    totalOreProduced:0,totalIngotProduced:0,
    entities:[{id:1,kind:"sell_terminal",x:10,y:5,direction:"W",output:null,belt:null,oreInput:0,inputBuffers:{},reservedInputs:{},cycle:null,status:"waiting_for_inputs"}],
    mission:{activeId:"M1",soldOre:0,soldIngot:0,profitStreakTicks:0},
    introSeen:false,introOpen:true,tutorialEnabled:true };
}
export const money = (cents:number) => (cents/100).toFixed(2)+" Cr";
export function stats(s:GameState) {
  if(s.rollingEvents.length<60) return null;
  const revenueCents=s.rollingEvents.reduce((v,e)=>v+e.revenueCents,0);
  const costCents=s.rollingEvents.reduce((v,e)=>v+e.costCents,0);
  return {revenueCents,costCents,profitCents:revenueCents-costCents};
}
