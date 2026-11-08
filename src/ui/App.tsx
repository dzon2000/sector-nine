import {Fragment,useCallback,useEffect,useRef,useState} from "react";
import {begin,place,remove,reset,setPause,turn} from "../game/commands";
import {MISSIONS} from "../game/missions";
import {TECHNOLOGIES,TECHNOLOGY_ORDER,technologyStatus,purchaseTechnology,type TechnologyId} from "../game/technologies";
import {createGame,DEFINITIONS,DEPOSITS,COAL_DEPOSITS,RECIPES,money,rotate,stats,type Direction,type GameState,type Kind,type Item} from "../domain/model";
import {tick} from "../simulation/engine";
import {loadGame,saveGame,eraseGame} from "../persistence/indexedDb";
import {Board,type Tool} from "../rendering/Board";
const FOUNDRY_NARRATIVE=[
 ["OPERATIONS DIRECTIVE // FOUNDRY RESTORATION","Your first deliveries have restored confidence in Sector 9. A retired foundry blueprint has surfaced in the maintenance archive. It references coal-fired metallurgy and mechanical assemblies once used by Project Prometheus."],
 ["CONDITIONAL AUTHORIZATION","Corporate authorization is conditional. Purchase technology using production profits. Coal Extraction costs 80 Cr, Mechanical Components 120 Cr, and Advanced Smelting 180 Cr."],
 ["THE OLD FOUNDRY","Sell coal, manufacture gears, then synchronize iron ingots and coal to produce steel. The archive will remain sealed until the foundry proves its capacity."]
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
  const [showTechnology,setShowTechnology]=useState(false);
  const [foundryPanel,setFoundryPanel]=useState(0);
  const [ready,setReady]=useState(false);
  const resetting=useRef(false);
  const change=useCallback((f:(s:GameState)=>GameState)=>{
    const s=latest.current;if(!s||resetting.current)return;
    const next=f(s);latest.current=next;setGame(next);
  },[]);
  useEffect(()=>{
    loadGame().then(s=>{const initial=s??createGame();latest.current=initial;setGame(initial);setReady(true);})
      .catch(e=>{setError(String(e));setReady(true);});
  },[]);
  useEffect(()=>{
    if(!ready||!game||error)return;
    const id=window.setInterval(()=>{
      const s=latest.current;
      if(!s||resetting.current||s.paused||s.introOpen||document.hidden)return;
      const next=tick(s);latest.current=next;setGame(next);
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
  const persist=(s:GameState)=>{if(resetting.current)return;latest.current=s;setGame(s);void saveGame(s).catch(e=>setError(String(e)));};
  const selectedEntity=game?.entities.find(e=>e.id===selected);
  const rotateChoice=()=>{
    if(tool!=="select"&&tool!=="demolish")setDirection(d=>rotate(d));
    else if(selectedEntity){const r=turn(latest.current!,selectedEntity.id);setMessage(r.message);if(r.ok)persist(r.state);}
  };
  const demolish=(id:number)=>{
    const e=latest.current?.entities.find(e=>e.id===id);if(!e)return;
    if(!window.confirm("Demolish "+e.kind+"? Buffered items will be destroyed. Refund: "+money(Math.floor(DEFINITIONS[e.kind].price*0.75))))return;
    const result=remove(latest.current!,id,true);setMessage(result.message);
    if(result.ok){persist(result.state);setSelected(null);}
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
    setMessage(result.message);if(result.ok){persist(result.state);setSelected(result.state.nextId-1);}
  };
  const closeFoundry=()=>{const s=latest.current;if(!s)return;const n=structuredClone(s);n.foundryStorySeen=true;persist(n);setReplayFoundry(false);setFoundryPanel(0);};
  const buyTechnology=(id:TechnologyId)=>{
    const current=latest.current;if(!current)return;
    const status=technologyStatus(current,id);
    if(status.status!=="available"||!status.affordable){setMessage(status.missing.join("; ")||"Insufficient credits.");return;}
    if(!window.confirm(`Unlock ${TECHNOLOGIES[id].label} for ${money(TECHNOLOGIES[id].costCents)}? This is a one-time, permanent payment and cannot be undone.`))return;
    const result=purchaseTechnology(current,id);
    setMessage(result.message);
    if(result.ok)persist(result.state);
  };
  const go=()=>{change(begin);setPanel(0);const s=latest.current;if(s)void saveGame(s).catch(e=>setError(String(e)));};
  const fresh=async()=>{if(resetting.current||!window.confirm("Factory Reset? All progress and your save will be permanently deleted."))return;
    resetting.current=true;
    try{await eraseGame();const s=reset();latest.current=s;setGame(s);setError(null);setSelected(null);setTool("select");setPanel(0);setShowTechnology(false);setReplayFoundry(false);setFoundryPanel(0);setMessage("New factory started.");}catch(e){setError(String(e));}finally{resetting.current=false;}};
  if(!ready)return <main>Loading Sector 9...</main>;
  if(error)return <main className="error"><h1>Save error</h1><p role="alert">{error}</p><p>Stored data has not been overwritten. Export or back up your IndexedDB data before resetting.</p><button onClick={()=>void fresh()}>Factory Reset</button></main>;
  if(!game)return null;
  const kpi=stats(game),mission=MISSIONS[game.mission.activeId];
  const foundryActive=["M5","M6","M7","DONE"].includes(game.mission.activeId);
  const foundryStoryOpen=(["M5","M6","M7"].includes(game.mission.activeId)&&!game.foundryStorySeen)||(foundryActive&&replayFoundry);
  return <div className="app">
    <header><div className="brand">SEKTOR <strong>9</strong><small>INDUSTRIAL OPERATIONS</small></div>
      <div className="kpis"><div>Cash<strong data-testid="cash">{money(game.balanceCents)}</strong></div><div>Revenue / min<strong>{kpi?money(kpi.revenueCents):"Collecting data"}</strong></div><div>Operating cost / min<strong>{kpi?money(kpi.costCents):"Collecting data"}</strong></div><div>Profit / min<strong data-testid="profit">{kpi?money(kpi.profitCents):"Collecting data"}</strong></div></div>
      <button onClick={()=>{const n=setPause(game,!game.paused);persist(n);}}>{game.paused?"▶ Run":"Ⅱ Pause"}</button>
    </header>
    <div className="workspace"><aside className="palette"><h2>Construction</h2>
      {(["select","iron_mine","furnace","coal_mine","assembler","advanced_furnace","conveyor","demolish"] as const).map(t=>{
        const technology:Partial<Record<Kind,TechnologyId>>={coal_mine:"coal_extraction",assembler:"mechanical_components",advanced_furnace:"advanced_smelting"};
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
        {TECHNOLOGY_ORDER.map(id=>{
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
      <h3>Iron deposits</h3><p>{DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p><h3>Coal deposits</h3><p>{COAL_DEPOSITS.map(d=>`(${d.x},${d.y})`).join(" · ")}</p>
    </aside><main className="center"><div className="board-title"><span>SECTOR MAP · 12 × 12</span><span>Tick {game.tick} · {game.paused?"PAUSED":"RUNNING"}</span></div>
      <Board state={game} tool={tool} direction={direction} selectedId={selected} onTile={tile}/><p className="tip">M: iron mine · C: coal mine · F: furnace · A: assembler · S: advanced furnace · B: conveyor · $: terminal</p></main>
      <aside className="inspector"><h2>Inspector</h2>{selectedEntity?<><h3>{DEFINITIONS[selectedEntity.kind].label}</h3><dl><dt>Position</dt><dd>({selectedEntity.x}, {selectedEntity.y})</dd><dt>Facing</dt><dd>{selectedEntity.direction}</dd><dt>Status</dt><dd>{game.paused?"paused":selectedEntity.status}</dd><dt>Output</dt><dd>{selectedEntity.output??selectedEntity.belt??"empty"}</dd>{(["furnace","assembler","advanced_furnace"].includes(selectedEntity.kind))&&Object.entries(selectedEntity.kind==="furnace"?RECIPES.iron_ingot.input:selectedEntity.kind==="assembler"?RECIPES.gear.input:RECIPES.steel.input).map(([item,required])=><Fragment key={item}><dt>{item.replaceAll("_"," ")} buffer</dt><dd>{selectedEntity.kind==="furnace"?selectedEntity.oreInput:(selectedEntity.inputBuffers?.[item as Item]??0)}/4 (needs {required})</dd></Fragment>)}
        <dt>Cycle</dt><dd>{selectedEntity.cycle===null?"idle":selectedEntity.cycle+" ticks remaining"}</dd></dl>
        {["furnace","assembler","advanced_furnace"].includes(selectedEntity.kind)&&<p>Recipe: {selectedEntity.kind==="furnace"?"2 iron ore → 1 iron ingot (4 ticks)":selectedEntity.kind==="assembler"?"2 iron ingots → 1 gear (5 ticks)":"2 iron ingots + 1 coal → 1 steel (8 ticks)"}</p>}
        {selectedEntity.reservedInputs&&Object.values(selectedEntity.reservedInputs).some(v=>v>0)&&<p>Reserved inputs: {Object.entries(selectedEntity.reservedInputs).map(([item,count])=>`${item}: ${count}`).join(", ")}</p>}
        {COAL_DEPOSITS.some(d=>d.x===selectedEntity.x&&d.y===selectedEntity.y)&&selectedEntity.kind!=="coal_mine"&&<p>A coal deposit is beneath this structure. Demolish it to build a coal mine.</p>}
        {selectedEntity.kind!=="sell_terminal"&&<><button onClick={()=>{const r=turn(latest.current!,selectedEntity.id);setMessage(r.message);if(r.ok)persist(r.state);}}>Rotate clockwise</button><button className="danger" onClick={()=>demolish(selectedEntity.id)}>Demolish</button></>}</>:<p>Select a machine or conveyor to view status and controls.</p>}
      <h2>Operations</h2>{foundryActive&&<button onClick={()=>{setReplayFoundry(true);setFoundryPanel(0);}}>Replay Foundry Directive</button>}<button onClick={()=>{setPanel(0);setHelp(true);}}>Help / Replay Intro</button><button className="danger" onClick={()=>void fresh()}>New Game / Factory Reset</button><p>No offline production. Hidden tabs pause automatically.</p>
      </aside></div>
    <footer><div><small>OPERATIONS CONSOLE // {game.mission.activeId}</small><h2>{mission.title}</h2><p>{game.tutorialEnabled?mission.hint:"Tutorial hints hidden."}</p>
      <div className="progress">{game.mission.activeId==="M2"?`${game.mission.soldOre} / 10 ore sold`:game.mission.activeId==="M3"?`${game.mission.soldIngot} / 20 ingots sold`:game.mission.activeId==="M4"?`${game.mission.profitStreakTicks} / 60 qualifying ticks`:game.mission.activeId==="M5"?`${game.mission.soldCoal??0} / 10 coal sold`:game.mission.activeId==="M6"?`${game.mission.soldGear??0} / 8 gears sold`:game.mission.activeId==="M7"?`${game.mission.soldSteel??0} / 8 steel sold`:""}</div></div>
      <div><p role="status">{message}</p><button onClick={()=>{const n=structuredClone(game);n.tutorialEnabled=!n.tutorialEnabled;persist(n);}}>{game.tutorialEnabled?"Hide hints":"Show hints"}</button></div></footer>
    {foundryStoryOpen&&!game.introOpen&&!help&&<div className="overlay"><section className="story" role="dialog" aria-modal="true" aria-label="Foundry Directive"><small>{foundryPanel+1} / 3 · PROMETHEUS ARCHIVE</small><h1>{FOUNDRY_NARRATIVE[foundryPanel][0]}</h1><p>{FOUNDRY_NARRATIVE[foundryPanel][1]}</p><div className="actions">{foundryPanel>0&&<button onClick={()=>setFoundryPanel(p=>p-1)}>Previous</button>}{foundryPanel<2&&<button onClick={()=>setFoundryPanel(p=>p+1)}>Next</button>}<button onClick={closeFoundry}>Close / Return</button><button onClick={closeFoundry}>Skip Directive</button></div></section></div>}
    {(game.introOpen||help)&&<div className="overlay"><section className="story" role="dialog" aria-modal="true"><small>{panel+1} / 3 · SECTOR 9 ARCHIVE</small><h1>{NARRATIVE[panel][0]}</h1><p>{NARRATIVE[panel][1]}</p><div className="actions">{panel>0&&<button onClick={()=>setPanel(p=>p-1)}>Previous</button>}{panel<2&&<button onClick={()=>setPanel(p=>p+1)}>Next</button>}<button onClick={()=>{if(help){setHelp(false);return;}go();}}> {help?"Close / Return":"Begin Operations"}</button>{!help&&<button onClick={go}>Skip Introduction</button>}</div></section></div>}
  </div>;
}
