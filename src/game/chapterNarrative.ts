import type {GameState} from "../domain/model";

/** Narrative choices are presentation-only; no Chapter II economic branch. */
export type ChapterTransmissionId="opening"|"m8"|"m9"|"m10";
export interface TransmissionPage{heading:string;text:string}
export interface ChapterTransmission{label:string;pages:readonly TransmissionPage[]}

export const CHAPTER_TRANSMISSIONS:Record<ChapterTransmissionId,ChapterTransmission>={
  opening:{
    label:"Unknown Client Request",
    pages:[
      {heading:"UNREGISTERED PROCUREMENT REQUEST // ROUTE 09",
        text:"Sender: UNKNOWN. The foundry is online. Steel was the key, not the destination. We need conductors and silicon. Route the first samples through your ordinary terminal. Do not request approval from Corporate Operations."},
      {heading:"CORPORATE OPERATIONS // SYSTEM NOTICE",
        text:"No external client is registered under Route 09. All procurement requests must carry an authenticated contract signature."}
    ]
  },
  m8:{label:"Materials Verified",pages:[
    {heading:"AUTOMATED ARCHIVE // MATERIALS VERIFIED",
      text:"Copper and silicon match an erased engineering manifest. The original shipment records were signed by PROJECT PROMETHEUS. The attached circuit specification is incomplete."}
  ]},
  m9:{label:"Signal Recovered",pages:[
    {heading:"UNREGISTERED CLIENT // SIGNAL RECOVERED",
      text:"The first circuit works. Now keep the signal stable while the foundry continues production. We need proof the facility can power itself without depending on Headquarters."}
  ]},
  m10:{label:"Prometheus Archive",pages:[
    {heading:"PROMETHEUS ARCHIVE // PARTIAL ACCESS GRANTED",
      text:"Source of transmission: SECTOR 9 — SUBLEVEL 03. Sender registered 312 days after facility shutdown. Physical access: SEALED."},
    {heading:"CORPORATE OPERATIONS // PRIORITY OVERRIDE",
      text:"Unexpected encrypted activity detected. Suspend investigation and transmit your latest circuit designs for inspection."}
  ]}
};

/** M8/M9/M10 transmissions unlock after the corresponding completed mission. */
export function availableTransmissions(state:GameState):ChapterTransmissionId[]{
  if(state.missionRuleVersion!==4||!state.chapterII?.started)return [];
  const available:ChapterTransmissionId[]=["opening"];
  if(["M9","M10","DONE"].includes(state.mission.activeId))available.push("m8");
  if(["M10","DONE"].includes(state.mission.activeId))available.push("m9");
  if(state.mission.activeId==="DONE"&&state.chapterII.completed)available.push("m10");
  return available;
}
