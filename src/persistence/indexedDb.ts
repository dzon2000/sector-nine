import {COAL_DEPOSITS,ITEMS,emptyLedger,emptySales,type GameState} from "../domain/model";
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
  if(s.schemaVersion!==1&&s.schemaVersion!==2)throw Error("Unsupported save schema. Export or reset your save manually.");
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
  }
  if(n.schemaVersion===2){
    if(!n.technologies||!n.coalDeposits)throw Error("Invalid v2 progression state. Data preserved.");
    if(typeof n.foundryStorySeen!=="boolean"||
       !Number.isSafeInteger(n.mission.soldCoal)||n.mission.soldCoal!<0||
       !Number.isSafeInteger(n.mission.soldGear)||n.mission.soldGear!<0||
       !Number.isSafeInteger(n.mission.soldSteel)||n.mission.soldSteel!<0)
      throw Error("Invalid v2 mission or narrative state. Data preserved.");
    if(!n.sales||!n.materialLedger||!Number.isSafeInteger(n.totalRevenueCents)||!Number.isSafeInteger(n.totalCostCents))throw Error("Invalid v2 economy ledger. Data preserved.");
    for(const item of ITEMS){
      if(!Number.isSafeInteger(n.sales[item])||n.sales[item]<0)throw Error("Invalid v2 sales history. Data preserved.");
      for(const field of ["produced","consumed","sold","demolished"] as const){
        if(!Number.isSafeInteger(n.materialLedger[item]?.[field])||n.materialLedger[item][field]<0)throw Error("Invalid v2 material audit. Data preserved.");
      }
    }
    for(const e of n.entities){
      if(!e.inputBuffers||!e.reservedInputs)throw Error("Invalid v2 inventory. Data preserved.");
      for(const inventory of [e.inputBuffers,e.reservedInputs]){
        if(Object.values(inventory).some(q=>!Number.isSafeInteger(q)||q<0||q>4))throw Error("Invalid v2 inventory quantity. Data preserved.");
      }
    }
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
