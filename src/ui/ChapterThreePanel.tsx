import {useEffect,useRef,useState,type ReactNode} from "react";
import {
  CHAPTER_III_CONTRACTS,CHAPTER_III_PRODUCTS,CHAPTER_III_ROUTES,CONTRACT_STREAK_WINDOWS,CONTRACT_WINDOW_TICKS,
  chapterIIIContractGoal,contractQualifies,summarizeContractTicks,
  type ChapterIIIContractId,type ChapterIIIRoute,type ContractWindow,
} from "../domain/contracts";
import {money,type GameState} from "../domain/model";
import {currentChapterIIIWindow} from "../game/chapterThree";
import {ConfirmationDialog} from "./ConfirmationDialog";

const TITLES={M11:"Recover the Archive",M12:"Choose the Recipient",M13:"Reconstruct Prometheus"};
const PRODUCT_NAMES={circuit:"Circuits",gear:"Gears",steel:"Steel"};
const ROUTE_NAMES={independent:"Independent",corporate:"Corporate"};
const ROUTE_DETAILS={
  independent:"Investigate independently. Sustain circuit production while covering fabrication demand on a limited generator coal budget.",
  corporate:"Work with the corporate archive team. Sustain circuit and steel deliveries.",
};

function Conditions({goal,progress}:{
  goal:NonNullable<ReturnType<typeof chapterIIIContractGoal>>;
  progress?:ContractWindow;
}){
  return <ul className="contract-conditions">
    {CHAPTER_III_PRODUCTS.map(product=>{
      const target=goal.products[product];
      if(target===undefined)return null;
      return <li key={product}><strong>{PRODUCT_NAMES[product]}</strong>
        {progress
          ? <> · Produced: {progress.produced[product]} / {target} · Sold: {progress.sold[product]} / {target}</>
          : <> · Make and sell {target}</>}
      </li>;
    })}
    {goal.coveredTicks!==undefined&&<li>Fully covered fabrication demand · {progress
      ? `${progress.coveredTicks} / ${goal.coveredTicks} ticks`
      : `${goal.coveredTicks} ticks with positive demand`}</li>}
    {goal.maxCoalBurned!==undefined&&<li>Generator coal burned · {progress
      ? `${progress.coalBurned} / ${goal.maxCoalBurned} maximum`
      : `At most ${goal.maxCoalBurned} coal`}</li>}
    {goal.profitCents!==undefined&&<li>Operating profit · {progress
      ? `${money(progress.profitCents)} / ${money(goal.profitCents)}`
      : `At least ${money(goal.profitCents)}`}</li>}
  </ul>;
}

interface Props {
  game:GameState;
  dispatch?:ReactNode;
  onStart:()=>void;
  onAccept:(id:ChapterIIIContractId)=>void;
  onChoose:(route:ChapterIIIRoute)=>void;
}

export function ChapterThreePanel({game,dispatch,onStart,onAccept,onChoose}:Props){
  const chapter=game.chapterIII;
  const [pendingRoute,setPendingRoute]=useState<ChapterIIIRoute|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const active=chapter?.active;
  const id=chapter?CHAPTER_III_CONTRACTS[chapter.completed.length]:undefined;
  const route=chapter?.route??null;
  const phase=`${chapter?"started":"ready"}-${id??"none"}-${active?.id??"offer"}-${route??"none"}`;
  const focusAfterCommand=useRef(false);
  useEffect(()=>{
    if(!focusAfterCommand.current)return;
    focusAfterCommand.current=false;
    heading.current?.focus();
  },[phase]);

  const run=(command:()=>void)=>{
    focusAfterCommand.current=true;
    command();
  };

  const goal=id?chapterIIIContractGoal(id,route):null;
  const fullWindow=active?currentChapterIIIWindow(game):null;
  const progress=active?(fullWindow??summarizeContractTicks(active.ticks)):undefined;

  return <section className="chapter-three-contracts" aria-label="Chapter III contracts" data-testid="chapter-three-contracts">
    <h2 ref={heading} tabIndex={-1}>{id?TITLES[id]:chapter?"Project Prometheus Complete":"First Signal Restored"}</h2>
    {dispatch}
    {!chapter&&<>
      {game.tutorialEnabled&&<p>Investigate the recovered archive in Project Prometheus.</p>}
      <button onClick={()=>run(onStart)}>Start Chapter III</button>
    </>}
    {chapter&&!id&&<p>All three archive entries unlocked. Continue operating in free play.</p>}
    {id==="M13"&&<p>Reconstruct the mechanical interlock with circuits for the controller, gears for the mechanism, and steel for the housing.</p>}
    {id==="M12"&&!route&&<>
      <p>Choose who receives the archive findings. Both routes lead to Reconstruct Prometheus.</p>
      <div className="contract-routes">
        {CHAPTER_III_ROUTES.map(choice=><div key={choice}>
          <button aria-haspopup="dialog" onClick={()=>setPendingRoute(choice)}>{ROUTE_NAMES[choice]}</button>
          <Conditions goal={chapterIIIContractGoal("M12",choice)!}/>
        </div>)}
      </div>
    </>}
    {id&&goal&&<>
      {route&&<p>Route: {ROUTE_NAMES[route]}</p>}
      {active
        ? <p>Window: {active.ticks.length}/{CONTRACT_WINDOW_TICKS} active ticks (simulation time) · Streak: {active.streakTicks}/{CONTRACT_STREAK_WINDOWS} qualifying windows</p>
        : <p>Meet every condition in the same window of {CONTRACT_WINDOW_TICKS} simulation ticks for {CONTRACT_STREAK_WINDOWS} consecutive windows.</p>}
      <Conditions goal={goal} progress={progress}/>
      {fullWindow&&<p>{contractQualifies(id,route,fullWindow)?"Current window qualifies.":"Current window does not qualify."}</p>}
      <p>Reward: Archive entry unlocked. {id==="M13"?"Return to free play.":"Access to the next step."}</p>
      {!active&&<button onClick={()=>run(()=>onAccept(id))}>Accept Contract</button>}
    </>}
    {pendingRoute&&<ConfirmationDialog title="Confirm Route" confirmLabel="Confirm"
      description={<p><strong>{ROUTE_NAMES[pendingRoute]}.</strong> {ROUTE_DETAILS[pendingRoute]} The confirmed choice applies for the rest of this campaign.</p>}
      onCancel={()=>setPendingRoute(null)}
      onConfirm={()=>{setPendingRoute(null);run(()=>onChoose(pendingRoute));}}/>}
  </section>;
}
