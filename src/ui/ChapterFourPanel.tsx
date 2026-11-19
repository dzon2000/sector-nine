import {useEffect,useRef} from "react";
import {CHAPTER_IV_GOALS,CHAPTER_IV_WINDOW_TICKS,summarizeChapterIVTicks,type ChapterIVState} from "../domain/chapterFour";

const titles={M14:"M14 — Answer the Call",M15:"M15 — Restore Service"};
const requests={
  independent:{
    title:"Maintenance-channel transmission",
    text:"Sector 9, do you copy? We have been repeating this restart request since the shutdown. Keep your circuit line running so we can verify the connection.",
  },
  corporate:{
    title:"Redacted service ticket",
    text:"Origin: [redacted]. Restart request outstanding since the shutdown. Maintain circuit service so the receiving station can verify the connection.",
  },
};

export function ChapterFourPanel({chapter}:{chapter:ChapterIVState|undefined}){
  const heading=useRef<HTMLHeadingElement>(null);
  const started=!!chapter;
  const wasStarted=useRef(started);
  useEffect(()=>{
    if(started&&!wasStarted.current)heading.current?.focus();
    wasStarted.current=started;
  },[started]);

  if(!chapter)return null;
  const mission=chapter.activeId;
  if(!mission)return <section className="chapter-four-contracts" aria-label="Chapter IV objectives">
    <h2>The Return Signal Complete</h2>
    <h3>Station reply</h3>
    <blockquote>Sector 9, we can see your line again.</blockquote>
    <p>Return to free play.</p>
  </section>;

  const request=requests[chapter.route];
  const progress=summarizeChapterIVTicks(chapter.ticks);
  const goal=CHAPTER_IV_GOALS[mission];
  return <section className="chapter-four-contracts" aria-label="Chapter IV objectives">
    <h2 ref={heading} tabIndex={-1}>{titles[mission]}</h2>
    {mission==="M15"&&<p>Keep circuit service running while restoring the gear order.</p>}
    <p>Window · {chapter.ticks.length} of {CHAPTER_IV_WINDOW_TICKS} simulation ticks</p>
    <ul className="contract-conditions">
      <li>Circuits produced · {progress.circuitProduced} / {goal.circuitProduced}</li>
      <li>Circuits sold · {progress.circuitSales} / {goal.circuitSales}</li>
      <li className={progress.maxCircuitGap>goal.maxCircuitGap?"progress":undefined}>
        Longest circuit-sales gap · {progress.maxCircuitGap} simulation ticks (maximum {goal.maxCircuitGap})
      </li>
      {mission==="M15"&&<>
        <li>Gears produced · {progress.gearProduced} / {goal.gearProduced}</li>
        <li>Gears sold · {progress.gearSales} / {goal.gearSales}</li>
      </>}
    </ul>
    <h3>{request.title}</h3>
    <p>{request.text}</p>
  </section>;
}
