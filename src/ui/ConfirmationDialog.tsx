import {useEffect,useId,useRef,type ReactNode} from "react";

interface Props {
  title:string;
  description:ReactNode;
  confirmLabel:string;
  onCancel:()=>void;
  onConfirm:()=>void;
}

export function ConfirmationDialog({title,description,confirmLabel,onCancel,onConfirm}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const descriptionId=useId();

  useEffect(()=>{
    const modal=dialog.current!;
    modal.showModal();
    return ()=>modal.close();
  },[]);

  const close=(action:()=>void)=>{dialog.current?.close();action();};

  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event=>{event.preventDefault();close(onCancel);}}>
    <h2 id={titleId}>{title}</h2>
    <div id={descriptionId}>{description}</div>
    <div className="actions">
      <button autoFocus onClick={()=>close(onCancel)}>Cancel</button>
      <button onClick={()=>close(onConfirm)}>{confirmLabel}</button>
    </div>
  </dialog>;
}
