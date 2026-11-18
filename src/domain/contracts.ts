export const CHAPTER_III_CONTRACTS=["M11","M12","M13"] as const;
export const CHAPTER_III_ROUTES=["independent","corporate"] as const;
export const CHAPTER_III_PRODUCTS=["circuit","gear","steel"] as const;
export const CONTRACT_WINDOW_TICKS=60;
export const CONTRACT_STREAK_WINDOWS=30;

export type ChapterIIIContractId=typeof CHAPTER_III_CONTRACTS[number];
export type ChapterIIIRoute=typeof CHAPTER_III_ROUTES[number];
export type ChapterIIIProduct=typeof CHAPTER_III_PRODUCTS[number];
export type ContractProducts=Record<ChapterIIIProduct,number>;
export interface ContractTick {
  tick:number;
  sold:ContractProducts;
  produced:ContractProducts;
  demandCovered:boolean;
  coalBurned:number;
  profitCents:number;
}
export interface ContractWindow {
  sold:ContractProducts;
  produced:ContractProducts;
  coveredTicks:number;
  coalBurned:number;
  profitCents:number;
}
export interface ActiveChapterIIIContract {
  id:ChapterIIIContractId;
  activatedAtTick:number;
  ticks:ContractTick[];
  streakTicks:number;
}
export interface ChapterIIIState {
  route:ChapterIIIRoute|null;
  /** Ordered contract completions are the archive unlocks and the progression record. */
  completed:ChapterIIIContractId[];
  active:ActiveChapterIIIContract|null;
}

interface ContractGoal {
  readonly products:Readonly<Partial<ContractProducts>>;
  readonly coveredTicks?:number;
  readonly maxCoalBurned?:number;
  readonly profitCents?:number;
}

const ARCHIVE_RECOVERY:ContractGoal={products:{circuit:12,gear:6}};
const RECIPIENT_GOALS:Readonly<Record<ChapterIIIRoute,ContractGoal>>={
  independent:{products:{circuit:9},coveredTicks:60,maxCoalBurned:5},
  corporate:{products:{circuit:12,steel:10}},
};
const INTERLOCK_RECONSTRUCTION:ContractGoal={products:{circuit:13,gear:12,steel:7},profitCents:60000};

export function chapterIIIContractGoal(id:ChapterIIIContractId,route:ChapterIIIRoute|null):ContractGoal|null {
  switch(id){
    case "M11":return ARCHIVE_RECOVERY;
    case "M12":return route===null?null:RECIPIENT_GOALS[route];
    case "M13":return INTERLOCK_RECONSTRUCTION;
  }
}

export function contractProducts(counts:Readonly<ContractProducts>):ContractProducts {
  return {circuit:counts.circuit,gear:counts.gear,steel:counts.steel};
}

export function summarizeContractTicks(ticks:readonly ContractTick[]):ContractWindow {
  const total:ContractWindow={
    sold:{circuit:0,gear:0,steel:0},produced:{circuit:0,gear:0,steel:0},
    coveredTicks:0,coalBurned:0,profitCents:0,
  };
  for(const event of ticks){
    for(const product of CHAPTER_III_PRODUCTS){
      total.sold[product]+=event.sold[product];
      total.produced[product]+=event.produced[product];
    }
    total.coveredTicks+=Number(event.demandCovered);
    total.coalBurned+=event.coalBurned;
    total.profitCents+=event.profitCents;
  }
  return total;
}

export function contractQualifies(id:ChapterIIIContractId,route:ChapterIIIRoute|null,window:ContractWindow):boolean {
  const goal=chapterIIIContractGoal(id,route);
  return goal!==null &&
    CHAPTER_III_PRODUCTS.every(product=>Math.min(window.sold[product],window.produced[product])>=(goal.products[product]??0)) &&
    window.coveredTicks>=(goal.coveredTicks??0) &&
    (goal.maxCoalBurned===undefined||window.coalBurned<=goal.maxCoalBurned) &&
    (goal.profitCents===undefined||window.profitCents>=goal.profitCents);
}
