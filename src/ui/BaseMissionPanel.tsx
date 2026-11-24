import {useEffect,useRef} from "react";
import {money,stats,type GameState} from "../domain/model";
import {MISSIONS} from "../game/missions";
import {missionWindow} from "../game/missionMetrics";
import {chapterWindow} from "../game/chapterTwo";
import {MissionHeading} from "./OperationsHud";

function ProductionProgress({game}:{game:GameState}){
  switch(game.mission.activeId){
    case "M1": return <p>Iron ore produced · {game.totalOreProduced>0?1:0} / 1</p>;
    case "M2": return <p>{game.mission.soldOre} / 10 ore sold</p>;
    case "M3": return <p>{game.mission.soldIngot} / 20 ingots sold</p>;
    case "M4": {
      const profit=stats(game)?.profitCents;
      return <>
        <p>{profit===undefined?`Profit window · ${game.rollingEvents.length} / 60 simulation ticks`:
          `Operating profit · ${money(profit)} / 50.00 Cr per sim min`}</p>
        <p>{game.mission.profitStreakTicks} / 60 qualifying ticks</p>
      </>;
    }
    case "M5": return <p>{game.mission.soldCoal??0} / 10 coal sold</p>;
    default: return null;
  }
}

function FoundryProgress({game}:{game:GameState}){
  const steel=game.mission.activeId==="M7";
  const window=missionWindow(game);
  const sample=game.missionMetrics?.salesTicks??[];
  const gear=window?.sales.gear??sample.reduce((sum,tick)=>sum+tick.sales.gear,0);
  const steelSold=window?.sales.steel??sample.reduce((sum,tick)=>sum+tick.sales.steel,0);
  const gearGoal=steel?7:9;
  const blocker=!window?"Collect 60 active mission ticks before evaluating throughput.":
    window.sales.gear<gearGoal?"Increase gear production and inspect assembler inputs.":
    steel&&window.sales.steel<7?"Increase steel output; inspect coal and iron-ingot supply.":
    steel&&window.profitCents<17500?"Improve operating profit while preserving parallel production.":
    steel&&!game.technologies?.advanced_smelting?"Purchase Advanced Smelting technology.":
    "All conditions met in current window; maintain stable throughput.";
  return <section aria-label="Mission throughput diagnostics" data-testid="mission-throughput">
    <h3 className="summary-title">Live objective · {game.missionMetrics?.salesTicks.length??0} / 60 simulation ticks</h3>
    <p data-testid="mission-bottleneck">{blocker}</p>
    <ul className="mission-values">
      <li>Gear sales: {gear}/{gearGoal} per 60 ticks</li>
      {steel&&<li>Steel sales: {steelSold}/7 per 60 ticks</li>}
      {steel&&<li>Operating profit: {window?money(window.profitCents):"Collecting data"}/175.00 Cr</li>}
      {steel&&<li>Advanced Smelting: {game.technologies?.advanced_smelting?"Unlocked":"Locked"}</li>}
      <li>Stable: {game.missionMetrics?.streakTicks??0}/120 consecutive qualifying ticks</li>
    </ul>
  </section>;
}

function SignalProgress({game}:{game:GameState}){
  const id=game.mission.activeId;
  const metrics=game.chapterII?.metrics;
  const window=chapterWindow(game);
  const sample=metrics?.salesTicks??[];
  const circuitsSold=window?.sales.circuit??sample.reduce((sum,tick)=>sum+tick.sales.circuit,0);
  const circuitsProduced=window?.producedCircuits??sample.reduce((sum,tick)=>sum+tick.producedCircuits,0);
  const steel=window?.sales.steel??sample.reduce((sum,tick)=>sum+tick.sales.steel,0);
  const powered=window?.coveredTicks??sample.filter(tick=>tick.demandCovered).length;
  const blocker=!window?"Collect the full rolling window.":
    (window.sales.circuit<11||window.producedCircuits<11)?"Increase circuit output and ensure circuits reach the terminal.":
    window.sales.steel<5?"Restore steel deliveries alongside circuits.":
    window.coveredTicks<57?"Cover more fabrication demand with fueled generators.":
    "All conditions met in current window; maintain continuity.";
  return <section aria-label="Chapter II objectives" data-testid="chapter-objectives">
    {id==="M8"?<>
      <p>Copper sold: {metrics?.totals?.copper_ore??0}/10 · Silicon sold: {metrics?.totals?.silicon??0}/10</p>
      {!game.technologies?.resource_surveying&&<p>Unlock Resource Surveying to mine both deposits.</p>}
    </>:id==="M9"?<p>Circuits sold: {metrics?.totals?.circuit??0}/4 · Fabrication: {game.technologies?.circuit_fabrication?"Unlocked":"Locked"} · Power: {game.technologies?.industrial_power?"Unlocked":"Locked"}</p>:<>
      <h3 className="summary-title">{window?"Complete 60-simulation-tick window":`Window · ${metrics?.salesTicks.length??0} / 60 simulation ticks`}</h3>
      <p data-testid="mission-bottleneck">{blocker}</p>
      <ul className="mission-values">
        <li>Circuits sold: {circuitsSold}/11</li>
        <li>Circuits produced: {circuitsProduced}/11</li>
        <li>Steel sold: {steel}/5</li>
        <li>Demand covered: {powered}/57 of 60</li>
        <li>Stable: {metrics?.streakTicks??0}/60 consecutive windows</li>
      </ul>
    </>}
  </section>;
}

export function BaseMissionPanel({game,beginChapter,onBegin}:{
  game:GameState;beginChapter:boolean;onBegin:()=>void;
}){
  const id=game.mission.activeId;
  const heading=useRef<HTMLHeadingElement>(null);
  const focusAfterBegin=useRef(false);
  useEffect(()=>{
    if(focusAfterBegin.current){
      heading.current?.focus();
      focusAfterBegin.current=false;
    }
  },[id]);
  return <section className="mission-layout">
    <MissionHeading id={id==="DONE"?undefined:id} title={MISSIONS[id].title} headingRef={heading}/>
    <div className="mission-summary">
      <ProductionProgress game={game}/>
      {(id==="M6"||id==="M7")&&<FoundryProgress game={game}/>}
      {(id==="M8"||id==="M9"||id==="M10")&&<SignalProgress game={game}/>}
      {id==="DONE"?<>
        {beginChapter&&<button data-testid="begin-chapter-ii" onClick={()=>{focusAfterBegin.current=true;onBegin();}}>Begin Chapter II</button>}
        <p>Continue operating in free play.</p>
      </>:game.tutorialEnabled&&id!=="M6"&&id!=="M7"&&id!=="M10"&&<p>{MISSIONS[id].hint}</p>}
    </div>
  </section>;
}
