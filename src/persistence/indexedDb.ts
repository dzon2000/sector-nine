import {COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,DIAGNOSTIC_HISTORY_TICKS,ITEMS,SPLITTER_MODES,SAVE_SCHEMA_VERSION,MISSION_RULE_VERSION,recipeFor,type GameState,type Item} from "../domain/model";
import {assertChapterIVSave} from "./chapterFour";
import {assertChapterIIISave} from "./chapterThree";
// Keep the existing slot address so incompatible saves can be detected and preserved.
const DATABASE="sector-nine-v0.1";
const STORE="snapshots";
const SLOT="slot1";
const EPOCH="slot1-restart-epoch";
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
    let result:T;
    let failure:unknown;
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure??tx.error??Error("Save transaction aborted."));
    action(tx.objectStore(STORE),value=>{result=value;},error=>{
      failure=error;
      tx.abort();
    });
  }).finally(()=>db.close());
}
function assertCurrentSave(value:unknown):asserts value is GameState{
  if(!value||typeof value!=="object")throw Error("Save is missing or corrupt.");
  const s=value as GameState;
  if(!Number.isSafeInteger(s.schemaVersion)||s.schemaVersion<1)throw Error("Corrupt save schema.");
  if(s.schemaVersion!==SAVE_SCHEMA_VERSION)throw Error(`Unsupported save schema ${s.schemaVersion}. This build requires schema ${SAVE_SCHEMA_VERSION}.`);
  if(s.missionRuleVersion!==MISSION_RULE_VERSION)throw Error("Corrupt mission rule metadata.");
  if(s.width!==12||s.height!==12||!Number.isSafeInteger(s.tick)||s.tick<0||
    !Number.isSafeInteger(s.balanceCents)||!Array.isArray(s.entities)||!Array.isArray(s.rollingEvents)||
    (!s.arbiters||typeof s.arbiters!=="object"||Array.isArray(s.arbiters)||Object.entries(s.arbiters).some(([key,value])=>!Number.isSafeInteger(Number(key))||Number(key)<1||!Number.isSafeInteger(value)||value<0))||!s.mission||!Number.isSafeInteger(s.nextId)||
    !Number.isSafeInteger(s.totalOreProduced)||!Number.isSafeInteger(s.totalIngotProduced)||
    !Number.isSafeInteger(s.mission.soldOre)||!Number.isSafeInteger(s.mission.soldIngot)||
    !Number.isSafeInteger(s.mission.profitStreakTicks)||!["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","DONE"].includes(s.mission.activeId)||
    typeof s.paused!=="boolean"||typeof s.introSeen!=="boolean"||typeof s.introOpen!=="boolean"||
    typeof s.tutorialEnabled!=="boolean"||s.rollingEvents.length>60)throw Error("Corrupt save. Validation failed. Your data has not been overwritten.");
  const spots=new Set<string>();
  const ids=new Set<number>();
  for(const e of s.entities){
    if(!e||typeof e!=="object"||!Number.isSafeInteger(e.id)||e.id<1||e.id>=s.nextId||ids.has(e.id)||
      !Number.isInteger(e.x)||!Number.isInteger(e.y)||
      e.x<0||e.x>=12||e.y<0||e.y>=12||!["N","E","S","W"].includes(e.direction)||
      !["iron_mine","coal_mine","furnace","assembler","advanced_furnace","conveyor","sell_terminal","copper_mine","silicon_extractor","circuit_fabricator","coal_generator","splitter"].includes(e.kind)||
      !Number.isInteger(e.oreInput)||e.oreInput<0||e.oreInput>4||
      (e.cycle!==null&&(!Number.isInteger(e.cycle)||e.cycle<0))||
      !(e.output===null||ITEMS.includes(e.output))||!(e.belt===null||ITEMS.includes(e.belt))
    )throw Error("Invalid entity in save. Data preserved.");
    if(e.kind==="splitter"){
      if(e.splitterMode!==undefined&&(!s.chapterIV||!SPLITTER_MODES.includes(e.splitterMode)))
        throw Error("Invalid splitter mode. Save preserved.");
      if(e.splitterNext!==0&&e.splitterNext!==1)
        throw Error("Invalid splitter arbitration cursor. Save preserved.");
      if(e.output!==null||e.oreInput!==0||e.cycle!==null||
        Object.keys(e.inputBuffers??{}).length||Object.keys(e.reservedInputs??{}).length)
        throw Error("Invalid splitter material state. Save preserved.");
    }else if(e.splitterNext!==undefined||e.splitterMode!==undefined)
      throw Error("Invalid non-splitter routing state. Save preserved.");
    ids.add(e.id);
    const key=e.x+","+e.y;if(spots.has(key))throw Error("Overlapping entities in save. Data preserved.");spots.add(key);
  }
  if(s.entities.filter(e=>e.kind==="sell_terminal"&&e.x===10&&e.y===5).length!==1)
    throw Error("Save lacks the permanent sales terminal. Data preserved.");
  for(const e of s.rollingEvents)if(!e||!Number.isSafeInteger(e.tick)||!Number.isSafeInteger(e.revenueCents)||!Number.isSafeInteger(e.costCents))
    throw Error("Corrupt accounting history. Data preserved.");
  const n=s;
  {
    const technologyNames=["coal_extraction","mechanical_components","advanced_smelting",
      "resource_surveying","circuit_fabrication","industrial_power"] as const;
    const tech=n.technologies;
    if(!tech||typeof tech!=="object"||Array.isArray(tech)||
       Object.keys(tech).length!==technologyNames.length||
       technologyNames.some(key=>typeof tech[key]!=="boolean"))
      throw Error("Invalid technology state. Data preserved.");
    if(!Array.isArray(n.coalDeposits)||n.coalDeposits.length!==COAL_DEPOSITS.length||
       n.coalDeposits.some((d,i)=>!d||typeof d!=="object"||Object.keys(d).length!==2||
         d.x!==COAL_DEPOSITS[i].x||d.y!==COAL_DEPOSITS[i].y))
      throw Error("Invalid coal deposits. Data preserved.");
    if(typeof n.foundryStorySeen!=="boolean"||
       !Number.isSafeInteger(n.mission.soldCoal)||n.mission.soldCoal<0||
       !Number.isSafeInteger(n.mission.soldGear)||n.mission.soldGear<0||
       !Number.isSafeInteger(n.mission.soldSteel)||n.mission.soldSteel<0)
      throw Error("Invalid mission or narrative state. Data preserved.");
    if(!n.sales||typeof n.sales!=="object"||Array.isArray(n.sales)||
       !n.materialLedger||typeof n.materialLedger!=="object"||Array.isArray(n.materialLedger)||
       !Number.isSafeInteger(n.totalRevenueCents)||!Number.isSafeInteger(n.totalCostCents)||
       Object.keys(n.sales).length!==ITEMS.length||
       Object.keys(n.materialLedger).length!==ITEMS.length||
       Object.keys(n.sales).some(item=>!ITEMS.includes(item as Item))||
       Object.keys(n.materialLedger).some(item=>!ITEMS.includes(item as Item)))
      throw Error("Invalid economy ledger. Data preserved.");
    for(const item of ITEMS){
      if(!Number.isSafeInteger(n.sales[item])||n.sales[item]<0)throw Error("Invalid sales history. Data preserved.");
      const ledger=n.materialLedger[item];
      if(!ledger||typeof ledger!=="object"||Array.isArray(ledger))throw Error("Invalid material audit. Data preserved.");
      const fields=["opening","produced","consumed","sold","demolished","burned"] as const;
      if(Object.keys(ledger).length!==fields.length||Object.keys(ledger).some(key=>!fields.includes(key as typeof fields[number])))
        throw Error("Invalid material audit keys. Data preserved.");
      for(const field of fields){
        if(!Number.isSafeInteger(ledger[field])||ledger[field]<0)
          throw Error("Invalid material audit. Data preserved.");
      }
    }
    for(const e of n.entities){
      const recipe=recipeFor(e.kind);
      for(const inventory of [e.inputBuffers,e.reservedInputs]){
        if(!inventory||typeof inventory!=="object"||Array.isArray(inventory))
          throw Error("Invalid inventory. Data preserved.");
        for(const [item,quantity] of Object.entries(inventory)){
          if(!ITEMS.includes(item as Item)||!(recipe?.input[item as Item]||(e.kind==="coal_generator"&&inventory===e.inputBuffers&&item==="coal"))||
             !Number.isSafeInteger(quantity)||quantity<0||quantity>4)
            throw Error("Invalid inventory type or quantity. Data preserved.");
        }
      }
      if(recipe&&e.cycle!==null&&e.cycle>recipe.durationTicks)
        throw Error("Invalid processing cycle. Save preserved.");
      const inputs=e.cycle!==null?Object.entries(recipe?.input??{}):[];
      if(Object.keys(e.reservedInputs!).length!==inputs.length||
         inputs.some(([item,quantity])=>e.reservedInputs![item as Item]!==quantity))
        throw Error("Invalid processing reservation. Save preserved.");
      if(["iron_mine","coal_mine","copper_mine","silicon_extractor"].includes(e.kind)&&e.cycle===0)
        throw Error("Invalid extraction cycle. Save preserved.");
      if(e.kind==="furnace"&&e.oreInput!==(e.inputBuffers?.iron_ore??0))
        throw Error("Inconsistent furnace ore buffer and typed inventory. Data preserved.");
    }
  }
  {
    const metrics=n.missionMetrics;
    const sustained=n.mission.activeId==="M6"||n.mission.activeId==="M7";
    if(sustained ? !metrics : metrics!==null)
      throw Error("Invalid active mission metrics. Save preserved.");
    if(metrics!==null){
      if(!metrics||typeof metrics!=="object"||Array.isArray(metrics)||
         !Number.isSafeInteger(metrics.activatedAtTick)||metrics.activatedAtTick<0||metrics.activatedAtTick>n.tick||
         !Number.isSafeInteger(metrics.streakTicks)||metrics.streakTicks<0||
         (metrics.lastEvaluatedTick!==undefined&&(!Number.isSafeInteger(metrics.lastEvaluatedTick)||
           metrics.lastEvaluatedTick<=metrics.activatedAtTick||metrics.lastEvaluatedTick>n.tick))||
         !Array.isArray(metrics.salesTicks)||metrics.salesTicks.length>60)
        throw Error("Invalid mission metrics. Data preserved.");
      for(let i=0;i<metrics.salesTicks.length;i++){
        const event=metrics.salesTicks[i];
        if(!event||typeof event!=="object"||!Number.isSafeInteger(event.tick)||
           event.tick<=metrics.activatedAtTick||event.tick>n.tick||
           (i>0&&event.tick!==metrics.salesTicks[i-1].tick+1)||
           !event.sales||typeof event.sales!=="object"||Array.isArray(event.sales)||
           Object.keys(event.sales).length!==ITEMS.length||
           Object.keys(event.sales).some(key=>!ITEMS.includes(key as Item))||
           ITEMS.some(item=>!Number.isSafeInteger(event.sales[item])||event.sales[item]<0))
          throw Error("Invalid terminal-sale history. Data preserved.");
      }
      if(metrics.salesTicks.length &&
         metrics.salesTicks[metrics.salesTicks.length-1].tick!==n.tick)
        throw Error("Stale terminal-sale history. Data preserved.");
    }
  }
  {
    for(const [deposits,reference,label] of [
      [n.copperDeposits,COPPER_DEPOSITS,"copper"],
      [n.siliconDeposits,SILICON_DEPOSITS,"silicon"]
    ] as const){
      if(!Array.isArray(deposits)||deposits.length!==reference.length||
        deposits.some((d,i)=>!d||typeof d!=="object"||
          Object.keys(d).length!==2||d.x!==reference[i].x||d.y!==reference[i].y))
        throw Error("Invalid "+label+" deposit metadata. Save preserved.");
    }
  }
  const chapter=n.chapterII;
  const mission=n.mission.activeId;
  const chapterMission=["M8","M9","M10"].includes(mission);
  if((chapterMission||mission==="DONE")&&!chapter)
    throw Error("Missing chapter progress. Save preserved.");
  if(chapter!==undefined){
    if(!chapter||typeof chapter!=="object"||Array.isArray(chapter)||
       Object.keys(chapter).length!==5||chapter.foundryCompleted!==true||
       typeof chapter.started!=="boolean"||typeof chapter.completed!=="boolean"||
       typeof chapter.storySeen!=="boolean"||
       (chapter.started ? !(chapterMission||mission==="DONE")||chapter.completed!==(mission==="DONE")
         : mission!=="DONE"||chapter.completed||chapter.storySeen)||
       (!chapterMission&&chapter.metrics!==null))
      throw Error("Invalid chapter progress. Save preserved.");
  }
  if(chapter?.started){
    if(["M9","M10","DONE"].includes(n.mission.activeId) &&
       n.technologies?.resource_surveying!==true)
      throw Error("Invalid Chapter II research history. Save preserved.");
    if(["M10","DONE"].includes(n.mission.activeId) &&
       (n.technologies?.circuit_fabrication!==true||
        n.technologies?.industrial_power!==true))
      throw Error("Invalid Chapter II research history. Save preserved.");
    const metrics=chapter.metrics;
    if(n.mission.activeId==="DONE"){
      if(metrics!==null)throw Error("Completed mission cannot retain active metrics. Save preserved.");
    }else{
      if(!metrics || typeof metrics!=="object" || Array.isArray(metrics) ||
        Object.keys(metrics).some(key=>!["activatedAtTick","salesTicks","streakTicks","totals","lastEvaluatedTick"].includes(key)) ||
        !Number.isSafeInteger(metrics.activatedAtTick) || metrics.activatedAtTick<0 || metrics.activatedAtTick>n.tick ||
        !Number.isSafeInteger(metrics.streakTicks) || metrics.streakTicks<0 || metrics.streakTicks>60 ||
        (metrics.lastEvaluatedTick!==undefined && (!Number.isSafeInteger(metrics.lastEvaluatedTick) ||
          metrics.lastEvaluatedTick<=metrics.activatedAtTick || metrics.lastEvaluatedTick>n.tick)) ||
        !Array.isArray(metrics.salesTicks) || metrics.salesTicks.length>60 ||
        !metrics.totals || typeof metrics.totals!=="object" || Array.isArray(metrics.totals) ||
        Object.keys(metrics.totals).length!==ITEMS.length ||
        ITEMS.some(item=>!Number.isSafeInteger(metrics.totals![item]) || metrics.totals![item]<0))
        throw Error("Invalid mission metrics. Save preserved.");
      for(let i=0;i<metrics.salesTicks.length;i++){
        const e=metrics.salesTicks[i];
        if(!e || typeof e!=="object" || Array.isArray(e) ||
          Object.keys(e).length!==4 || !Number.isSafeInteger(e.tick) ||
          e.tick<=metrics.activatedAtTick || e.tick>n.tick ||
          (i>0 && e.tick!==metrics.salesTicks[i-1].tick+1) ||
          !e.sales || typeof e.sales!=="object" || Array.isArray(e.sales) ||
          Object.keys(e.sales).length!==ITEMS.length ||
          ITEMS.some(item=>!Number.isSafeInteger(e.sales[item])||e.sales[item]<0) ||
          !Number.isSafeInteger(e.producedCircuits) || e.producedCircuits<0 ||
          typeof e.demandCovered!=="boolean")
          throw Error("Invalid mission sale/production history. Save preserved.");
      }
      if(metrics.salesTicks.length && metrics.salesTicks.at(-1)!.tick!==n.tick)
        throw Error("Stale mission window. Save preserved.");
    }
  }
  const history=n.diagnostics;
  if(!history||typeof history!=="object"||Array.isArray(history)||
     Object.keys(history).length!==1||!Array.isArray(history.samples)||history.samples.length>DIAGNOSTIC_HISTORY_TICKS)
    throw Error("Invalid diagnostic history. Data preserved.");
  const diagnosticEntities=new Set(n.entities.map(e=>String(e.id)));
  for(let i=0;i<history.samples.length;i++){
    const sample=history.samples[i];
    const chapterIVProduction=sample?.chapterIVProduction;
    if(!sample||typeof sample!=="object"||Array.isArray(sample)||
       Object.keys(sample).length!==(chapterIVProduction===undefined?3:4)||!Number.isSafeInteger(sample.tick)||
       sample.tick<1||sample.tick>n.tick||
       (i>0&&sample.tick!==history.samples[i-1].tick+1)||
       !sample.entities||typeof sample.entities!=="object"||Array.isArray(sample.entities)||
       !sample.terminalSales||typeof sample.terminalSales!=="object"||
       Array.isArray(sample.terminalSales)||Object.keys(sample.terminalSales).length!==ITEMS.length||
       Object.keys(sample.terminalSales).some(key=>!ITEMS.includes(key as Item))||
       ITEMS.some(item=>!Number.isSafeInteger(sample.terminalSales[item])||sample.terminalSales[item]<0))
      throw Error("Invalid diagnostic sample. Data preserved.");
    if(chapterIVProduction!==undefined&&(!n.chapterIV||!chapterIVProduction||
       typeof chapterIVProduction!=="object"||Array.isArray(chapterIVProduction)||
       Object.keys(chapterIVProduction).length!==2||
       !Number.isSafeInteger(chapterIVProduction.circuit)||chapterIVProduction.circuit<0||
       !Number.isSafeInteger(chapterIVProduction.gear)||chapterIVProduction.gear<0||
       chapterIVProduction.circuit+chapterIVProduction.gear>n.width*n.height-1))
      throw Error("Invalid Chapter IV diagnostic production. Data preserved.");
    for(const [id,entry] of Object.entries(sample.entities)){
      if(!diagnosticEntities.has(id)||!entry||typeof entry!=="object"||Array.isArray(entry)||
         Object.keys(entry).length!==4||
         !["working","input_starved","output_blocked","idle"].includes(entry.status)||
         !Number.isSafeInteger(entry.completedUnits)||entry.completedUnits<0||
         !Number.isSafeInteger(entry.conveyorMoves)||entry.conveyorMoves<0||entry.conveyorMoves>1||
         !Number.isSafeInteger(entry.conveyorStalledTicks)||entry.conveyorStalledTicks<0||
         entry.conveyorStalledTicks>1||entry.conveyorMoves+entry.conveyorStalledTicks>1)
        throw Error("Invalid entity diagnostic sample. Data preserved.");
    }
  }
  if(history.samples.length&&history.samples.at(-1)!.tick!==n.tick)
    throw Error("Stale diagnostic history. Data preserved.");
  const safe=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
  for(const entity of n.entities){
    if(entity.kind==="coal_generator"){
      if(!safe(entity.fuelTicksRemaining)||entity.fuelTicksRemaining>12||
        !entity.inputBuffers||Object.keys(entity.inputBuffers).some(item=>item!=="coal"))
        throw Error("Invalid generator fuel state. Save preserved.");
    }else if(entity.fuelTicksRemaining!==undefined){
      throw Error("Invalid non-generator fuel state. Save preserved.");
    }
  }
  if(n.entities.some(e=>e.kind==="coal_generator"||e.kind==="circuit_fabricator")&&!n.power)
    throw Error("Missing power allocation state. Save preserved.");
  if(n.power!==undefined){
    const p=n.power;
    if(!p||typeof p!=="object"||
       !safe(p.tick)||p.tick!==n.tick||
       !safe(p.supply)||!safe(p.demand)||!safe(p.served)||
       !safe(p.unpoweredProcessingTicks)||!safe(p.coalBurned)||
       !safe(p.lastServedFabricatorId)||p.lastServedFabricatorId>=n.nextId||
       typeof p.demandCovered!=="boolean"||
       p.served>p.demand||p.served>p.supply||
       p.unpoweredProcessingTicks!==p.demand-p.served||
       p.demandCovered!==(p.demand>0&&p.demand===p.served)||
       !Array.isArray(p.history)||p.history.length>60)
      throw Error("Invalid power allocation state. Save preserved.");
    for(let i=0;i<p.history.length;i++){
      const t=p.history[i];
      if(!t||!safe(t.tick)||t.tick<1||t.tick>n.tick||
         (i>0&&t.tick!==p.history[i-1].tick+1)||
         !safe(t.supply)||!safe(t.demand)||!safe(t.served)||
         !safe(t.unpoweredProcessingTicks)||!safe(t.coalBurned)||
         typeof t.demandCovered!=="boolean"||
         t.served>t.demand||t.served>t.supply||
         t.unpoweredProcessingTicks!==t.demand-t.served||
         t.demandCovered!==(t.demand>0&&t.demand===t.served))
        throw Error("Invalid power tick history. Save preserved.");
    }
    if(p.history.length && p.history[p.history.length-1].tick!==n.tick)
      throw Error("Stale power history. Save preserved.");
  }
  assertChapterIIISave(n);
  assertChapterIVSave(n);
}
export function validateSave(value:unknown):GameState{
  assertCurrentSave(value);
  return structuredClone(value);
}
// All writes and deletes share one queue. Capture snapshots before enqueueing.
let pending:Promise<void>=Promise.resolve();
function enqueue(operation:()=>Promise<void>):Promise<void>{
  const task=pending.catch(()=>undefined).then(operation);
  pending=task.catch(()=>undefined);
  return task;
}
let generation=0;
let restartPending=false;
let loadedEpoch=0;

