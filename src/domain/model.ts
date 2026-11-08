export type Direction = "N" | "E" | "S" | "W";
export type Item = "iron_ore" | "iron_ingot";
export type Kind = "iron_mine" | "furnace" | "conveyor" | "sell_terminal";
export type Status = "working" | "waiting_for_inputs" | "blocked_output" | "paused";
export type MissionId = "M1" | "M2" | "M3" | "M4" | "DONE";
export interface Entity {
  id: number; kind: Kind; x: number; y: number; direction: Direction;
  output: Item | null; belt: Item | null; oreInput: number;
  cycle: number | null; status: Status;
}
export interface Accounting { tick: number; revenueCents: number; costCents: number; }
export interface GameState {
  schemaVersion: 1; width: 12; height: 12; tick: number; paused: boolean;
  balanceCents: number; entities: Entity[]; nextId: number;
  arbiters: Record<string, number>;
  rollingEvents: Accounting[]; lastEvent: Accounting;
  totalOreProduced: number; totalIngotProduced: number;
  mission: { activeId: MissionId; soldOre: number; soldIngot: number; profitStreakTicks: number; };
  introSeen: boolean; introOpen: boolean; tutorialEnabled: boolean;
}
export const DEPOSITS = [{x:3,y:5},{x:2,y:2},{x:2,y:9}] as const;
export const TERMINAL = {x:10,y:5} as const;
export const DEFINITIONS = {
  iron_mine: { price:4500, label:"Iron Mine" },
  furnace: { price:8000, label:"Furnace" },
  conveyor: { price:500, label:"Conveyor" },
  sell_terminal: { price:0, label:"Sales Terminal" }
} as const;
export const REVENUE: Record<Item,number> = {iron_ore:200,iron_ingot:700};
export const STEP: Record<Direction,[number,number]> = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
export const rotate = (d:Direction):Direction => ({N:"E",E:"S",S:"W",W:"N"})[d] as Direction;
export const location = (x:number,y:number) => `${x},${y}`;
export function createGame():GameState {
  return { schemaVersion:1,width:12,height:12,tick:0,paused:true,balanceCents:30000,
    nextId:2,arbiters:{},rollingEvents:[],lastEvent:{tick:0,revenueCents:0,costCents:0},
    totalOreProduced:0,totalIngotProduced:0,
    entities:[{id:1,kind:"sell_terminal",x:10,y:5,direction:"W",output:null,belt:null,oreInput:0,cycle:null,status:"waiting_for_inputs"}],
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
