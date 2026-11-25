import {useEffect,useRef} from "react";
import {CHAPTER_IV_GOALS,CHAPTER_IV_COPPER_SALES,CHAPTER_IV_WINDOW_TICKS,summarizeChapterIVTicks,type ChapterIVState} from "../domain/chapterFour";
import {CHAPTER_TRANSMISSIONS} from "../game/chapterNarrative";
import {MissionHeading} from "./OperationsHud";

export const CHAPTER_IV_TITLES={M14:"Answer the Call",M15:"Restore Service"};

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
  if(!mission)return <section className="chapter-four-contracts mission-layout" aria-label="Chapter IV objectives">
    <MissionHeading title="The Return Signal Complete"/>
    <div className="mission-summary">
      <p>Return to free play.</p>
      <h3>Station reply</h3>
      <blockquote>{CHAPTER_TRANSMISSIONS["return-signal-reply"].pages[0].text}</blockquote>
    </div>
  </section>;

  const request=CHAPTER_TRANSMISSIONS[`return-signal-${chapter.route}`];
  const progress=summarizeChapterIVTicks(chapter.ticks);
  const goal=CHAPTER_IV_GOALS[mission];
  const copperShipped=chapter.copperShipmentTicks.length;
  const shipping=mission==="M15"&&copperShipped<CHAPTER_IV_COPPER_SALES;
  const continuity=chapter.ticks.length<CHAPTER_IV_WINDOW_TICKS?"Collect the full continuity window.":
    progress.maxCircuitGap>goal.maxCircuitGap?"Circuit deliveries are too far apart. Check circuit routing and power.":
    progress.circuitProduced<goal.circuitProduced?"Increase circuit production.":
    progress.circuitSales<goal.circuitSales?"Route more circuits to the terminal.":
    "All current continuity conditions are met.";
  return <section className="chapter-four-contracts mission-layout" aria-label="Chapter IV objectives">
    <MissionHeading id={mission} title={CHAPTER_IV_TITLES[mission]} headingRef={heading}/>
    <div className="mission-summary">
      {mission==="M15"&&<>
        <h3 className="summary-title">{shipping?"Ship raw copper":"Restore circuit continuity"}</h3>
        <p>Copper ore shipped · {copperShipped} / {CHAPTER_IV_COPPER_SALES}</p>
        {shipping&&<p>Send raw copper ore to the sale terminal for station repairs.</p>}
      </>}
      {!shipping&&<>
        <p>Window · {chapter.ticks.length} of {CHAPTER_IV_WINDOW_TICKS} simulation ticks</p>
        <p data-testid="mission-bottleneck">{continuity}</p>
        <ul className="mission-values">
          <li>Circuits produced · {progress.circuitProduced} / {goal.circuitProduced}</li>
          <li>Circuits sold · {progress.circuitSales} / {goal.circuitSales}</li>
          <li className={progress.maxCircuitGap>goal.maxCircuitGap?"fault":undefined}>
            Longest circuit-sales gap · {progress.maxCircuitGap} simulation ticks (maximum {goal.maxCircuitGap})
          </li>
        </ul>
      </>}
      <h3>{request.pages[0].heading}</h3>
    </div>
  </section>;
}
