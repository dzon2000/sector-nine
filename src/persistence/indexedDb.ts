import {COAL_DEPOSITS,ITEMS,emptyLedger,emptySales,stockOnHand,recipeFor,type GameState,type Item} from "../domain/model";
const DATABASE="sector-nine-v0.1";
const STORE="snapshots";
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
function transaction<T>(db:IDBDatabase,mode:IDBTransactionMode,action:(store:IDBObjectStore,resolve:(v:T)=>void,reject:(e:unknown)=>void)=>void):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    tx.onerror=()=>reject(tx.error);
    action(tx.objectStore(STORE),resolve,reject);
  }).finally(()=>db.close());
}
export function validateSave(value:unknown):GameState{
  if(!value||typeof value!=="object")throw Error("Save is missing or corrupt.");
  const s=value as GameState;
  if(s.schemaVersion!==1&&s.schemaVersion!==2&&s.schemaVersion!==3)throw Error("Unsupported save schema. Export or reset your save manually.");
  if(s.width!==12||s.height!==12||!Number.isSafeInteger(s.tick)||s.tick<0||
    !Number.isSafeInteger(s.balanceCents)||!Array.isArray(s.entities)||!Array.isArray(s.rollingEvents)||
    (!s.arbiters||typeof s.arbiters!=="object"||Array.isArray(s.arbiters)||Object.entries(s.arbiters).some(([key,value])=>!Number.isSafeInteger(Number(key))||Number(key)<1||!Number.isSafeInteger(value)||value<0))||!s.mission||!Number.isSafeInteger(s.nextId)||
    !Number.isSafeInteger(s.totalOreProduced)||!Number.isSafeInteger(s.totalIngotProduced)||
    !Number.isSafeInteger(s.mission.soldOre)||!Number.isSafeInteger(s.mission.soldIngot)||
    !Number.isSafeInteger(s.mission.profitStreakTicks)||!["M1","M2","M3","M4","M5","M6","M7","DONE"].includes(s.mission.activeId)||
    typeof s.paused!=="boolean"||typeof s.introSeen!=="boolean"||typeof s.introOpen!=="boolean"||
    typeof s.tutorialEnabled!=="boolean"||s.rollingEvents.length>60)throw Error("Save validation failed. Your data has not been overwritten.");
  const spots=new Set<string>();
  for(const e of s.entities){
    if(!Number.isSafeInteger(e.id)||!Number.isInteger(e.x)||!Number.isInteger(e.y)||
      e.x<0||e.x>=12||e.y<0||e.y>=12||!["N","E","S","W"].includes(e.direction)||
      !["iron_mine","coal_mine","furnace","assembler","advanced_furnace","conveyor","sell_terminal"].includes(e.kind)||
      !Number.isInteger(e.oreInput)||e.oreInput<0||e.oreInput>4||
      (e.cycle!==null&&(!Number.isInteger(e.cycle)||e.cycle<0))||
      ![null,"iron_ore","iron_ingot","coal","gear","steel"].includes(e.output)||![null,"iron_ore","iron_ingot","coal","gear","steel"].includes(e.belt)
    )throw Error("Invalid entity in save. Data preserved.");
    const key=e.x+","+e.y;if(spots.has(key))throw Error("Overlapping entities in save. Data preserved.");spots.add(key);
  }
  if(s.entities.filter(e=>e.kind==="sell_terminal"&&e.x===10&&e.y===5).length!==1)
    throw Error("Save lacks the permanent sales terminal. Data preserved.");
  for(const e of s.rollingEvents)if(!Number.isSafeInteger(e.tick)||!Number.isSafeInteger(e.revenueCents)||!Number.isSafeInteger(e.costCents))
    throw Error("Corrupt accounting history. Data preserved.");
  const n=structuredClone(s);
  if(n.schemaVersion===1){
    n.schemaVersion=2;
    if(n.mission.activeId==="DONE")n.mission.activeId="M5";
    n.mission.soldCoal=0;n.mission.soldGear=0;n.mission.soldSteel=0;
    n.foundryStorySeen=false;
    n.coalDeposits=COAL_DEPOSITS.map(d=>({...d}));
    n.technologies={coal_extraction:false,mechanical_components:false,advanced_smelting:false};
    n.sales={...emptySales(),iron_ore:n.mission.soldOre,iron_ingot:n.mission.soldIngot};
    // Migration starts a new ledger epoch; pre-v2 demolitions were not recorded.
    n.materialLedger=emptyLedger();
    n.totalRevenueCents=0;n.totalCostCents=0;
    for(const e of n.entities){
      if(e.kind==="furnace"){
        e.inputBuffers={iron_ore:e.oreInput};
        e.reservedInputs=e.cycle!==null?{iron_ore:2}:{};
      }else{
        e.inputBuffers={};
        e.reservedInputs={};
      }
    }
    // The new ledger starts now. Preserve existing material as opening stock,
    // never as newly produced inventory. Historical costs and sales remain historical.
    const opening=stockOnHand(n.entities);
    for(const item of ITEMS)n.materialLedger![item].opening=opening[item];
  }
  if(n.schemaVersion===2||n.schemaVersion===3){
    // Earlier v0.2 development snapshots predate the Foundry interlude fields.
    // Upgrade only absent fields; explicit invalid values are still rejected.
    if(n.foundryStorySeen===undefined){
      n.foundryStorySeen=false;
      if(n.mission.activeId==="DONE")n.mission.activeId="M5";
    }
    if(n.mission.soldCoal===undefined)n.mission.soldCoal=0;
    if(n.mission.soldGear===undefined)n.mission.soldGear=0;
    if(n.mission.soldSteel===undefined)n.mission.soldSteel=0;
    const technologyNames=["coal_extraction","mechanical_components","advanced_smelting"];
    const tech=n.technologies;
    if(!tech||typeof tech!=="object"||Array.isArray(tech)||
       Object.keys(tech).length!==technologyNames.length||
       Object.keys(tech).some(key=>!technologyNames.includes(key))||
       technologyNames.some(key=>typeof tech[key as keyof typeof tech]!=="boolean"))
      throw Error("Invalid v2 technology state. Data preserved.");
    if(!Array.isArray(n.coalDeposits)||n.coalDeposits.length!==COAL_DEPOSITS.length||
       n.coalDeposits.some((d,i)=>!d||typeof d!=="object"||Object.keys(d).length!==2||
         d.x!==COAL_DEPOSITS[i].x||d.y!==COAL_DEPOSITS[i].y))
      throw Error("Invalid v2 coal deposits. Data preserved.");
    if(typeof n.foundryStorySeen!=="boolean"||
       !Number.isSafeInteger(n.mission.soldCoal)||n.mission.soldCoal<0||
       !Number.isSafeInteger(n.mission.soldGear)||n.mission.soldGear<0||
       !Number.isSafeInteger(n.mission.soldSteel)||n.mission.soldSteel<0)
      throw Error("Invalid v2 mission or narrative state. Data preserved.");
    if(!n.sales||typeof n.sales!=="object"||Array.isArray(n.sales)||
       !n.materialLedger||typeof n.materialLedger!=="object"||Array.isArray(n.materialLedger)||
       !Number.isSafeInteger(n.totalRevenueCents)||!Number.isSafeInteger(n.totalCostCents)||
       Object.keys(n.sales).length!==ITEMS.length||
       Object.keys(n.materialLedger).length!==ITEMS.length||
       Object.keys(n.sales).some(item=>!ITEMS.includes(item as Item))||
       Object.keys(n.materialLedger).some(item=>!ITEMS.includes(item as Item)))
      throw Error("Invalid v2 economy ledger. Data preserved.");
    // Pre-review v2 snapshots did not store opening stock. Infer the epoch
    // opening from physical stock and existing audited events; never count
    // historical material as newly produced.
    const stock=stockOnHand(n.entities);
    for(const item of ITEMS){
      if(!Number.isSafeInteger(n.sales[item])||n.sales[item]<0)throw Error("Invalid v2 sales history. Data preserved.");
      const ledger=n.materialLedger[item];
      if(!ledger||typeof ledger!=="object"||Array.isArray(ledger))throw Error("Invalid v2 material audit. Data preserved.");
      const fields=["opening","produced","consumed","sold","demolished"] as const;
      if(ledger.opening===undefined&&Object.keys(ledger).length===4){
        const opening=stock[item]-ledger.produced+ledger.consumed+ledger.sold+ledger.demolished;
        ledger.opening=opening;
      }
      if(Object.keys(ledger).length!==fields.length||Object.keys(ledger).some(key=>!fields.includes(key as typeof fields[number])))
        throw Error("Invalid v2 material audit keys. Data preserved.");
      for(const field of fields){
        if(!Number.isSafeInteger(ledger[field])||ledger[field]<0)
          throw Error("Invalid v2 material audit. Data preserved.");
      }
    }
    for(const e of n.entities){
      const recipe=recipeFor(e.kind);
      for(const inventory of [e.inputBuffers,e.reservedInputs]){
        if(!inventory||typeof inventory!=="object"||Array.isArray(inventory))
          throw Error("Invalid v2 inventory. Data preserved.");
        for(const [item,quantity] of Object.entries(inventory)){
          if(!ITEMS.includes(item as Item)||!recipe?.input[item as Item]||
             !Number.isSafeInteger(quantity)||quantity<0||quantity>4)
            throw Error("Invalid v2 inventory type or quantity. Data preserved.");
        }
      }
      if(e.kind==="furnace"&&e.oreInput!==(e.inputBuffers?.iron_ore??0))
        throw Error("Inconsistent furnace legacy buffer and typed inventory. Data preserved.");
    }
  }
  // Validate the complete v3 window before any migration or saved state is accepted.
  if(n.schemaVersion===3){
    if(n.missionRuleVersion!==2&&n.missionRuleVersion!==3)
      throw Error("Invalid v3 mission rule version. Data preserved.");
    const metrics=n.missionMetrics;
    if(metrics!==null){
      if(!metrics||typeof metrics!=="object"||Array.isArray(metrics)||
         !Number.isSafeInteger(metrics.activatedAtTick)||metrics.activatedAtTick<0||metrics.activatedAtTick>n.tick||
         !Number.isSafeInteger(metrics.streakTicks)||metrics.streakTicks<0||
         !Array.isArray(metrics.salesTicks)||metrics.salesTicks.length>60)
        throw Error("Invalid v3 mission metrics. Data preserved.");
      for(let i=0;i<metrics.salesTicks.length;i++){
        const event=metrics.salesTicks[i];
        if(!event||typeof event!=="object"||!Number.isSafeInteger(event.tick)||
           event.tick<=metrics.activatedAtTick||event.tick>n.tick||
           (i>0&&event.tick!==metrics.salesTicks[i-1].tick+1)||
           !event.sales||typeof event.sales!=="object"||Array.isArray(event.sales)||
           Object.keys(event.sales).length!==ITEMS.length||
           Object.keys(event.sales).some(key=>!ITEMS.includes(key as Item))||
           ITEMS.some(item=>!Number.isSafeInteger(event.sales[item])||event.sales[item]<0))
          throw Error("Invalid v3 terminal-sale history. Data preserved.");
      }
      if(metrics.salesTicks.length &&
         metrics.salesTicks[metrics.salesTicks.length-1].tick!==n.tick)
        throw Error("Stale v3 terminal-sale history. Data preserved.");
    }
    if(n.missionRuleVersion===2 && metrics!==null)
      throw Error("Legacy missions cannot have v3 metric state. Data preserved.");
  }else{
    // v1 already upgraded to the v2 shape; keep active v2 M6/M7 cumulative rules.
    n.missionRuleVersion=["M6","M7"].includes(n.mission.activeId)?2:3;
    n.missionMetrics=null;
    n.schemaVersion=3;
  }
  return n;
}
// All writes and deletes share one queue. Capture snapshots before enqueueing.
let pending:Promise<void>=Promise.resolve();
function enqueue(operation:()=>Promise<void>):Promise<void>{
  const task=pending.catch(()=>undefined).then(operation);
  pending=task.catch(()=>undefined);
  return task;
}
async function writeSnapshot(state:GameState):Promise<void>{
  const db=await openDb();
  await transaction<void>(db,"readwrite",(store,resolve,reject)=>{
    const req=store.put(state,"slot1");
    req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });
}
async function deleteSnapshot():Promise<void>{
  const db=await openDb();
  await transaction<void>(db,"readwrite",(store,resolve,reject)=>{
    const req=store.delete("slot1");req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });
}
export async function loadGame():Promise<GameState|null>{
  await pending;
  const db=await openDb();
  const value=await transaction<unknown>(db,"readonly",(store,resolve,reject)=>{
    const req=store.get("slot1");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return value===undefined?null:validateSave(value);
}
export function saveGame(state:GameState):Promise<void>{
  const snapshot=structuredClone(state);
  return enqueue(()=>writeSnapshot(snapshot));
}
export function eraseGame():Promise<void>{
  return enqueue(deleteSnapshot);
}