function readEpoch(value:unknown):number{
  if(value===undefined)return 0;
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)
    throw Error("Corrupt save restart metadata.");
  return value;
}

async function writeSnapshot(state:GameState,expectedEpoch:number|null):Promise<number>{
  const db=await openDb();
  return transaction<number>(db,"readwrite",(store,resolve,reject)=>{
    const epochRequest=store.get(EPOCH);
    epochRequest.onsuccess=()=>{
      try{
        if(expectedEpoch===null){
          // Replace both records atomically. A fresh epoch invalidates writers in other tabs.
          const stored=epochRequest.result;
          const epoch=(typeof stored==="number"&&Number.isSafeInteger(stored)&&stored>=0&&stored<Number.MAX_SAFE_INTEGER?stored:0)+1;
          store.put(epoch,EPOCH);
          const write=store.put(state,SLOT);
          write.onsuccess=()=>resolve(epoch);
          return;
        }
        const epoch=readEpoch(epochRequest.result);
        if(epoch!==expectedEpoch)throw Error("The factory was restarted in another tab. Reload this page to continue.");
        // Read and write in one transaction so autosave cannot replace a rejected slot.
        const read=store.get(SLOT);
        read.onsuccess=()=>{
          try{
            if(read.result!==undefined)assertCurrentSave(read.result);
            const write=store.put(state,SLOT);
            write.onsuccess=()=>resolve(epoch);
          }catch(error){reject(error);}
        };
      }catch(error){reject(error);}
    };
  });
}
export async function loadGame():Promise<GameState|null>{
  await pending;
  const db=await openDb();
  const {snapshot,epoch}=await transaction<{snapshot:unknown;epoch:unknown}>(db,"readonly",(store,resolve)=>{
    const snapshotRequest=store.get(SLOT);
    const epochRequest=store.get(EPOCH);
    epochRequest.onsuccess=()=>resolve({snapshot:snapshotRequest.result,epoch:epochRequest.result});
  });
  const state=snapshot===undefined?null:validateSave(snapshot);
  loadedEpoch=readEpoch(epoch);
  return state;
}
export function saveGame(state:GameState):Promise<void>{
  if(restartPending)return Promise.resolve();
  const snapshot=structuredClone(state);
  const requestedGeneration=generation;
  const expectedEpoch=loadedEpoch;
  return enqueue(async()=>{
    if(requestedGeneration===generation)await writeSnapshot(snapshot,expectedEpoch);
  });
}
export function restartGame(state:GameState):Promise<void>{
  const snapshot=validateSave(state);
  generation++;
  restartPending=true;
  const requestedGeneration=generation;
  return enqueue(async()=>{
    loadedEpoch=await writeSnapshot(snapshot,null);
  }).finally(()=>{
    if(requestedGeneration===generation)restartPending=false;
  });
}
