import {Fragment,useCallback,useEffect,useRef,useState} from "react";
import {begin,place,remove,reset,setPause,setSplitterMode,turn,face} from "../game/commands";
import {entityDiagnostics,terminalDiagnostics,diagnosticHint} from "../game/diagnostics";
import {acceptChapterIIIContract,beginChapterIII,chooseChapterIIIRoute} from "../game/chapterThree";
import {beginChapterIV} from "../game/chapterFour";
import {ChapterFourPanel} from "./ChapterFourPanel";
import {ChapterThreePanel} from "./ChapterThreePanel";
import {chapterPlaytestSlot,fetchChapterCheckpoint} from "../persistence/chapterPlaytest";
import type {ChapterPlaytestOrigin} from "../game/chapterPlaytest";
import {ChapterPlaytestPicker} from "./ChapterPlaytestPicker";
import {ConfirmationDialog} from "./ConfirmationDialog";
import {beginChapterII} from "../game/chapterTwo";
import {TransmissionDialog} from "./TransmissionDialog";
import {StoryDialog} from "./StoryDialog";
import {FactoryDialog} from "./FactoryDialog";
import {MissionBriefing} from "./MissionBriefing";
import {BaseMissionPanel} from "./BaseMissionPanel";
import {OperationsConsole,OperationsHud} from "./OperationsHud";
import {ConstructionTools,toolLabel} from "./ConstructionTools";
import {CHAPTER_TRANSMISSIONS,availableTransmissions,isChapterIIITransmission,type ChapterTransmissionId} from "../game/chapterNarrative";
import {BUILD_COMMIT} from "./buildProvenance";
import {TECHNOLOGIES,TECHNOLOGY_ORDER,CHAPTER_TECHNOLOGY_ORDER,technologyStatus,purchaseTechnology,type AnyTechnologyId} from "../game/technologies";
import {createGame,DEFINITIONS,DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,RECIPES,money,rotate,stats,type Direction,type GameState,type Kind,type Item,type SplitterMode} from "../domain/model";
import {tick} from "../simulation/engine";
import {loadGame,saveGame,restartGame} from "../persistence/indexedDb";
import {Board,type Tool} from "../rendering/Board";
import {splitterOutlets} from "../rendering/splitterOutlets";
import {startPlaytest,resumePlaytest,advancePlaytest,annotatePlaytest,recordPlaytestCommand,finishPlaytest,buildPlaytestReport,activePlaytestWallMs,isPlaytestSession,chapterPlaytestRecorderKey,discardChapterPlaytestRecording,type PlaytestSession,type PlaytestCommand,type PlaytestActivity} from "./playtest";
import {createSimulationClock,type SimulationSpeed} from "./simulationClock";
const PLAYTEST_KEY="sector-nine-v0.3-local-playtest";
const FOUNDRY_NARRATIVE=[
 ["OPERATIONS DIRECTIVE // FOUNDRY RESTORATION","Your first deliveries have restored confidence in Sector 9. A retired foundry blueprint has surfaced in the maintenance archive. It references coal-fired metallurgy and mechanical assemblies once used by Project Prometheus."],
 ["CONDITIONAL AUTHORIZATION","Corporate authorization is conditional. Purchase technology using production profits. Coal Extraction costs 80 Cr, Mechanical Components 120 Cr, and Advanced Smelting 180 Cr."],
 ["THE OLD FOUNDRY","Deliver coal first, then expand gear production instead of merely waiting for eight sales. Advanced steel must operate alongside gears, with profit sustained for two full minutes. Inspect starvation and blocked outputs to plan rerouting. The archive remains sealed until the foundry proves its capacity."]
] as const;
const NARRATIVE=[
 ["CORPORATE OPERATIONS // SECTOR 9","Your predecessor's industrial complex has been idle for 312 days. We have authorized a limited restart budget: 300 Cr."],
 ["FINAL OPERATIONS NOTICE","The colony needs material deliveries. Headquarters needs profit. Restore production, fulfill the first order, and prove this facility is worth saving."],
 ["MAINTENANCE ARCHIVE","An archived maintenance record mentions PROJECT PROMETHEUS. Access denied. Restore production before requesting clearance."]
] as const;
export default function App(){
  const [chapterMode]=useState(()=>new URLSearchParams(window.location.search).has("playtest"));
  const chapterStart=useRef<{origin:ChapterPlaytestOrigin;epoch:number}|null>(null);
  const [showChapterPicker,setShowChapterPicker]=useState(false);
  const [confirmChapterReset,setConfirmChapterReset]=useState(false);
  const [chapterResetError,setChapterResetError]=useState<string>();
  const recorderKey=()=>chapterStart.current?chapterPlaytestRecorderKey(chapterStart.current.epoch):PLAYTEST_KEY;
  useEffect(()=>{
    const refreshRestoredPage=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload();};
    window.addEventListener("pageshow",refreshRestoredPage);
    return ()=>window.removeEventListener("pageshow",refreshRestoredPage);
  },[]);
  const [game,setGame]=useState<GameState|null>(null);
  const latest=useRef<GameState|null>(null);
  const [tool,setTool]=useState<Tool>("select");
  const [direction,setDirection]=useState<Direction>("E");
  const [selected,setSelected]=useState<number|null>(null);
  const [message,setMessage]=useState("Welcome to Sector 9.");
  const [error,setError]=useState<string|null>(null);
  const [help,setHelp]=useState(false);
  const [replayFoundry,setReplayFoundry]=useState(false);
  const [transmission,setTransmission]=useState<ChapterTransmissionId|null>(null);
  const [showBriefing,setShowBriefing]=useState(false);
  const [showArchive,setShowArchive]=useState(false);
  const [showOperationsMenu,setShowOperationsMenu]=useState(false);
  const [showTechnology,setShowTechnology]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<"construction"|"inspector"|null>(null);
  const [ready,setReady]=useState(false);
  const resetting=useRef(false);
  const [speed,setSpeed]=useState<SimulationSpeed>(1);
  const speedRef=useRef<SimulationSpeed>(1);
  const clockRef=useRef<ReturnType<typeof createSimulationClock>|null>(null);
  const syncClock=(state:GameState)=>{
    clockRef.current?.update(!resetting.current&&!state.paused&&!state.introOpen&&!document.hidden,speedRef.current);
  };
  const [confirmRestart,setConfirmRestart]=useState(false);
  const [saveStatus,setSaveStatus]=useState<"Saving…"|"Saved"|null>(null);
  const saveRequest=useRef(0);
  const queueSave=useCallback((state:GameState)=>{
    if(resetting.current)return;
    const request=++saveRequest.current;
    setSaveStatus("Saving…");
    const start=chapterStart.current;
    const saved=start?chapterPlaytestSlot.save({game:state,origin:start.origin}):saveGame(state);
    void saved.then(()=>{
      if(request===saveRequest.current)setSaveStatus("Saved");
    }).catch(error=>{
      if(request===saveRequest.current)setError(String(error));
    });
  },[]);
  const [showPlaytest,setShowPlaytest]=useState(false);
  const [playtest,setPlaytest]=useState<PlaytestSession|null>(null);
  const playtestRef=useRef<PlaytestSession|null>(null);
  const savePlaytest=(session:PlaytestSession|null)=>{
    playtestRef.current=session;setPlaytest(session);
    try{if(session)localStorage.setItem(recorderKey(),JSON.stringify(session));
      else localStorage.removeItem(recorderKey());
    }catch{setMessage("Local playtest storage unavailable. Export your report before closing the tab.");}
  };
  const observePlaytest=(next:GameState,command?:PlaytestCommand)=>{
    const session=playtestRef.current;
    if(!session?.active)return;
    const now=Date.now();
    let updated=advancePlaytest(session,next,now,speedRef.current,document.hidden);
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
    const next=f(s);latest.current=next;setGame(next);syncClock(next);observePlaytest(next);
  },[]);
  useEffect(()=>{
    let current=true;
    async function loadSession(){
      let initial:GameState;
      if(chapterMode){
        const {snapshot,epoch}=await chapterPlaytestSlot.load();
        if(!current)return;
        if(!snapshot)throw Error("No saved chapter playtest. Open Chapter Playtest to choose a start.");
        chapterStart.current={origin:snapshot.origin,epoch};
        initial=snapshot.game;
      }else{
        initial=await loadGame()??createGame();
        if(!current)return;
      }
      latest.current=initial;setGame(initial);
      try{
        const saved=localStorage.getItem(recorderKey());
        if(saved){
          const parsed:unknown=JSON.parse(saved);
          if(!isPlaytestSession(parsed)||
            (chapterMode&&parsed.chapterOrigin?.checkpointId!==chapterStart.current?.origin.checkpointId))
            throw new Error("Invalid optional playtest state");
          const session=resumePlaytest(parsed,initial,Date.now(),document.hidden);
          playtestRef.current=session;setPlaytest(session);setShowPlaytest(true);
        }
      }catch{
        // Recorder corruption or unavailable browser storage must not interrupt gameplay.
        try{localStorage.removeItem(recorderKey());}catch{/* Recording remains optional. */}
      }
      setReady(true);
    }
    void loadSession().catch(error=>{if(current){setError(String(error));setReady(true);}});
    return ()=>{current=false;};
  },[chapterMode]);
  useEffect(()=>{
    if(!ready||!latest.current||error)return;
    const clock=createSimulationClock(()=>{
      const s=latest.current;
      if(!s||resetting.current||s.paused||s.introOpen||document.hidden)return;
      const next=tick(s);latest.current=next;setGame(next);observePlaytest(next);
      const contractCompleted=next.chapterIII?.completed.length!==s.chapterIII?.completed.length;
      if(contractCompleted)setMessage("Contract complete. Archive entry unlocked.");
      const chapterIVAdvanced=next.chapterIV?.activeId!==s.chapterIV?.activeId;
      if(chapterIVAdvanced)setMessage(next.chapterIV?.activeId==="M15"
        ?"M14 complete. Restore Service started."
        :"M15 complete. Station reply received.");
      const copperShipmentAdvanced=next.chapterIV?.copperShipmentTicks.length!==s.chapterIV?.copperShipmentTicks.length;
      if(contractCompleted||chapterIVAdvanced||copperShipmentAdvanced||next.tick%10===0)queueSave(next);
    });
    clockRef.current=clock;
    syncClock(latest.current);
    return ()=>{clock.dispose();clockRef.current=null;};
  },[ready,error,queueSave]);
  useEffect(()=>{
    const onVisibility=()=>{
      const current=latest.current;
      if(!current||resetting.current)return;
      if(document.hidden){
        change(s=>setPause(s,true));
        queueSave(latest.current!);
      }else{
        syncClock(current);
        observePlaytest(current);
      }
    };
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>document.removeEventListener("visibilitychange",onVisibility);
  },[change,queueSave]);
  const persist=(s:GameState,command?:PlaytestCommand)=>{
    if(resetting.current)return;latest.current=s;setGame(s);syncClock(s);observePlaytest(s,command);
    queueSave(s);
  };
  const selectSpeed=(next:SimulationSpeed)=>{
    const current=latest.current;
    if(!current||resetting.current||next===speedRef.current)return;
    speedRef.current=next;
    setSpeed(next);
    syncClock(current);
    observePlaytest(current);
  };
  const selectedEntity=game?.entities.find(e=>e.id===selected);
  const directRotate=(id:number,desired:Direction)=>{
    const source=latest.current;if(!source||tool==="demolish")return;
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
      if(document.querySelector("dialog:modal,.overlay")||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLButtonElement||e.target instanceof HTMLSelectElement||game?.introOpen||error)return;
      if(e.key.toLowerCase()==="r"){e.preventDefault();rotateChoice();}
      if(e.key==="Escape"){setTool("select");setSelected(null);}
      if(e.key==="Delete"&&selectedEntity)demolish(selectedEntity.id);
      if(e.code==="Space"&&!(e.target instanceof Element&&e.target.closest(".mission-hud-objectives[tabindex]"))){e.preventDefault();change(s=>{const n=setPause(s,!s.paused);queueSave(n);return n;});}
    };
    window.addEventListener("keydown",listener);return ()=>window.removeEventListener("keydown",listener);
  });
  const tile=(x:number,y:number):number|null=>{
    const current=latest.current;
    if(!current||current.introOpen||resetting.current)return null;
    const entity=current.entities.find(e=>e.x===x&&e.y===y);
    if(tool==="select"){setSelected(entity?.id??null);return null;}
    if(tool==="demolish"){if(entity)demolish(entity.id);else setMessage("No object to demolish.");return null;}
    const result=place(current,tool,x,y,direction);
    setMessage(result.message);
    if(!result.ok)return null;
    const id=result.state.nextId-1;
    persist(result.state,{kind:"place",entityKind:tool,x,y});
    setSelected(id);
    return id;
  };
  const closeFoundry=()=>{const s=latest.current;if(!s)return;const n=structuredClone(s);n.foundryStorySeen=true;persist(n);setReplayFoundry(false);};
  const openTransmission=(id:ChapterTransmissionId)=>setTransmission(id);
  const closeTransmission=()=>{
    if(transmission==="opening"&&latest.current?.chapterII?.started&&!latest.current.chapterII.storySeen){
      const next=structuredClone(latest.current);next.chapterII!.storySeen=true;persist(next);
    }
    setTransmission(null);
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
  const go=()=>{change(begin);const s=latest.current;if(s)queueSave(s);};
  const fresh=async()=>{if(resetting.current)return;
    resetting.current=true;
    clockRef.current?.dispose();
    saveRequest.current++;
    try{const s=reset();await restartGame(s);speedRef.current=1;setSpeed(1);setSaveStatus("Saved");setConfirmRestart(false);savePlaytest(null);setShowPlaytest(false);latest.current=s;setGame(s);setError(null);setSelected(null);setTool("select");setShowTechnology(false);setReplayFoundry(false);setTransmission(null);setMessage("New factory started.");}catch(e){setError(String(e));}finally{resetting.current=false;}};
  const navigateSession=(playtest:boolean)=>{
    resetting.current=true;
    clockRef.current?.dispose();
    const url=new URL(window.location.href);
    if(playtest)url.searchParams.set("playtest","");
    else url.searchParams.delete("playtest");
    if(url.href===window.location.href)window.location.reload();
    else window.location.assign(url);
  };
  const enterChapterPlaytest=async(commitStart?:()=>Promise<void>)=>{
    if(resetting.current)return;
    resetting.current=true;
    clockRef.current?.update(false,speedRef.current);
    try{
      const current=latest.current;
      if(!chapterMode&&current&&!current.introOpen&&!error){
        const paused=setPause(current,true);
        latest.current=paused;setGame(paused);
        if(!current.paused)observePlaytest(paused);
        try{await saveGame(paused);}
        catch(error){throw Error("Could not save the current campaign before switching: "+String(error));}
      }
      await commitStart?.();
      navigateSession(true);
    }catch(error){
      resetting.current=false;
      throw error;
    }
  };
  const leaveChapterPlaytest=async()=>{
    const start=chapterStart.current;
    const current=latest.current;
    if(resetting.current||!start||!current)return;
    resetting.current=true;
    clockRef.current?.update(false,speedRef.current);
    const paused=setPause(current,true);
    latest.current=paused;setGame(paused);observePlaytest(paused);
    try{
      await chapterPlaytestSlot.save({game:paused,origin:start.origin});
      navigateSession(false);
    }catch(error){
      setError(String(error));
      resetting.current=false;
    }
  };
  const restartChapterPlaytest=async()=>{
    const start=chapterStart.current;
    const current=latest.current;
    if(resetting.current||!start||!current)return;
    resetting.current=true;
    clockRef.current?.update(false,speedRef.current);
    try{
      const checkpoint=await fetchChapterCheckpoint(start.origin.checkpointId);
      await chapterPlaytestSlot.restart(checkpoint,{expectedEpoch:start.epoch});
      discardChapterPlaytestRecording(start.epoch);
      navigateSession(true);
    }catch(error){
      resetting.current=false;
      syncClock(current);
      setChapterResetError(String(error));
    }
  };
  const chapterPicker=showChapterPicker&&<ChapterPlaytestPicker allowResume={!chapterMode} onClose={()=>setShowChapterPicker(false)}
    onEnter={enterChapterPlaytest}/>;
  if(!ready)return <main>Loading Sector 9...</main>;
  if(error&&chapterMode)return <main className="error">
    <h1>Chapter playtest unavailable</h1><p role="alert">{error}</p>
    <button onClick={()=>navigateSession(false)}>Return to Campaign</button>
    <button onClick={()=>setShowChapterPicker(true)}>Choose a Chapter Playtest</button>
    {chapterPicker}
  </main>;
  if(error)return <main className="error">
    <h1>Save error</h1><p role="alert">{error}</p>
    <p>Cancel keeps any stored data intact. Starting a new campaign replaces the saved factory.</p>
    <button onClick={()=>setConfirmRestart(true)}>Start new game</button>
    <button onClick={()=>setShowChapterPicker(true)}>Chapter Playtest</button>
    {chapterPicker}
    {confirmRestart&&<ConfirmationDialog title="Confirm restart" confirmLabel="Replace save and restart"
      description={<p>Replace the stored save and restart at Mission 1? This permanently deletes your saved progress.</p>}
      onCancel={()=>setConfirmRestart(false)} onConfirm={()=>{setConfirmRestart(false);void fresh();}}/>}
  </main>;
  if(!game)return null;
  const runContractCommand=(command:(state:GameState)=>ReturnType<typeof beginChapterIII>)=>{
    if(!latest.current||resetting.current)return;
    const result=command(latest.current);
    setMessage(result.message);
    if(result.ok)persist(result.state);
  };
  const kpi=stats(game);
  const narrativeAvailable=availableTransmissions(game);
  const latestDispatch=narrativeAvailable.filter(isChapterIIITransmission).at(-1);
  const activeTransmission=transmission&&narrativeAvailable.includes(transmission)?CHAPTER_TRANSMISSIONS[transmission]:null;
  const chapterCompleted=game.chapterII?.started&&game.chapterII.completed&&game.mission.activeId==="DONE";
  const machineCounters=selectedEntity?entityDiagnostics(game,selectedEntity.id):null;
  const terminalCounters=terminalDiagnostics(game);
  const sample=game.diagnostics?.samples.at(-1);
  const selectedStalled=!!selectedEntity&&(
    (selectedEntity.belt!==null&&sample?.tick===game.tick&&sample.entities[selectedEntity.id]?.conveyorStalledTicks===1)||
    (selectedEntity.output!==null&&selectedEntity.status==="blocked_output"));
  const toolName=toolLabel(tool);
  const depositsStatus=game.chapterII?.started?([
    {name:"Copper",extractor:"copper_mine",coords:COPPER_DEPOSITS[0]},
    {name:"Silicon",extractor:"silicon_extractor",coords:SILICON_DEPOSITS[0]}
  ] as const).map(({name,extractor,coords})=>{
    const occupied=game.entities.find(e=>e.x===coords.x&&e.y===coords.y);
    return {name,coords,occupied,extractor};
  }):[];
  const canBeginChapterII=game.mission.activeId==="DONE"&&!game.chapterII?.started&&!game.chapterII?.completed&&
    game.technologies?.coal_extraction&&game.technologies?.mechanical_components&&game.technologies?.advanced_smelting;
  const foundryActive=["M5","M6","M7","DONE"].includes(game.mission.activeId);
  const foundryStoryOpen=(["M5","M6","M7"].includes(game.mission.activeId)&&!game.foundryStorySeen)||(foundryActive&&replayFoundry);
  return <div className="app">
    <OperationsHud game={game} speed={speed} onSpeed={selectSpeed} onMenu={()=>setShowOperationsMenu(true)}
      onToggleClock={()=>change(s=>{const n=setPause(s,!s.paused);queueSave(n);return n;})}/>
    <div className="mobile-panel-actions" aria-label="Factory panels">
      <button aria-expanded={mobilePanel==="construction"} onClick={()=>setMobilePanel(v=>v==="construction"?null:"construction")}>
        Construction panel · {toolName}
      </button>
      <button aria-expanded={mobilePanel==="inspector"} onClick={()=>setMobilePanel(v=>v==="inspector"?null:"inspector")}>
        Inspector panel{selectedStalled&&" · Blocked"}
      </button>
    </div>
    <div className="workspace"><aside className={"palette"+(mobilePanel==="construction"?" mobile-open":"")} aria-label="Construction and technology panel"><h2>Construction</h2>
      <ConstructionTools game={game} tool={tool} onSelect={setTool} onLocked={required=>{
        setMessage(required?`Unlock ${TECHNOLOGIES[required].label} in Technology first.`:"Complete M2 to construct Basic Furnace.");
        setShowTechnology(true);
      }}/>
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
      <h3>Iron deposits</h3><p>{DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p><h3>Coal deposits</h3><p>{COAL_DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p>{game.chapterII?.started&&<><section data-testid="chapter-deposit-status" aria-label="Chapter II deposits" className="deposit-status">
      <h3>New mineral deposits</h3>
      {depositsStatus.map(({name,coords,occupied,extractor})=><p key={name}>
        <strong>{name} ({coords.x},{coords.y})</strong> — {occupied
          ?occupied.kind===extractor?DEFINITIONS[occupied.kind].label+" installed."
          :`occupied by ${DEFINITIONS[occupied.kind].label}. Clear this tile with Demolish, then build the extractor; existing inventory is not moved automatically.`
          :"available for an extractor after Resource Surveying."}
      </p>)}
    </section></>}
    </aside><main className="center"><div className="board-title"><span>SECTOR MAP · 12 × 12</span><span>Tick {game.tick} · {game.paused?"PAUSED":"RUNNING"}</span></div>
      <Board state={game} tool={tool} direction={direction} selectedId={selected} onTile={tile} onDragRotate={directRotate}/>
      <div className="board-context">
        <p>Tool · {toolName}{selectedStalled&&<strong className="fault"> · ! Output blocked</strong>}</p>
        {chapterStart.current&&<span>Playtest · {chapterStart.current.origin.chapter}
          {chapterStart.current.origin.recipientRoute&&" · "+chapterStart.current.origin.recipientRoute}</span>}
      </div></main>
      <aside className={"inspector"+(mobilePanel==="inspector"?" mobile-open":"")} aria-label="Inspector and diagnostics panel"><h2>Inspector</h2>{selectedEntity?<><h3 className="inspected-structure">{DEFINITIONS[selectedEntity.kind].label}</h3>
      {selectedStalled&&<p className="fault"><strong>! Output blocked</strong></p>}<dl><dt>Position</dt><dd>({selectedEntity.x}, {selectedEntity.y})</dd><dt>Facing</dt><dd data-testid="selected-facing">{selectedEntity.direction}</dd><dt>Status</dt><dd>{selectedStalled?"Output blocked":selectedEntity.status.replaceAll("_"," ")}{game.paused&&" · paused"}</dd><dt>Output</dt><dd>{selectedEntity.output??selectedEntity.belt??"empty"}</dd>{(["furnace","assembler","advanced_furnace","circuit_fabricator"].includes(selectedEntity.kind))&&Object.entries(selectedEntity.kind==="furnace"?RECIPES.iron_ingot.input:selectedEntity.kind==="assembler"?RECIPES.gear.input:selectedEntity.kind==="advanced_furnace"?RECIPES.steel.input:RECIPES.circuit.input).map(([item,required])=><Fragment key={item}><dt>{item.replaceAll("_"," ")} buffer</dt><dd>{selectedEntity.inputBuffers?.[item as Item]??0}/4 (needs {required})</dd></Fragment>)}
        <dt>Cycle</dt><dd>{selectedEntity.cycle===null?"idle":selectedEntity.cycle+" ticks remaining"}</dd>
        {selectedEntity.kind==="circuit_fabricator"&&game.power&&<><dt>Site power served</dt><dd>{game.power.served} / {game.power.demand}</dd></>}
        </dl>
        <section aria-label="Selected structure diagnostics" data-testid="entity-diagnostics" className="diagnostic-panel">
          <h3>Trailing 60 simulation ticks</h3>
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
        {["furnace","assembler","advanced_furnace","circuit_fabricator"].includes(selectedEntity.kind)&&<p>Recipe: {selectedEntity.kind==="furnace"?"2 iron ore → 1 iron ingot (4 ticks)":selectedEntity.kind==="assembler"?"2 iron ingots → 1 gear (5 ticks)":selectedEntity.kind==="advanced_furnace"?"2 iron ingots + 1 coal → 1 steel (8 ticks)":"2 copper ore + 1 silicon → 1 circuit (6 powered ticks)"}</p>}
        {selectedEntity.reservedInputs&&Object.values(selectedEntity.reservedInputs).some(v=>v>0)&&<p>Reserved inputs: {Object.entries(selectedEntity.reservedInputs).map(([item,count])=>`${item}: ${count}`).join(", ")}</p>}
        {depositsStatus.filter(deposit=>deposit.occupied?.id===selectedEntity.id).map(deposit=>
          <p key={deposit.name}>{deposit.name} deposit beneath this structure.</p>)}
        {COAL_DEPOSITS.some(d=>d.x===selectedEntity.x&&d.y===selectedEntity.y)&&selectedEntity.kind!=="coal_mine"&&<p>A coal deposit is beneath this structure. Demolish it to build a coal mine.</p>}
        {selectedEntity.kind==="splitter"&&<>
          {game.chapterIV&&<label className="splitter-routing">Splitter routing
            <select value={selectedEntity.splitterMode??"alternating"} onChange={event=>{
              const mode=event.currentTarget.value as SplitterMode;
              runContractCommand(state=>setSplitterMode(state,selectedEntity.id,mode));
            }}>
              <option value="alternating">Alternating</option>
              {splitterOutlets(selectedEntity.direction).map(({mode,direction})=><option key={mode} value={mode}>
                {mode==="forward"?"Priority forward":"Priority clockwise"} ({direction})
              </option>)}
            </select>
          </label>}
          {!selectedEntity.splitterMode&&<p>Next outlet: {selectedEntity.splitterNext===0?"forward":"clockwise"}</p>}
          <p data-testid="splitter-cargo">Cargo: {selectedEntity.belt??"empty"}</p>
        </>}
        {selectedEntity.kind!=="sell_terminal"&&<><button onClick={()=>{const r=turn(latest.current!,selectedEntity.id);setMessage(r.message);if(r.ok)persist(r.state,{kind:"turn",entityKind:selectedEntity.kind,x:selectedEntity.x,y:selectedEntity.y});}}>Rotate clockwise</button><button className="danger" onClick={()=>demolish(selectedEntity.id)}>Demolish</button></>}</>:<p>Select a machine or conveyor to view status and controls.</p>}
      <section aria-label="Terminal throughput" data-testid="terminal-throughput" className="diagnostic-panel">
        <h3>Terminal sales / trailing 60 simulation ticks</h3>
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
            savePlaytest(startPlaytest(latest.current!,Date.now(),BUILD_COMMIT,speedRef.current,document.hidden,chapterStart.current?.origin));
          }}>{playtest?"Start new recording":"Start recording"}</button>}
          {playtest?.active&&<button data-testid="stop-playtest" onClick={()=>{
            savePlaytest(finishPlaytest(playtestRef.current!,latest.current!,Date.now(),document.hidden));
          }}>Stop recording</button>}
          {playtest&&<>
            <p data-testid="playtest-status">{playtest.active?"Recording":"Stopped"} · Active ticks: {playtest.activeTicks} · Wall time: {(playtest.wallMs/1000).toFixed(1)} s</p>
            <p>Active wall time: {(activePlaytestWallMs(playtest)/1000).toFixed(1)} s · Paused: {(playtest.pausedMs/1000).toFixed(1)} s · Planning: {(playtest.planningMs/1000).toFixed(1)} s · Waiting for credits: {(playtest.waitingMs/1000).toFixed(1)} s · Waiting for mission/stability: {((playtest.waitingForMissionMs??0)/1000).toFixed(1)} s · Reading: {((playtest.readingMs??0)/1000).toFixed(1)} s</p>
            <p>Power: {playtest.poweredTicks??0} fully powered ticks · {playtest.unpoweredTicks??0} underpowered ticks (observed nonzero demand only)</p>
            <p>Recorded build: {playtest.buildCommit??"unverified local build"} · Schema at start: {playtest.schemaVersion??"legacy"} · Rules at start: {playtest.missionRuleVersion??"legacy"}</p>
            <p>Commands: placed {playtest.commands.place}, rotated {playtest.commands.turn}, demolished {playtest.commands.demolish}, researched {playtest.commands.research}</p>
            {playtest.active&&<fieldset aria-label="Playtest time annotation">
              <legend>Classify current unpaused time (manual annotation)</legend>
              {(["unclassified","planning","waiting","waiting_mission","reading"] as PlaytestActivity[]).map(activity=>
                <label key={activity}><input type="radio" name="playtest-activity"
                  checked={playtest.activity===activity} onChange={()=>
                    savePlaytest(annotatePlaytest(playtestRef.current!,activity,Date.now()))}/>
                  {activity==="waiting"?"Waiting for credits":activity==="waiting_mission"?"Waiting for mission/stability":activity==="planning"?"Planning / routing":activity==="reading"?"Reading":"Unclassified"}
                </label>)}
            </fieldset>}
            <button data-testid="export-playtest" onClick={exportPlaytest}>Export local JSON report</button>
            <button onClick={()=>{if(window.confirm("Discard local playtest measurements?"))savePlaytest(null);}}>Discard recording</button>
          </>}
        </div>}
      </section>
      {kpi&&<section className="diagnostic-panel" aria-label="Operating account">
        <h3>Operating account</h3><p>Revenue / sim min · {money(kpi.revenueCents)}</p>
        <p>Operating cost / sim min · {money(kpi.costCents)}</p>
      </section>}
      {selectedEntity?.kind==="coal_generator"&&<p>Fuel: {selectedEntity.fuelTicksRemaining??0}/12 powered ticks · Coal input: {selectedEntity.inputBuffers?.coal??0}</p>}
      {game.power&&<section aria-label="Power diagnostics" data-testid="power-diagnostics" className="diagnostic-panel"><h3>Site-wide power</h3><p>Supply: {game.power.supply} · Demand: {game.power.demand} · Served: {game.power.served}</p><p>Unpowered processing: {game.power.unpoweredProcessingTicks} ticks · Burned coal: {game.power.coalBurned}</p></section>}
      {narrativeAvailable.length>0&&<section className="diagnostic-panel" aria-label="Prometheus transmissions" data-testid="chapter-transmissions">
        <h3>Prometheus transmissions</h3>
        <p>Read or replay unlocked messages at any time. Messages never interrupt production.</p>
        {narrativeAvailable.map(id=><button key={id} onClick={()=>openTransmission(id)}>
          {id==="opening"&&!game.chapterII?.storySeen?"Inspect Request":"Replay "+CHAPTER_TRANSMISSIONS[id].label}
        </button>)}
      </section>}
      {saveStatus&&<p data-testid="save-status">{saveStatus}</p>}
      </aside></div>
    <OperationsConsole onBriefing={()=>setShowBriefing(true)} onArchive={()=>setShowArchive(true)} actions={<>
      {chapterStart.current&&<>
        <div className="mission-session-actions">
          <button onClick={()=>void leaveChapterPlaytest()}>Return to Campaign</button>
          <button onClick={()=>{setChapterResetError(undefined);setConfirmChapterReset(true);}}>Reset Chapter Playtest</button>
        </div>
        {chapterResetError&&<p role="alert">{chapterResetError}</p>}
      </>}
      {!chapterMode&&!game.introOpen&&<button onClick={()=>setShowChapterPicker(true)}>Chapter Playtest</button>}
      <p role="status">{message}</p>
    </>}>
      {chapterCompleted?<>
        {!game.chapterIV&&<ChapterThreePanel game={game}
          dispatch={latestDispatch&&<button onClick={()=>openTransmission(latestDispatch)}>
            Read {CHAPTER_TRANSMISSIONS[latestDispatch].label}
          </button>}
          onStart={()=>runContractCommand(beginChapterIII)}
          onStartChapterIV={()=>runContractCommand(beginChapterIV)}
          onAccept={id=>runContractCommand(s=>acceptChapterIIIContract(s,id))}
          onChoose={route=>runContractCommand(s=>chooseChapterIIIRoute(s,route,true))}/>}
        <ChapterFourPanel chapter={game.chapterIV}/>
      </>:<BaseMissionPanel game={game} beginChapter={Boolean(canBeginChapterII)} onBegin={()=>{
          const result=beginChapterII(latest.current!);
          setMessage(result.message);if(result.ok){persist(result.state);setShowTechnology(true);}
        }}/>}
    </OperationsConsole>
    {showBriefing&&<MissionBriefing game={game} onClose={()=>setShowBriefing(false)}/>}
    {showArchive&&<FactoryDialog label="Transmission Archive" onClose={()=>setShowArchive(false)}>
      <h2>Transmission Archive</h2>
      {narrativeAvailable.length>0?<ul className="archive-entries">{narrativeAvailable.map(id=>
        <li key={id}><button onClick={()=>{setShowArchive(false);openTransmission(id);}}>
          {CHAPTER_TRANSMISSIONS[id].label}
        </button></li>)}</ul>:<p>New transmissions appear as the campaign progresses.</p>}
      <div className="actions"><button onClick={()=>setShowArchive(false)}>Close archive</button></div>
    </FactoryDialog>}
    {showOperationsMenu&&<FactoryDialog label="Operations Menu" onClose={()=>setShowOperationsMenu(false)}>
      <h2>Operations Menu</h2>
      <p>Space: run / pause · R: rotate · Esc: inspect · Delete: demolish</p>
      <p>Drag an existing structure to rotate it in the drag direction. Click an empty tile to build.</p>
      <p>Hidden tabs pause automatically. One tick is one simulation second.</p>
      <details className="font-credits">
        <summary>Font licenses</summary>
        <a target="_blank" rel="noreferrer" href={new URL("../../docs/specifications/art/v0.7-wp0/fonts/OFL-Barlow.txt",import.meta.url).href}>Barlow Semi Condensed</a>
        <a target="_blank" rel="noreferrer" href={new URL("../../docs/specifications/art/v0.7-wp0/fonts/OFL-Inter.txt",import.meta.url).href}>Inter</a>
      </details>
      <div className="actions">
        <button onClick={()=>{setShowOperationsMenu(false);setHelp(true);}}>Help / Replay Intro</button>
        {foundryActive&&<button onClick={()=>{setShowOperationsMenu(false);setReplayFoundry(true);}}>Replay Foundry Directive</button>}
        {!game.chapterIII&&<button onClick={()=>{
          const n=structuredClone(game);n.tutorialEnabled=!n.tutorialEnabled;persist(n);
        }}>{game.tutorialEnabled?"Hide hints":"Show hints"}</button>}
        <button onClick={()=>{
          setShowOperationsMenu(false);setShowPlaytest(true);setMobilePanel("inspector");
          requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-testid="playtest-panel"] > button')?.focus());
        }}>Local playtest recorder</button>
        {!chapterMode&&<button className="danger" onClick={()=>{
          if(window.confirm("Factory Reset? All progress and your save will be permanently deleted.")){
            setShowOperationsMenu(false);void fresh();
          }
        }}>New Game / Factory Reset</button>}
        <button onClick={()=>setShowOperationsMenu(false)}>Close menu</button>
      </div>
    </FactoryDialog>}
    {activeTransmission&&transmission&&!game.introOpen&&!help&&
      <TransmissionDialog key={transmission} transmission={activeTransmission}
        chapter={isChapterIIITransmission(transmission)?"III":transmission.startsWith("return-signal-")?"IV":"II"}
        onClose={closeTransmission}/>}
    {foundryStoryOpen&&!game.introOpen&&!help&&!showBriefing&&!showArchive&&!showOperationsMenu&&
      !showChapterPicker&&!confirmChapterReset&&!activeTransmission&&
      <StoryDialog label="Foundry Directive" archive="PROMETHEUS ARCHIVE" pages={FOUNDRY_NARRATIVE} onClose={closeFoundry}>
        <button onClick={closeFoundry}>Close / Return</button>
        <button onClick={closeFoundry}>Skip Directive</button>
      </StoryDialog>}
    {(game.introOpen||help)&&<StoryDialog label={help?"Opening Transmission Replay":"Sector 9 Introduction"}
      archive="SECTOR 9 ARCHIVE" pages={NARRATIVE} onClose={()=>{if(help)setHelp(false);}}>
      {help?<button onClick={()=>setHelp(false)}>Close / Return</button>:<>
        <button onClick={go}>Begin Operations</button>
        <button onClick={go}>Skip Introduction</button>
        <button onClick={()=>setShowChapterPicker(true)}>Chapter Playtest</button>
      </>}
    </StoryDialog>}
    {chapterPicker}
    {confirmChapterReset&&<ConfirmationDialog title="Reset Chapter Playtest" confirmLabel="Restore checkpoint"
      description={<p>Replace this playtest's progress and recording with its original checkpoint?</p>}
      onCancel={()=>setConfirmChapterReset(false)}
      onConfirm={()=>{setConfirmChapterReset(false);void restartChapterPlaytest();}}/>}
  </div>;
}
