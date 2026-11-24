import {useRef,useState,type ReactNode} from "react";
import {FactoryDialog} from "./FactoryDialog";

export function StoryDialog({label,archive,pages,onClose,children}:{
  label:string;archive:string;pages:readonly (readonly [string,string])[];
  onClose:()=>void;children:ReactNode;
}){
  const [page,setPage]=useState(0);
  const title=useRef<HTMLHeadingElement>(null);
  const [heading,text]=pages[page];
  const step=(direction:number)=>{
    setPage(current=>current+direction);
    title.current?.focus();
  };
  return <FactoryDialog label={label} onClose={onClose} focusOnOpen="[data-story-heading]" wide>
    <small>{page+1} / {pages.length} · {archive}</small>
    <h1 ref={title} tabIndex={-1} data-story-heading>{heading}</h1>
    <p>{text}</p>
    <div className="actions">
      {page>0&&<button onClick={()=>step(-1)}>Previous</button>}
      {page<pages.length-1&&<button onClick={()=>step(1)}>Next</button>}
      {children}
    </div>
  </FactoryDialog>;
}
