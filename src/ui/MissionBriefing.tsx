import {CHAPTER_IV_COPPER_SALES,CHAPTER_IV_GOALS,CHAPTER_IV_WINDOW_TICKS} from "../domain/chapterFour";
import {CHAPTER_III_CONTRACTS,CONTRACT_STREAK_WINDOWS,CONTRACT_WINDOW_TICKS} from "../domain/contracts";
import {CHAPTER_TRANSMISSIONS} from "../game/chapterNarrative";
import {MISSIONS} from "../game/missions";
import type {GameState} from "../domain/model";
import {CHAPTER_III_TITLES} from "./ChapterThreePanel";
import {CHAPTER_IV_TITLES} from "./ChapterFourPanel";
import {FactoryDialog} from "./FactoryDialog";

function BriefingContent({game}:{game:GameState}){
  const chapterIV=game.chapterIV;
  if(chapterIV){
    const id=chapterIV.activeId;
    const request=CHAPTER_TRANSMISSIONS[`return-signal-${chapterIV.route}`];
    if(!id)return <><h2>The Return Signal Complete</h2><p>Station service is restored. Continue operating in free play.</p></>;
    const goal=CHAPTER_IV_GOALS[id];
    return <>
      <h2>{CHAPTER_IV_TITLES[id]}</h2>
      <p>{request.pages[0].text}</p>
      {id==="M15"&&<p>Sell {CHAPTER_IV_COPPER_SALES} raw copper ore after M15 begins. The circuit window starts on the simulation tick after the last copper sale.</p>}
      <p>Within one rolling window of {CHAPTER_IV_WINDOW_TICKS} simulation ticks, produce {goal.circuitProduced} circuits and sell {goal.circuitSales}. The longest gap between circuit sales can be at most {goal.maxCircuitGap} ticks.</p>
    </>;
  }
  if(game.chapterII?.completed){
    const id=CHAPTER_III_CONTRACTS[game.chapterIII?.completed.length??0];
    if(game.chapterIII&&!id)return <><h2>Project Prometheus Complete</h2><p>Continue in free play or start Chapter IV when ready.</p></>;
    if(!game.chapterIII)return <><h2>First Signal Restored</h2><p>Start Chapter III to investigate the recovered archive.</p></>;
    return <>
      <h2>{CHAPTER_III_TITLES[id]}</h2>
      {id==="M12"&&!game.chapterIII.route?<p>Choose who receives the archive findings. The route determines your contract targets.</p>:
        <p>Accept the contract before measuring progress. Meet every listed condition in the same rolling window of {CONTRACT_WINDOW_TICKS} simulation ticks for {CONTRACT_STREAK_WINDOWS} consecutive qualifying windows.</p>}
      <p>Previous production or sales do not count. Open the archive for the latest transmission.</p>
    </>;
  }
  const mission=MISSIONS[game.mission.activeId];
  return <><h2>{mission.title}</h2><p>{mission.hint}</p></>;
}

export function MissionBriefing({game,onClose}:{game:GameState;onClose:()=>void}){
  return <FactoryDialog label="Mission Briefing" onClose={onClose} focusOnOpen="[data-close]">
    <BriefingContent game={game}/>
    <div className="actions"><button data-close onClick={onClose}>Close briefing</button></div>
  </FactoryDialog>;
}
