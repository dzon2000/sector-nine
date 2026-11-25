import type {ReactNode,Ref} from "react";
import {money,stats,type GameState} from "../domain/model";
import type {SimulationSpeed} from "./simulationClock";

export function OperationsHud({game,speed,onSpeed,onToggleClock,onMenu}:{
  game:GameState;speed:SimulationSpeed;onSpeed:(speed:SimulationSpeed)=>void;
  onToggleClock:()=>void;onMenu:()=>void;
}){
  const kpi=stats(game);
  const power=game.power;
  const shortfall=power&&power.served<power.demand;
  return <header className="operations-hud">
    <div className="brand">SEKTOR <strong>9</strong></div>
    <div className="kpis" aria-label="Factory indicators">
      <div><span>Cash</span><strong data-testid="cash">{money(game.balanceCents)}</strong></div>
      <div><span><span className="profit-label-prefix">Operating </span>Profit / sim min</span>
        <strong data-testid="profit">{kpi?money(kpi.profitCents):"Collecting data"}</strong></div>
      {power&&<div className={shortfall?"fault":undefined}>
        <span>Power supply / demand</span><strong data-testid="hud-power">{power.supply} / {power.demand}</strong>
      </div>}
    </div>
    <div className="clock-controls">
      <select aria-label="Simulation speed" value={speed} onChange={event=>onSpeed(event.currentTarget.value==="2"?2:1)}>
        <option value="1">1×</option><option value="2">2×</option>
      </select>
      <button className="clock-toggle" onClick={onToggleClock}>{game.paused?"▶ Run":"Ⅱ Pause"}</button>
      <button onClick={onMenu} aria-haspopup="dialog">Menu</button>
    </div>
  </header>;
}

export function MissionHeading({id,title,headingRef}:{
  id?:string;title:string;headingRef?:Ref<HTMLHeadingElement>;
}){
  return <div className="mission-heading">
    <small>OPERATIONS CONSOLE{id&&" // "+id}</small>
    <h2 ref={headingRef} tabIndex={headingRef?-1:undefined}>{title}</h2>
  </div>;
}

export function OperationsConsole({children,actions,onBriefing,onArchive}:{
  children:ReactNode;actions:ReactNode;onBriefing:()=>void;onArchive:()=>void;
}){
  return <footer className="operations-console" data-testid="mission-hud" aria-label="Operations Console">
    <div className="mission-hud-objectives" tabIndex={0} role="region" aria-label="Operations objectives">{children}</div>
    <div className="mission-hud-actions">
      <div className="mission-reading">
        <button onClick={onBriefing} aria-haspopup="dialog">Briefing</button>
        <button onClick={onArchive} aria-haspopup="dialog">Archive</button>
      </div>
      {actions}
    </div>
  </footer>;
}
