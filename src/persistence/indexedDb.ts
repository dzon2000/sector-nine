import {createGame,type GameState,type Entity} from "../domain/model";
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
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    tx.onerror=()=>reject(tx.error);
    action(tx.objectStore(STORE),resolve,reject);
  }).finally(()=>db.close());
}
export function validateSave(value:unknown):GameState{
  if(!value||typeof value!=="object")throw Error("Save is missing or corrupt.");
  const s=value as GameState;
  if(s.schemaVersion!==1)throw Error("Unsupported save schema. Export or reset your save manually.");
  if(s.width!==12||s.height!==12||!Number.isSafeInteger(s.tick)||s.tick<0||
    !Number.isSafeInteger(s.balanceCents)||!Array.isArray(s.entities)||!Array.isArray(s.rollingEvents)||
    typeof s.arbiters!=="object"||!s.mission||!Number.isSafeInteger(s.nextId)||
    !Number.isSafeInteger(s.totalOreProduced)||!Number.isSafeInteger(s.totalIngotProduced)||
    !Number.isSafeInteger(s.mission.soldOre)||!Number.isSafeInteger(s.mission.soldIngot)||
    !Number.isSafeInteger(s.mission.profitStreakTicks)||!["M1","M2","M3","M4","DONE"].includes(s.mission.activeId)||
    typeof s.paused!=="boolean"||typeof s.introSeen!=="boolean"||typeof s.introOpen!=="boolean"||
    typeof s.tutorialEnabled!=="boolean"||s.rollingEvents.length>60)throw Error("Save validation failed. Your data has not been overwritten.");
  const spots=new Set<string>();
  for(const e of s.entities){
    if(!Number.isSafeInteger(e.id)||!Number.isInteger(e.x)||!Number.isInteger(e.y)||
      e.x<0||e.x>=12||e.y<0||e.y>=12||!["N","E","S","W"].includes(e.direction)||
      !["iron_mine","furnace","conveyor","sell_terminal"].includes(e.kind)||
      !Number.isInteger(e.oreInput)||e.oreInput<0||e.oreInput>4||
      (e.cycle!==null&&(!Number.isInteger(e.cycle)||e.cycle<0))||
      ![null,"iron_ore","iron_ingot"].includes(e.output)||![null,"iron_ore","iron_ingot"].includes(e.belt)
    )throw Error("Invalid entity in save. Data preserved.");
    const key=e.x+","+e.y;if(spots.has(key))throw Error("Overlapping entities in save. Data preserved.");spots.add(key);
  }
  if(s.entities.filter(e=>e.kind==="sell_terminal"&&e.x===10&&e.y===5).length!==1)
    throw Error("Save lacks the permanent sales terminal. Data preserved.");
  for(const e of s.rollingEvents)if(!Number.isSafeInteger(e.tick)||!Number.isSafeInteger(e.revenueCents)||!Number.isSafeInteger(e.costCents))
    throw Error("Corrupt accounting history. Data preserved.");
  return s;
}
export async function loadGame():Promise<GameState|null>{
  const db=await openDb();
  const value=await transaction<unknown>(db,"readonly",(store,resolve,reject)=>{
    const req=store.get("slot1");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return value===undefined?null:validateSave(value);
}
export async function saveGame(state:GameState):Promise<void>{
  const db=await openDb();
  await transaction<void>(db,"readwrite",(store,resolve,reject)=>{
    const req=store.put(structuredClone(state),"slot1");
    req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });
}
export async function eraseGame():Promise<void>{
  const db=await openDb();
  await transaction<void>(db,"readwrite",(store,resolve,reject)=>{
    const req=store.delete("slot1");req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });
}
