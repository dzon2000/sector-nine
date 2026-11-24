import {useEffect,useRef,type ReactNode} from "react";

export function FactoryDialog({label,onClose,children,testId,focusOnOpen,wide}:{
  label:string;onClose:()=>void;children:ReactNode;testId?:string;focusOnOpen?:string;wide?:boolean;
}){
  const node=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=node.current!;
    const opener=document.activeElement;
    dialog.showModal();
    if(focusOnOpen)dialog.querySelector<HTMLElement>(focusOnOpen)?.focus();
    return ()=>{
      dialog.close();
      if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});
    };
  },[focusOnOpen]);
  return <dialog className={wide?"confirmation-dialog factory-dialog story":"confirmation-dialog factory-dialog"} ref={node} aria-label={label}
    data-testid={testId} onCancel={event=>{event.preventDefault();onClose();}}>
    {children}
  </dialog>;
}
