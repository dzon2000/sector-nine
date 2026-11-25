import {useEffect,useId,useRef,useState} from "react";
import {CHECKPOINTS,type CheckpointId} from "../game/chapterPlaytest";
import {chapterPlaytestSlot,fetchChapterCheckpoint} from "../persistence/chapterPlaytest";
import {discardChapterPlaytestRecording} from "./playtest";
import type {ChapterIIIRoute} from "../domain/contracts";

const briefing={
  II:"A restored foundry gives you the means to investigate a new signal and the site's unregistered materials.",
  III:"The first signal leads to an old project archive. Decide who should receive the recovered information.",
  IV:"The reconstructed interlock has opened a maintenance channel. A remote station is asking for help.",
};

type Props={allowResume:boolean;onClose:()=>void;onEnter:(commitStart?:()=>Promise<void>)=>Promise<void>};

export function ChapterPlaytestPicker({allowResume,onClose,onEnter}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const [chapter,setChapter]=useState<"ii"|"iii"|"iv">("ii");
  const [route,setRoute]=useState<ChapterIIIRoute>("independent");
  const [slot,setSlot]=useState<Awaited<ReturnType<typeof chapterPlaytestSlot.inspect>>>();
  const [confirmReplace,setConfirmReplace]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState<string>();
  const id:CheckpointId=chapter==="iv"?`iv-${route}`:chapter;
  const selected=CHECKPOINTS[id];
  useEffect(()=>{
    const modal=dialog.current!;
    modal.showModal();
    let current=true;
    chapterPlaytestSlot.inspect().then(info=>{
      if(current)setSlot(info);
    }).catch(error=>{if(current)setFailure(String(error));});
    return ()=>{current=false;modal.close();};
  },[]);

  async function launch(){
    if(!slot||busy)return;
    if(slot.exists&&!confirmReplace){setConfirmReplace(true);return;}
    setBusy(true);
    setFailure(undefined);
    try{
      const checkpoint=await fetchChapterCheckpoint(id);
      await onEnter(async()=>{
        await chapterPlaytestSlot.restart(checkpoint,{expectedEpoch:slot.epoch});
        if(slot.exists&&slot.epoch!==null)discardChapterPlaytestRecording(slot.epoch);
      });
    }catch(error){
      setFailure(String(error));
      setBusy(false);
      setConfirmReplace(false);
      // A different tab may have replaced the slot while the checkpoint loaded.
      chapterPlaytestSlot.inspect().then(setSlot).catch(()=>setSlot(undefined));
    }
  }

  async function resume(){
    setBusy(true);
    setFailure(undefined);
    try{await onEnter();}
    catch(error){setFailure(String(error));setBusy(false);}
  }

  const close=()=>{dialog.current?.close();onClose();};

  return <dialog ref={dialog} className="confirmation-dialog chapter-playtest-picker" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();if(!busy){if(confirmReplace)setConfirmReplace(false);else close();}}}>
    <h2 id={titleId}>Chapter Playtest</h2>
    <p>Start paused at a chapter handoff with a factory built through the campaign. Your campaign save stays separate.</p>
    <label>Starting chapter
      <select value={chapter} disabled={busy||confirmReplace}
        onChange={event=>setChapter(event.currentTarget.value as typeof chapter)}>
        <option value="ii">Chapter II · Unregistered Materials</option>
        <option value="iii">Chapter III · Project Prometheus</option>
        <option value="iv">Chapter IV · The Return Signal</option>
      </select>
    </label>
    {chapter==="iv"&&<label>Recipient route
      <select value={route} disabled={busy||confirmReplace}
        onChange={event=>setRoute(event.currentTarget.value as ChapterIIIRoute)}>
        <option value="independent">Independent</option><option value="corporate">Corporate</option>
      </select>
    </label>}
    <p><strong>Start at {selected.startingMission}</strong></p>
    <p>{briefing[selected.chapter]}</p>
    {confirmReplace&&<p role="alert">Replace the saved chapter playtest and start fresh? Its progress and recording will no longer be available in the game.</p>}
    {failure&&<p role="alert">{failure}</p>}
    <div className="actions">
      <button disabled={busy} onClick={confirmReplace?()=>setConfirmReplace(false):close}>{confirmReplace?"Back":"Cancel"}</button>
      {allowResume&&slot?.exists&&!confirmReplace&&<button disabled={busy} onClick={()=>void resume()}>Resume Chapter Playtest</button>}
      <button disabled={!slot||busy} onClick={()=>void launch()}>
        {busy?"Loading checkpoint…":confirmReplace?"Replace Chapter Playtest":"Start Chapter Playtest"}
      </button>
    </div>
  </dialog>;
}
