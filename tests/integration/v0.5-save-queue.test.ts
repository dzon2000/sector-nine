import {afterEach,describe,expect,it,vi} from "vitest";
import {createGame} from "../../src/domain/model";
import {loadGame,restartGame,saveGame} from "../../src/persistence/indexedDb";

// Single-slot IndexedDB double. Requests complete before the transaction commits.
function slot(initial:unknown){
  const stored=new Map<string,unknown>([["slot1",initial]]);
  let writes=0;
  let beforeCommit:Promise<void>|undefined;
  let putStarted:(()=>void)|undefined;
  const db={close(){},transaction(){
    const next=new Map<string,unknown>();
    let aborted=false;
    let wrote=false;
    const transaction={
      oncomplete:()=>{},onabort:()=>{},error:null,
      abort(){aborted=true;transaction.onabort();},
      objectStore(){return {
        get(key:string){return request(stored.get(key));},
        put(snapshot:unknown,key:string){
          next.set(key,structuredClone(snapshot));wrote=true;putStarted?.();return request(undefined);
        }
      };}
    };
    function request(result:unknown){
      const resultRequest={result,onsuccess:()=>{}};
      queueMicrotask(()=>{if(!aborted)resultRequest.onsuccess();});
      return resultRequest;
    }
    setTimeout(async()=>{
      if(wrote)await beforeCommit;
      if(aborted)return;
      if(wrote){
        for(const [key,value] of next)stored.set(key,value);
        writes++;
      }
      transaction.oncomplete();
    },0);
    return transaction;
  }};
  vi.stubGlobal("indexedDB",{open(){
    const request={result:db,onsuccess:()=>{}};
    queueMicrotask(()=>request.onsuccess());
    return request;
  }});
  return {
    get value(){return stored.get("slot1");},
    get writes(){return writes;},
    holdWrite(){
      let release!:()=>void;
      beforeCommit=new Promise<void>(resolve=>{release=resolve;});
      const started=new Promise<void>(resolve=>{putStarted=resolve;});
      return {release,started};
    }
  };
}

afterEach(()=>vi.unstubAllGlobals());

describe("v0.5 single-slot write boundaries",()=>{
  it("rejects autosave over a rejected slot without changing its contents",async()=>{
    const raw={schemaVersion:99,marker:"keep original data"};
    const storage=slot(raw);
    await expect(loadGame()).rejects.toThrow(/unsupported/i);
    await expect(saveGame(createGame())).rejects.toThrow(/unsupported/i);
    expect(storage.value).toEqual(raw);
    expect(storage.writes).toBe(0);
  });

  it("waits for an in-flight write, drops queued stale writes, and commits the restart",async()=>{
    const storage=slot(createGame());
    const {release,started}=storage.holdWrite();
    const stale={...createGame(),balanceCents:123};
    const first=saveGame(stale);
    await started;
    const queued=saveGame(stale);
    const restarted=restartGame(createGame());
    const duringRestart=saveGame(stale);
    expect(storage.writes).toBe(0);
    release();
    await Promise.all([first,queued,restarted,duringRestart]);
    expect(storage.writes).toBe(2);
    expect(await loadGame()).toEqual(createGame());
    await saveGame({...createGame(),balanceCents:29000});
    expect(await loadGame()).toMatchObject({balanceCents:29000});
  });
  it("blocks an older tab from saving after another tab restarts the campaign",async()=>{
    const original={...createGame(),balanceCents:123};
    const storage=slot(original);
    vi.resetModules();
    const olderTab=await import("../../src/persistence/indexedDb");
    await expect(olderTab.loadGame()).resolves.toEqual(original);
    vi.resetModules();
    const restartingTab=await import("../../src/persistence/indexedDb");
    await expect(restartingTab.loadGame()).resolves.toEqual(original);

    await restartingTab.restartGame(createGame());
    await expect(olderTab.saveGame(original)).rejects.toThrow(/another tab/i);
    expect(storage.value).toEqual(createGame());
    await expect(olderTab.loadGame()).resolves.toEqual(createGame());
    await olderTab.saveGame({...createGame(),balanceCents:29000});
    expect(storage.value).toMatchObject({balanceCents:29000});
  });
});

describe("v0.7 isolated chapter playtest writes",()=>{
  it("keeps queued writes in their own slot and rejects a stale playtest tab after replacement",async()=>{
    const storage=slot(createGame());
    const {createSaveSlot,validateSave}=await import("../../src/persistence/indexedDb");
    const earlier=createSaveSlot("chapter-playtest",validateSave);
    const latest=createSaveSlot("chapter-playtest",validateSave);
    const original={...createGame(),balanceCents:123};
    const replacement={...createGame(),balanceCents:456};

    await earlier.restart(original);
    expect(await earlier.load()).toMatchObject({snapshot:original,epoch:1});
    const {release,started}=storage.holdWrite();
    const stale=earlier.save({...original,balanceCents:24});
    await started;
    const pending=earlier.save({...original,balanceCents:42});
    const restarted=earlier.restart(replacement,{expectedEpoch:1});
    release();
    await Promise.all([stale,pending,restarted]);

    expect(await latest.load()).toEqual({snapshot:replacement,epoch:2});
    await latest.restart(original,{expectedEpoch:2});
    await expect(earlier.save(replacement)).rejects.toThrow(/another tab/i);
    await expect(earlier.restart(replacement,{expectedEpoch:2})).rejects.toThrow(/another tab/i);
    expect(await latest.load()).toEqual({snapshot:original,epoch:3});
    expect(storage.value).toEqual(createGame());
  });
});
