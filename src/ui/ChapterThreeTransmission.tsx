import {useEffect,useId,useRef,useState} from "react";
import type {ChapterTransmission} from "../game/chapterNarrative";

export function ChapterThreeTransmission({transmission,onClose}:{
  transmission:ChapterTransmission;
  onClose:()=>void;
}){
  const modal=useRef<HTMLDialogElement>(null);
  const headingId=useId();
  const [page,setPage]=useState(0);
  useEffect(()=>{
    const dialog=modal.current!;
    dialog.showModal();
    return ()=>dialog.close();
  },[]);

  const close=()=>{modal.current?.close();onClose();};
  const {heading,text}=transmission.pages[page];
  return <dialog className="confirmation-dialog" ref={modal} aria-label="Chapter III Transmission"
    aria-describedby={headingId} onCancel={event=>{event.preventDefault();close();}}>
    <h2 id={headingId}>{heading}</h2>
    <p>{text}</p>
    <div className="actions">
      {page>0&&<button onClick={()=>setPage(n=>n-1)}>Previous Transmission</button>}
      {page<transmission.pages.length-1&&<button onClick={()=>setPage(n=>n+1)}>Next Transmission</button>}
      <button onClick={close}>Return to Factory</button>
      <button onClick={close}>Skip Transmission</button>
    </div>
  </dialog>;
}
