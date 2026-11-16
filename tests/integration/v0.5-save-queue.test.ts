import {afterEach,describe,expect,it,vi} from "vitest";
import {createGame} from "../../src/domain/model";
import {loadGame,restartGame,saveGame} from "../../src/persistence/indexedDb";

// Single-slot IndexedDB double. Requests complete before the transaction commits.
function slot(initial:unknown){
  let value=initial;
  let writes=0;
  let beforeCommit:Promise<void>|undefined;
  let putStarted:(()=>void)|undefined;
  const db={close(){},transaction(){
    let next=value;
    let aborted=false;
    let wrote=false;
    const transaction={
      oncomplete:()=>{},onabort:()=>{},error:null,
      abort(){aborted=true;transaction.onabort();},
      objectStore(){return {
        get(){return request(value);},
        put(snapshot:unknown){
          next=structuredClone(snapshot);wrote=true;putStarted?.();return request(undefined);
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
      if(wrote){value=next;writes++;}
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
    get value(){return value;},
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
});
