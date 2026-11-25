import {useRef,useState} from "react";
import type {ChapterTransmission} from "../game/chapterNarrative";
import {FactoryDialog} from "./FactoryDialog";

export function TransmissionDialog({transmission,chapter,onClose}:{
  transmission:ChapterTransmission;chapter:"II"|"III"|"IV";onClose:()=>void;
}){
  const [page,setPage]=useState(0);
  const title=useRef<HTMLHeadingElement>(null);
  const {heading,text}=transmission.pages[page];
  const step=(direction:number)=>{
    setPage(current=>current+direction);
    title.current?.focus();
  };
  return <FactoryDialog label={`Chapter ${chapter} Transmission`} onClose={onClose}
    testId={chapter==="II"?"chapter-transmission-overlay":undefined} focusOnOpen="[data-transmission-title]">
    <h2 ref={title} tabIndex={-1} data-transmission-title>{heading}</h2>
    <p>{text}</p>
    <div className="actions">
      {page>0&&<button onClick={()=>step(-1)}>Previous Transmission</button>}
      {page<transmission.pages.length-1&&<button onClick={()=>step(1)}>Next Transmission</button>}
      <button onClick={onClose}>Return to Factory</button>
      <button onClick={onClose}>Skip Transmission</button>
    </div>
  </FactoryDialog>;
}
