import {Fragment,useCallback,useEffect,useRef,useState} from "react";
import {begin,place,remove,reset,setPause,turn,face} from "../game/commands";
import {MISSIONS} from "../game/missions";
import {entityDiagnostics,terminalDiagnostics,diagnosticHint} from "../game/diagnostics";
import {missionWindow} from "../game/missionMetrics";
import {beginChapterII,chapterWindow} from "../game/chapterTwo";
import {CHAPTER_TRANSMISSIONS,availableTransmissions,type ChapterTransmissionId} from "../game/chapterNarrative";
import {BUILD_COMMIT} from "./buildProvenance";
import {TECHNOLOGIES,TECHNOLOGY_ORDER,CHAPTER_TECHNOLOGY_ORDER,technologyStatus,purchaseTechnology,type AnyTechnologyId} from "../game/technologies";
import {createGame,DEFINITIONS,DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,RECIPES,money,rotate,stats,type Direction,type GameState,type Kind,type Item} from "../domain/model";
import {tick} from "../simulation/engine";
import {loadGame,saveGame,eraseGame} from "../persistence/indexedDb";
import {Board,type Tool} from "../rendering/Board";
import {startPlaytest,resumePlaytest,advancePlaytest,annotatePlaytest,recordPlaytestCommand,finishPlaytest,buildPlaytestReport,isPlaytestSession,type PlaytestSession,type PlaytestCommand,type PlaytestActivity} from "./playtest";
const PLAYTEST_KEY="sector-nine-v0.3-local-playtest";
const FOUNDRY_NARRATIVE=[
 ["OPERATIONS DIRECTIVE // FOUNDRY RESTORATION","Your first deliveries have restored confidence in Sector 9. A retired foundry blueprint has surfaced in the maintenance archive. It references coal-fired metallurgy and mechanical assemblies once used by Project Prometheus."],
 ["CONDITIONAL AUTHORIZATION","Corporate authorization is conditional. Purchase technology using production profits. Coal Extraction costs 80 Cr, Mechanical Components 120 Cr, and Advanced Smelting 180 Cr."],
 ["THE OLD FOUNDRY","Deliver coal first, then expand gear production instead of merely waiting for eight sales. Advanced steel must operate alongside gears, with profit sustained for two full minutes. Inspect starvation and blocked outputs to plan rerouting. The archive remains sealed until the foundry proves its capacity."]
];
const NARRATIVE=[
 ["CORPORATE OPERATIONS // SECTOR 9","Your predecessor's industrial complex has been idle for 312 days. We have authorized a limited restart budget: 300 Cr."],
 ["FINAL OPERATIONS NOTICE","The colony needs material deliveries. Headquarters needs profit. Restore production, fulfill the first order, and prove this facility is worth saving."],
 ["MAINTENANCE ARCHIVE","An archived maintenance record mentions PROJECT PROMETHEUS. Access denied. Restore production before requesting clearance."]
];
export default function App(){
  const [game,setGame]=useState<GameState|null>(null);
  const latest=useRef<GameState|null>(null);
  const [tool,setTool]=useState<Tool>("select");
  const [direction,setDirection]=useState<Direction>("E");
  const [selected,setSelected]=useState<number|null>(null);
  const [message,setMessage]=useState("Welcome to Sector 9.");
  const [error,setError]=useState<string|null>(null);
  const [panel,setPanel]=useState(0);
  const [help,setHelp]=useState(false);
  const [replayFoundry,setReplayFoundry]=useState(false);
  const [transmission,setTransmission]=useState<ChapterTransmissionId|null>(null);
  const [transmissionPage,setTransmissionPage]=useState(0);
  const [showTechnology,setShowTechnology]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<"construction"|"inspector"|null>(null);
  const [foundryPanel,setFoundryPanel]=useState(0);
  const [ready,setReady]=useState(false);
  const resetting=useRef(false);
  const [showPlaytest,setShowPlaytest]=useState(false);
  const [playtest,setPlaytest]=useState<PlaytestSession|null>(null);
  const playtestRef=useRef<PlaytestSession|null>(null);
  const savePlaytest=(session:PlaytestSession|null)=>{
    playtestRef.current=session;setPlaytest(session);
    try{if(session)localStorage.setItem(PLAYTEST_KEY,JSON.stringify(session));
      else localStorage.removeItem(PLAYTEST_KEY);
    }catch{setMessage("Local playtest storage unavailable. Export your report before closing the tab.");}
  };
  const observePlaytest=(next:GameState,command?:PlaytestCommand)=>{
    const session=playtestRef.current;
    if(!session?.active)return;
    const now=Date.now();
    let updated=advancePlaytest(session,next,now);
    if(command)updated=recordPlaytestCommand(updated,command,now);
    savePlaytest(updated);
  };
  const exportPlaytest=()=>{
    if(!playtestRef.current)return;
    const report=buildPlaytestReport(playtestRef.current);
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="sector-nine-playtest.json";link.click();
    URL.revokeObjectURL(url);
  };
  const change=useCallback((f:(s:GameState)=>GameState)=>{
    const s=latest.current;if(!s||resetting.current)return;
    const next=f(s);latest.current=next;setGame(next);observePlaytest(next);
  },[]);
  useEffect(()=>{
    loadGame().then(s=>{
      const initial=s??createGame();latest.current=initial;setGame(initial);
      try{const saved=localStorage.getItem(PLAYTEST_KEY);
        if(saved){
          const parsed:unknown=JSON.parse(saved);
          if(!isPlaytestSession(parsed))throw new Error("Invalid optional playtest state");
          const session=resumePlaytest(parsed,initial,Date.now());
          playtestRef.current=session;setPlaytest(session);setShowPlaytest(true);
        }
      }catch{
        // Recorder corruption or unavailable browser storage must not interrupt gameplay.
        try{localStorage.removeItem(PLAYTEST_KEY);}catch{/* Recording remains optional. */}
      }
      setReady(true);
    })
      .catch(e=>{setError(String(e));setReady(true);});
  },[]);
  useEffect(()=>{
    if(!ready||!game||error)return;
    const id=window.setInterval(()=>{
      const s=latest.current;
      if(!s||resetting.current)return;
      if(s.paused||s.introOpen||document.hidden){observePlaytest(s);return;}
      const next=tick(s);latest.current=next;setGame(next);observePlaytest(next);
      if(next.tick%10===0)void saveGame(next).catch(e=>setError(String(e)));
    },1000);
    return ()=>clearInterval(id);
  },[ready,game?.paused,game?.introOpen,error]);
  useEffect(()=>{
    const onVisibility=()=>{
      if(document.hidden&&latest.current&&!resetting.current){
        change(s=>setPause(s,true));
        void saveGame({...latest.current!,paused:true}).catch(e=>setError(String(e)));
      }
    };
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>document.removeEventListener("visibilitychange",onVisibility);
  },[change]);
  const persist=(s:GameState,command?:PlaytestCommand)=>{
    if(resetting.current)return;latest.current=s;setGame(s);observePlaytest(s,command);
    void saveGame(s).catch(e=>setError(String(e)));
  };
  const selectedEntity=game?.entities.find(e=>e.id===selected);
  const directRotate=(id:number,desired:Direction)=>{
    const source=latest.current;if(!source||tool!=="select")return;
    const entity=source.entities.find(e=>e.id===id);
    if(!entity)return;
    const result=face(source,id,desired);
    if(result.ok)persist(result.state,{kind:"turn",entityKind:entity.kind,x:entity.x,y:entity.y});
    else if(result.message!=="Facing unchanged.")setMessage(result.message);
  };
  const rotateChoice=()=>{
    if(tool!=="select"&&tool!=="demolish")setDirection(d=>rotate(d));
    else if(selectedEntity){const r=turn(latest.current!,selectedEntity.id);setMessage(r.message);
      if(r.ok)persist(r.state,{kind:"turn",entityKind:selectedEntity.kind,x:selectedEntity.x,y:selectedEntity.y});}
  };
  const demolish=(id:number)=>{
    const e=latest.current?.entities.find(e=>e.id===id);if(!e)return;
    if(!window.confirm("Demolish "+e.kind+"? Buffered items will be destroyed. Refund: "+money(Math.floor(DEFINITIONS[e.kind].price*0.75))))return;
    const result=remove(latest.current!,id,true);setMessage(result.message);
    if(result.ok){persist(result.state,{kind:"demolish",entityKind:e.kind,x:e.x,y:e.y});setSelected(null);}
  };
  useEffect(()=>{
    const listener=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLButtonElement||game?.introOpen||error)return;
      if(e.key.toLowerCase()==="r"){e.preventDefault();rotateChoice();}
      if(e.key==="Escape"){setTool("select");setSelected(null);}
      if(e.key==="Delete"&&selectedEntity)demolish(selectedEntity.id);
      if(e.code==="Space"){e.preventDefault();change(s=>{const n=setPause(s,!s.paused);void saveGame(n).catch(err=>setError(String(err)));return n;});}
    };
    window.addEventListener("keydown",listener);return ()=>window.removeEventListener("keydown",listener);
  });
  const tile=(x:number,y:number)=>{
    if(!game||game.introOpen)return;
    const entity=game.entities.find(e=>e.x===x&&e.y===y);
    if(tool==="select"){setSelected(entity?.id??null);return;}
    if(tool==="demolish"){if(entity)demolish(entity.id);else setMessage("No object to demolish.");return;}
    const result=place(game,tool,x,y,direction);
    setMessage(result.message);if(result.ok){persist(result.state,{kind:"place",entityKind:tool,x,y});setSelected(result.state.nextId-1);}
  };
  const closeFoundry=()=>{const s=latest.current;if(!s)return;const n=structuredClone(s);n.foundryStorySeen=true;persist(n);setReplayFoundry(false);setFoundryPanel(0);};
  const openTransmission=(id:ChapterTransmissionId)=>{setTransmission(id);setTransmissionPage(0);};
  const closeTransmission=()=>{
    if(transmission==="opening"&&latest.current?.chapterII?.started&&!latest.current.chapterII.storySeen){
      const next=structuredClone(latest.current);next.chapterII!.storySeen=true;persist(next);
    }
    setTransmission(null);setTransmissionPage(0);
  };
  const buyTechnology=(id:AnyTechnologyId)=>{
    const current=latest.current;if(!current)return;
    const status=technologyStatus(current,id);
    if(status.status!=="available"||!status.affordable){setMessage(status.missing.join("; ")||"Insufficient credits.");return;}
    if(!window.confirm(`Unlock ${TECHNOLOGIES[id].label} for ${money(TECHNOLOGIES[id].costCents)}? This is a one-time, permanent payment and cannot be undone.`))return;
    const result=purchaseTechnology(current,id);
    setMessage(result.message);
    if(result.ok)persist(result.state,{kind:"research",technology:id});
  };
  const go=()=>{change(begin);setPanel(0);const s=latest.current;if(s)void saveGame(s).catch(e=>setError(String(e)));};
  const fresh=async()=>{if(resetting.current||!window.confirm("Factory Reset? All progress and your save will be permanently deleted."))return;
    resetting.current=true;
    try{await eraseGame();savePlaytest(null);setShowPlaytest(false);const s=reset();latest.current=s;setGame(s);setError(null);setSelected(null);setTool("select");setPanel(0);setShowTechnology(false);setReplayFoundry(false);setFoundryPanel(0);setTransmission(null);setTransmissionPage(0);setMessage("New factory started.");}catch(e){setError(String(e));}finally{resetting.current=false;}};
  if(!ready)return <main>Loading Sector 9...</main>;
  if(error)return <main className="error"><h1>Save error</h1><p role="alert">{error}</p><p>Stored data has not been overwritten. Export or back up your IndexedDB data before resetting.</p><button onClick={()=>void fresh()}>Factory Reset</button></main>;
  if(!game)return null;
  const kpi=stats(game),mission=MISSIONS[game.mission.activeId];
  const narrativeAvailable=availableTransmissions(game);
  const activeTransmission=transmission&&narrativeAvailable.includes(transmission)?CHAPTER_TRANSMISSIONS[transmission]:null;
  const chapterCompleted=game.chapterII?.started&&game.chapterII.completed&&game.mission.activeId==="DONE";
  const legacyObjective=game.missionRuleVersion===2&&
    (game.mission.activeId==="M6"||game.mission.activeId==="M7");
  const objectiveHint=legacyObjective?
    (game.mission.activeId==="M6"
      ?"Legacy campaign: sell eight gears at the terminal. Your original cumulative progress is preserved."
      :"Legacy campaign: unlock Advanced Smelting and sell eight steel at the terminal. Your original cumulative progress is preserved.")
    :mission.hint;
  const machineCounters=selectedEntity?entityDiagnostics(game,selectedEntity.id):null;
  const terminalCounters=terminalDiagnostics(game);
  const currentWindow=missionWindow(game);
  const chapterMetrics=game.chapterII?.metrics;
  const chapterWindowProgress=chapterWindow(game);
  const activeChapterMission=["M8","M9","M10"].includes(game.mission.activeId);
  const canBeginChapterII=game.mission.activeId==="DONE"&&!game.chapterII?.started&&!game.chapterII?.completed&&
    game.technologies?.coal_extraction&&game.technologies?.mechanical_components&&game.technologies?.advanced_smelting;
  const throughputMission=game.missionRuleVersion===3&&
    (game.mission.activeId==="M6"||game.mission.activeId==="M7");
  const isM7=game.mission.activeId==="M7";
  const missionStreak=game.missionMetrics?.streakTicks??0;
  const unmetRequirements:string[]=[];
  if(throughputMission){
    if(!currentWindow)unmetRequirements.push("Collect 60 active mission ticks before evaluating throughput.");
    else{
      if(currentWindow.sales.gear<(isM7?7:9))unmetRequirements.push("Increase gear production and inspect assembler inputs.");
      if(isM7&&currentWindow.sales.steel<7)unmetRequirements.push("Increase steel output; inspect coal and iron-ingot supply.");
      if(isM7&&currentWindow.profitCents<17500)unmetRequirements.push("Improve operating profit while preserving parallel production.");
    }
    if(isM7&&!game.technologies?.advanced_smelting)
      unmetRequirements.push("Purchase Advanced Smelting technology.");
  }
  const foundryActive=["M5","M6","M7","DONE"].includes(game.mission.activeId);
  const foundryStoryOpen=(["M5","M6","M7"].includes(game.mission.activeId)&&!game.foundryStorySeen)||(foundryActive&&replayFoundry);
  return <div className="app">
    <header><div className="brand">SEKTOR <strong>9</strong><small>INDUSTRIAL OPERATIONS</small></div>
      <div className="kpis"><div>Cash<strong data-testid="cash">{money(game.balanceCents)}</strong></div><div>Revenue / min<strong>{kpi?money(kpi.revenueCents):"Collecting data"}</strong></div><div>Operating cost / min<strong>{kpi?money(kpi.costCents):"Collecting data"}</strong></div><div>Profit / min<strong data-testid="profit">{kpi?money(kpi.profitCents):"Collecting data"}</strong></div></div>
      <button onClick={()=>{const n=setPause(game,!game.paused);persist(n);}}>{game.paused?"▶ Run":"Ⅱ Pause"}</button>
    </header>
    <div className="mobile-panel-actions" aria-label="Factory panels">
      <button aria-expanded={mobilePanel==="construction"} onClick={()=>setMobilePanel(v=>v==="construction"?null:"construction")}>Construction panel</button>
      <button aria-expanded={mobilePanel==="inspector"} onClick={()=>setMobilePanel(v=>v==="inspector"?null:"inspector")}>Inspector panel</button>
    </div>
    <div className="workspace"><aside className={"palette"+(mobilePanel==="construction"?" mobile-open":"")} aria-label="Construction and technology panel"><h2>Construction</h2>
      {(["select","iron_mine","furnace","coal_mine","assembler","advanced_furnace","conveyor","copper_mine","silicon_extractor","circuit_fabricator","coal_generator","splitter","demolish"] as const).map(t=>{
        const technology:Partial<Record<Kind,AnyTechnologyId>>={coal_mine:"coal_extraction",assembler:"mechanical_components",advanced_furnace:"advanced_smelting",copper_mine:"resource_surveying",silicon_extractor:"resource_surveying",circuit_fabricator:"circuit_fabrication",splitter:"circuit_fabrication",coal_generator:"industrial_power"};
        const required=t!=="select"&&t!=="demolish"?technology[t]:undefined;
        const locked=required?!game.technologies?.[required]:t==="furnace"?["M1","M2"].includes(game.mission.activeId):false;
        return <button key={t} className={tool===t?"active":""} onClick={()=>{if(locked){setMessage(required?`Unlock ${TECHNOLOGIES[required].label} in Technology first.`:"Complete M2 to construct Basic Furnace.");setShowTechnology(true);return;}setTool(t);}} aria-pressed={tool===t}>
          {t==="select"?"Inspect":t==="demolish"?"Demolish":DEFINITIONS[t].label}
          {t!=="select"&&t!=="demolish"?<span>{money(DEFINITIONS[t].price)}{locked?" · Locked":""}</span>:null}
        </button>;
      })}
      <div className="mini"><button onClick={()=>setShowTechnology(v=>!v)} aria-expanded={showTechnology} aria-controls="technology-panel">Technology {showTechnology?"−":"+"}</button><p>Facing preview: <b>{direction}</b></p><button onClick={rotateChoice}>Rotate (R)</button><p>Esc: cancel · Space: run / pause · Delete: demolish</p></div>
      {showTechnology&&<section id="technology-panel" className="technology-panel" aria-label="Technology unlocks">
        <h3>Technology unlocks</h3>
        <p>Meet milestones, then permanently purchase each unlock. No automatic credit deduction.</p>
        {[...TECHNOLOGY_ORDER,...(game.chapterII?.started?CHAPTER_TECHNOLOGY_ORDER:[])].map(id=>{
          const definition=TECHNOLOGIES[id],status=technologyStatus(game,id);
          return <article key={id} className="technology-node" data-testid={`technology-${id}`}>
            <h3>{definition.label}</h3>
            <p>Unlocks: {definition.unlocks}</p>
            <p>Cost: {money(definition.costCents)}</p>
            <p>Status: <strong>{status.status==="locked"?"Locked":status.status==="available"?"Available":"Unlocked"}</strong></p>
            <ul>{status.requirements.map(label=><li key={label}>{status.missing.includes(label)?"Pending: ":"Met: "}{label}</li>)}</ul>
            {status.status==="available"&&<button onClick={()=>buyTechnology(id)} disabled={!status.affordable} data-testid={`unlock-${id}`}>Unlock {definition.label} — {money(definition.costCents)}</button>}
            {status.status==="available"&&!status.affordable&&<p>Insufficient credits to purchase.</p>}
          </article>;
        })}
      </section>}
      <h3>Iron deposits</h3><p>{DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p><h3>Coal deposits</h3><p>{COAL_DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p>{game.chapterII?.started&&<><h3>Copper deposit</h3><p>{COPPER_DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p><h3>Silicon deposit</h3><p>{SILICON_DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p></>}
    </aside><main className="center"><div className="board-title"><span>SECTOR MAP · 12 × 12</span><span>Tick {game.tick} · {game.paused?"PAUSED":"RUNNING"}</span></div>
      <Board state={game} tool={tool} direction={direction} selectedId={selected} onTile={tile} onDragRotate={directRotate}/><p className="tip">M: iron mine · C: coal mine · F: furnace · A: assembler · S: advanced furnace · B: conveyor · $: terminal</p></main>
      <aside className={"inspector"+(mobilePanel==="inspector"?" mobile-open":"")} aria-label="Inspector and diagnostics panel"><h2>Inspector</h2>{selectedEntity?<><h3>{DEFINITIONS[selectedEntity.kind].label}</h3><dl><dt>Position</dt><dd>({selectedEntity.x}, {selectedEntity.y})</dd><dt>Facing</dt><dd data-testid="selected-facing">{selectedEntity.direction}</dd><dt>Status</dt><dd>{game.paused?"paused":selectedEntity.status}</dd><dt>Output</dt><dd>{selectedEntity.output??selectedEntity.belt??"empty"}</dd>{(["furnace","assembler","advanced_furnace","circuit_fabricator"].includes(selectedEntity.kind))&&Object.entries(selectedEntity.kind==="furnace"?RECIPES.iron_ingot.input:selectedEntity.kind==="assembler"?RECIPES.gear.input:selectedEntity.kind==="advanced_furnace"?RECIPES.steel.input:RECIPES.circuit.input).map(([item,required])=><Fragment key={item}><dt>{item.replaceAll("_"," ")} buffer</dt><dd>{selectedEntity.inputBuffers?.[item as Item]??0}/4 (needs {required})</dd></Fragment>)}
        <dt>Cycle</dt><dd>{selectedEntity.cycle===null?"idle":selectedEntity.cycle+" ticks remaining"}</dd></dl>
        <section aria-label="Selected structure diagnostics" data-testid="entity-diagnostics" className="diagnostic-panel">
          <h3>Trailing 60 active ticks</h3>
          {machineCounters?<>
            <p>Observed {machineCounters.ticks}/60 active ticks.</p>
            {selectedEntity.kind==="conveyor"?
              <p>Moved: {machineCounters.conveyorMoves} items; occupied but stalled: {machineCounters.conveyorStalledTicks} ticks.</p>:
              selectedEntity.kind==="sell_terminal"?
                <p>Terminal intake: {terminalCounters.totalSales} items across {terminalCounters.ticks} ticks.</p>:
                <dl>
                  <dt>Processing</dt><dd>{Math.round(100*machineCounters.workingTicks/machineCounters.ticks)}% ({machineCounters.workingTicks} ticks)</dd>
                  <dt>Missing inputs</dt><dd>{Math.round(100*machineCounters.inputStarvedTicks/machineCounters.ticks)}% ({machineCounters.inputStarvedTicks} ticks)</dd>
                  <dt>Blocked output</dt><dd>{Math.round(100*machineCounters.outputBlockedTicks/machineCounters.ticks)}% ({machineCounters.outputBlockedTicks} ticks)</dd>
                  <dt>Completed units</dt><dd>{machineCounters.completedUnits} ({machineCounters.completedPer60Ticks.toFixed(1)}/60 ticks)</dd>
                </dl>}
          </>:<p>Collecting active-tick diagnostic data.</p>}
          <p data-testid="diagnostic-hint">{diagnosticHint(game,selectedEntity.id)}</p>
        </section>
        {["furnace","assembler","advanced_furnace"].includes(selectedEntity.kind)&&<p>Recipe: {selectedEntity.kind==="furnace"?"2 iron ore → 1 iron ingot (4 ticks)":selectedEntity.kind==="assembler"?"2 iron ingots → 1 gear (5 ticks)":selectedEntity.kind==="advanced_furnace"?"2 iron ingots + 1 coal → 1 steel (8 ticks)":"2 copper ore + 1 silicon → 1 circuit (6 powered ticks)"}</p>}
        {selectedEntity.reservedInputs&&Object.values(selectedEntity.reservedInputs).some(v=>v>0)&&<p>Reserved inputs: {Object.entries(selectedEntity.reservedInputs).map(([item,count])=>`${item}: ${count}`).join(", ")}</p>}
        {COAL_DEPOSITS.some(d=>d.x===selectedEntity.x&&d.y===selectedEntity.y)&&selectedEntity.kind!=="coal_mine"&&<p>A coal deposit is beneath this structure. Demolish it to build a coal mine.</p>}
        {selectedEntity.kind!=="sell_terminal"&&<><button onClick={()=>{const r=turn(latest.current!,selectedEntity.id);setMessage(r.message);if(r.ok)persist(r.state,{kind:"turn",entityKind:selectedEntity.kind,x:selectedEntity.x,y:selectedEntity.y});}}>Rotate clockwise</button><button className="danger" onClick={()=>demolish(selectedEntity.id)}>Demolish</button></>}</>:<p>Select a machine or conveyor to view status and controls.</p>}
      <section aria-label="Terminal throughput" data-testid="terminal-throughput" className="diagnostic-panel">
        <h3>Terminal sales / trailing 60 active ticks</h3>
        <p>Observed: {terminalCounters.ticks}/60 ticks. Total intake: {terminalCounters.totalSales} items.</p>
        <p>{(["iron_ore","iron_ingot","coal","gear","steel"] as const).map(item=>
          `${item.replaceAll("_"," ")}: ${terminalCounters.sales[item]}`).join(" · ")}</p>
        <p>Per item: real terminal sales, not machine production. A terminal is not assumed congested.</p>
      </section>
      <section className="playtest-panel" aria-label="Optional local playtest" data-testid="playtest-panel">
        <button onClick={()=>setShowPlaytest(open=>!open)} aria-expanded={showPlaytest} aria-controls="playtest-controls">Local playtest {showPlaytest?"−":"+"}</button>
        {showPlaytest&&<div id="playtest-controls">
          <p>Opt-in. Data stays in this browser; no server telemetry. Export a JSON report when finished.</p>
          {!playtest?.active&&<button data-testid="start-playtest" onClick={()=>{
            savePlaytest(startPlaytest(latest.current!,Date.now(),BUILD_COMMIT));
          }}>{playtest?"Start new recording":"Start recording"}</button>}
          {playtest?.active&&<button data-testid="stop-playtest" onClick={()=>{
            savePlaytest(finishPlaytest(playtestRef.current!,latest.current!,Date.now()));
          }}>Stop recording</button>}
          {playtest&&<>
            <p data-testid="playtest-status">{playtest.active?"Recording":"Stopped"} · Active ticks: {playtest.activeTicks} · Wall time: {(playtest.wallMs/1000).toFixed(1)} s</p>
            <p>Paused: {(playtest.pausedMs/1000).toFixed(1)} s · Planning: {(playtest.planningMs/1000).toFixed(1)} s · Waiting for credits: {(playtest.waitingMs/1000).toFixed(1)} s · Waiting for mission/stability: {((playtest.waitingForMissionMs??0)/1000).toFixed(1)} s</p>
            <p>Power: {playtest.poweredTicks??0} fully powered ticks · {playtest.unpoweredTicks??0} underpowered ticks (observed nonzero demand only)</p>
            <p>Recorded build: {playtest.buildCommit??"unverified local build"} · Schema at start: {playtest.schemaVersion??"legacy"} · Rules at start: {playtest.missionRuleVersion??"legacy"}</p>
            <p>Commands: placed {playtest.commands.place}, rotated {playtest.commands.turn}, demolished {playtest.commands.demolish}, researched {playtest.commands.research}</p>
            {playtest.active&&<fieldset aria-label="Playtest time annotation">
              <legend>Classify current unpaused time (manual annotation)</legend>
              {(["unclassified","planning","waiting","waiting_mission"] as PlaytestActivity[]).map(activity=>
                <label key={activity}><input type="radio" name="playtest-activity"
                  checked={playtest.activity===activity} onChange={()=>
                    savePlaytest(annotatePlaytest(playtestRef.current!,activity,Date.now()))}/>
                  {activity==="waiting"?"Waiting for credits":activity==="waiting_mission"?"Waiting for mission/stability":activity==="planning"?"Planning / routing":"Unclassified"}
                </label>)}
            </fieldset>}
            <button data-testid="export-playtest" onClick={exportPlaytest}>Export local JSON report</button>
            <button onClick={()=>{if(window.confirm("Discard local playtest measurements?"))savePlaytest(null);}}>Discard recording</button>
          </>}
        </div>}
      </section>
      {selectedEntity?.kind==="coal_generator"&&<p>Fuel: {selectedEntity.fuelTicksRemaining??0}/12 powered ticks · Coal input: {selectedEntity.inputBuffers?.coal??0}</p>}
      {selectedEntity?.kind==="splitter"&&<p>Next outlet: {selectedEntity.splitterNext===0?"forward":"clockwise"} · Cargo: {selectedEntity.belt??"empty"}</p>}
      {game.power&&<section aria-label="Power diagnostics" data-testid="power-diagnostics" className="diagnostic-panel"><h3>Site-wide power</h3><p>Supply: {game.power.supply} · Demand: {game.power.demand} · Served: {game.power.served}</p><p>Unpowered processing: {game.power.unpoweredProcessingTicks} ticks · Burned coal: {game.power.coalBurned}</p></section>}
      {narrativeAvailable.length>0&&<section className="diagnostic-panel" aria-label="Prometheus transmissions" data-testid="chapter-transmissions">
        <h3>Prometheus transmissions</h3>
        <p>Read or replay unlocked messages at any time. Messages never interrupt production.</p>
        {narrativeAvailable.map(id=><button key={id} onClick={()=>openTransmission(id)}>
          {id==="opening"&&!game.chapterII?.storySeen?"Inspect Request":"Replay "+CHAPTER_TRANSMISSIONS[id].label}
        </button>)}
      </section>}
      <h2>Operations</h2>{foundryActive&&<button onClick={()=>{setReplayFoundry(true);setFoundryPanel(0);}}>Replay Foundry Directive</button>}<button onClick={()=>{setPanel(0);setHelp(true);}}>Help / Replay Intro</button><button className="danger" onClick={()=>void fresh()}>New Game / Factory Reset</button><p>No offline production. Hidden tabs pause automatically.</p>
      </aside></div>
    <footer data-testid="mission-hud"><div className="mission-hud-objectives"><small>OPERATIONS CONSOLE // {game.mission.activeId}</small><h2>{chapterCompleted?"First Signal Restored":mission.title}</h2><p>{game.tutorialEnabled?(chapterCompleted?"Prometheus archive: SECTOR 9 — SUBLEVEL 03. Continue optimizing your factory in sandbox mode.":objectiveHint):"Tutorial hints hidden."}</p>{narrativeAvailable.length>0&&<p data-testid="latest-transmission" className="transmission-notice">
        Latest archive dispatch: {CHAPTER_TRANSMISSIONS[narrativeAvailable[narrativeAvailable.length-1]].pages[0].heading}.
        Open Prometheus transmissions in Inspector to read or replay. Production continues.
      </p>}
      {throughputMission&&<section className="mission-throughput" aria-label="Mission throughput diagnostics" data-testid="mission-throughput">
        <h3>Live objective · trailing 60 active ticks</h3>
        <p>{currentWindow?"Complete 60-tick window":"Collecting mission-local window"}</p>
        <ul>
          <li>Gear sales: {currentWindow?.sales.gear??0}/{isM7?7:9} per 60 ticks</li>
          {isM7&&<li>Steel sales: {currentWindow?.sales.steel??0}/7 per 60 ticks</li>}
          {isM7&&<li>Operating profit: {money(currentWindow?.profitCents??0)}/175.00 Cr per 60 ticks</li>}
          {isM7&&<li>Advanced Smelting: {game.technologies?.advanced_smelting?"Unlocked":"Locked"}</li>}
          <li>Stable: {missionStreak}/120 consecutive qualifying ticks</li>
        </ul>
        <p data-testid="mission-bottleneck">{unmetRequirements[0]??"All conditions met in current window; maintain stable throughput."}</p>
      </section>}
      {activeChapterMission&&<section className="mission-throughput" aria-label="Chapter II objectives" data-testid="chapter-objectives"><h3>Chapter II objectives</h3>{game.mission.activeId==="M8"?<p>Copper sold: {chapterMetrics?.totals?.copper_ore??0}/10 · Silicon sold: {chapterMetrics?.totals?.silicon??0}/10</p>:game.mission.activeId==="M9"?<p>Circuits sold: {chapterMetrics?.totals?.circuit??0}/4 · Fabrication: {game.technologies?.circuit_fabrication?"Unlocked":"Locked"} · Power: {game.technologies?.industrial_power?"Unlocked":"Locked"}</p>:<><p>{chapterWindowProgress?"Complete 60-tick window":"Collecting 60 active mission ticks"}</p><ul><li>Circuits sold: {chapterWindowProgress?.sales.circuit??0}/11</li><li>Circuits produced: {chapterWindowProgress?.producedCircuits??0}/11</li><li>Steel sold: {chapterWindowProgress?.sales.steel??0}/5</li><li>Demand covered: {chapterWindowProgress?.coveredTicks??0}/57 of 60</li><li>Stable: {chapterMetrics?.streakTicks??0}/60 consecutive windows</li></ul></>}</section>}
      <div className="progress">{game.mission.activeId==="M2"?`${game.mission.soldOre} / 10 ore sold`:game.mission.activeId==="M3"?`${game.mission.soldIngot} / 20 ingots sold`:game.mission.activeId==="M4"?`${game.mission.profitStreakTicks} / 60 qualifying ticks`:game.mission.activeId==="M5"?`${game.mission.soldCoal??0} / 10 coal sold`:game.mission.activeId==="M6"&&!throughputMission?`${game.mission.soldGear??0} / 8 gears sold`:game.mission.activeId==="M7"&&!throughputMission?`${game.mission.soldSteel??0} / 8 steel sold`:""}</div></div>
      <div className="mission-hud-actions"><p role="status">{message}</p>{canBeginChapterII&&<button data-testid="begin-chapter-ii" onClick={()=>{
        const result=beginChapterII(latest.current!);
        setMessage(result.message);if(result.ok){persist(result.state);setShowTechnology(true);}
      }}>Begin Chapter II</button>}<button onClick={()=>{const n=structuredClone(game);n.tutorialEnabled=!n.tutorialEnabled;persist(n);}}>{game.tutorialEnabled?"Hide hints":"Show hints"}</button></div></footer>
    {activeTransmission&&!game.introOpen&&!help&&<div className="overlay" data-testid="chapter-transmission-overlay"><section className="story" role="dialog" aria-modal="true" aria-label="Chapter II Transmission">
      <small>{transmissionPage+1} / {activeTransmission.pages.length} · PROJECT PROMETHEUS</small>
      <h1>{activeTransmission.pages[transmissionPage].heading}</h1>
      <p>{activeTransmission.pages[transmissionPage].text}</p>
      <div className="actions">
        {transmissionPage>0&&<button onClick={()=>setTransmissionPage(p=>p-1)}>Previous Transmission</button>}
        {transmissionPage<activeTransmission.pages.length-1&&<button onClick={()=>setTransmissionPage(p=>p+1)}>Next Transmission</button>}
        <button onClick={closeTransmission}>Return to Factory</button>
        <button onClick={closeTransmission}>Skip Transmission</button>
      </div>
    </section></div>}
    {foundryStoryOpen&&!game.introOpen&&!help&&<div className="overlay"><section className="story" role="dialog" aria-modal="true" aria-label="Foundry Directive"><small>{foundryPanel+1} / 3 · PROMETHEUS ARCHIVE</small><h1>{FOUNDRY_NARRATIVE[foundryPanel][0]}</h1><p>{game.missionRuleVersion===2&&foundryPanel===2
    ?"Sell coal, manufacture gears, then synchronize iron ingots and coal to produce steel. The archive remains sealed until the foundry proves its capacity."
    :FOUNDRY_NARRATIVE[foundryPanel][1]}</p><div className="actions">{foundryPanel>0&&<button onClick={()=>setFoundryPanel(p=>p-1)}>Previous</button>}{foundryPanel<2&&<button onClick={()=>setFoundryPanel(p=>p+1)}>Next</button>}<button onClick={closeFoundry}>Close / Return</button><button onClick={closeFoundry}>Skip Directive</button></div></section></div>}
    {(game.introOpen||help)&&<div className="overlay"><section className="story" role="dialog" aria-modal="true"><small>{panel+1} / 3 · SECTOR 9 ARCHIVE</small><h1>{NARRATIVE[panel][0]}</h1><p>{NARRATIVE[panel][1]}</p><div className="actions">{panel>0&&<button onClick={()=>setPanel(p=>p-1)}>Previous</button>}{panel<2&&<button onClick={()=>setPanel(p=>p+1)}>Next</button>}<button onClick={()=>{if(help){setHelp(false);return;}go();}}> {help?"Close / Return":"Begin Operations"}</button>{!help&&<button onClick={go}>Skip Introduction</button>}</div></section></div>}
  </div>;
}
