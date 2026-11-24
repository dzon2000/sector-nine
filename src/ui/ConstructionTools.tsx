import type {CSSProperties} from "react";
import {DEFINITIONS,money,type GameState,type Kind} from "../domain/model";
import {type AnyTechnologyId} from "../game/technologies";
import type {Tool} from "../rendering/Board";
import atlas from "../rendering/assets/sector-nine-v06.json";

const atlasUrl=new URL("../rendering/assets/sector-nine-v06.png",import.meta.url).href;
const groups=[
  {name:"Routing",tools:["select","conveyor","splitter"]},
  {name:"Extraction",tools:["iron_mine","coal_mine","copper_mine","silicon_extractor"]},
  {name:"Processing and power",tools:["furnace","advanced_furnace","assembler","circuit_fabricator","coal_generator"]},
] as const;
const technology:Partial<Record<Kind,AnyTechnologyId>>={
  coal_mine:"coal_extraction",assembler:"mechanical_components",advanced_furnace:"advanced_smelting",
  copper_mine:"resource_surveying",silicon_extractor:"resource_surveying",
  circuit_fabricator:"circuit_fabrication",splitter:"circuit_fabrication",coal_generator:"industrial_power",
};

export function toolLabel(tool:Tool){
  return tool==="select"?"Inspect":tool==="demolish"?"Demolish":DEFINITIONS[tool].label;
}

function Frame({kind}:{kind:Exclude<Tool,"select"|"demolish">}){
  const {frame}=atlas.frames[kind];
  const style:CSSProperties={
    width:frame.w,height:frame.h,backgroundImage:`url("${atlasUrl}")`,
    backgroundPosition:`-${frame.x}px -${frame.y}px`,
  };
  return <span className="tool-sprite" aria-hidden="true">
    <span style={style} data-atlas-frame={kind}/>
  </span>;
}

export function ConstructionTools({game,tool,onSelect,onLocked}:{
  game:GameState;tool:Tool;onSelect:(tool:Tool)=>void;onLocked:(technology?:AnyTechnologyId)=>void;
}){
  return <>
    {groups.map(group=><section className="tool-group" key={group.name} aria-label={group.name}>
      <h3>{group.name}</h3>
      {group.tools.map(item=>{
        const required=item!=="select"?technology[item]:undefined;
        const locked=required?!game.technologies?.[required]:item==="furnace"&&["M1","M2"].includes(game.mission.activeId);
        return <button key={item} className={tool===item?"construction-tool active":"construction-tool"}
          aria-pressed={tool===item} onClick={()=>locked?onLocked(required):onSelect(item)}>
          {item==="select"?<span className="tool-mark" aria-hidden="true">⌖</span>:<Frame kind={item}/>}
          <b>{toolLabel(item)}</b>
          {item!=="select"&&<span className="tool-price">
            {money(DEFINITIONS[item].price)}{locked&&<span>Locked</span>}
          </span>}
        </button>;
      })}
    </section>)}
    <button className={tool==="demolish"?"active danger":"danger"} aria-pressed={tool==="demolish"}
      onClick={()=>onSelect("demolish")}>Demolish</button>
  </>;
}
