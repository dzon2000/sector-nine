import type {GameState} from "../domain/model";

/** Transmissions present campaign state without mutating it. */
export type ChapterIIITransmissionId="prometheus-opening"|"prometheus-archive"|
  "prometheus-independent"|"prometheus-corporate"|"prometheus-interlock"|"prometheus-conclusion";
export type ChapterIVTransmissionId="return-signal-independent"|"return-signal-corporate"|"return-signal-reply";
export type ChapterTransmissionId="opening"|"m8"|"m9"|"m10"|ChapterIIITransmissionId|ChapterIVTransmissionId;

export function isChapterIIITransmission(id:ChapterTransmissionId):id is ChapterIIITransmissionId {
  return id.startsWith("prometheus-");
}
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
  ]},
  "prometheus-opening":{label:"Project Prometheus Briefing",pages:[
    {heading:"PROJECT PROMETHEUS // RECOVERY BRIEF",
      text:"The signal came from beneath your own factory. Sublevel 03 has opened its archive index, but the records are damaged. The recovery rig needs working circuit boards and gears for its reader. Keep both lines running long enough to recover a complete record."}
  ]},
  "prometheus-archive":{label:"Recovered Archive",pages:[
    {heading:"SUBLEVEL 03 // RECOVERED SERVICE RECORD",
      text:"Prometheus designed an emergency interlock to isolate a failing production line without shutting down the whole site. We recovered the service record, but part of the diagnostic log is missing. Choose who will help verify it: your own team or the corporate archive team."}
  ]},
  "prometheus-independent":{label:"Independent Reply",pages:[
    {heading:"ROUTE 09 // INDEPENDENT REPLY",
      text:"Keep the records onsite. Verify the controller trace using your own factory supply. Our surviving test notes specify a limited generator fuel budget. A trace collected while the fabrication line loses power won't tell us whether the interlock can protect the site."}
  ]},
  "prometheus-corporate":{label:"Corporate Reply",pages:[
    {heading:"CORPORATE ARCHIVE TEAM // RESPONSE",
      text:"We'll share the missing diagnostic log once your terminal verifies sustained deliveries of circuits and steel. Our records show the original housing distorted under load. The combined delivery proves you can reproduce both the controller and its enclosure."}
  ]},
  "prometheus-interlock":{label:"Interlock Blueprint",pages:[
    {heading:"PROJECT PROMETHEUS // INTERLOCK BLUEPRINT",
      text:"The records agree. The controller issued the isolation command, but the mechanical interlock jammed. Reproduce its controller, gear mechanism, and steel housing. The gear requirement is higher for this run. Keep the rest of the factory operating while you adapt production."}
  ]},
  "prometheus-conclusion":{label:"Prometheus Reconstruction",pages:[
    {heading:"SUBLEVEL 03 // RECONSTRUCTION VERIFIED",
      text:"The reconstructed interlock isolates the test line and the rest of the site keeps running. The maintenance record and verified blueprint are now in your archive. Sector 9 is yours to operate. The next production decision is yours."}
  ]},
  "return-signal-independent":{label:"Maintenance-channel transmission",pages:[
    {heading:"Maintenance-channel transmission",
      text:"Sector 9, do you copy? We have been repeating this restart request since the shutdown. Keep your circuit line running so we can verify the connection."}
  ]},
  "return-signal-corporate":{label:"Redacted service ticket",pages:[
    {heading:"Redacted service ticket",
      text:"Origin: [redacted]. Restart request outstanding since the shutdown. Maintain circuit service so the receiving station can verify the connection."}
  ]},
  "return-signal-reply":{label:"Station reply",pages:[
    {heading:"Station reply",text:"Sector 9, we can see your line again."}
  ]}
};

/** M8/M9/M10 transmissions unlock after the corresponding completed mission. */
export function availableTransmissions(state:GameState):ChapterTransmissionId[]{
  if(!state.chapterII?.started)return [];
  const available:ChapterTransmissionId[]=["opening"];
  if(["M9","M10","DONE"].includes(state.mission.activeId))available.push("m8");
  if(["M10","DONE"].includes(state.mission.activeId))available.push("m9");
  if(state.mission.activeId==="DONE"&&state.chapterII.completed)available.push("m10");
  const chapter=state.chapterIII;
  if(chapter){
    available.push("prometheus-opening");
    if(chapter.completed.includes("M11"))available.push("prometheus-archive");
    if(chapter.route)available.push(`prometheus-${chapter.route}`);
    if(chapter.completed.includes("M12"))available.push("prometheus-interlock");
    if(chapter.completed.includes("M13"))available.push("prometheus-conclusion");
  }
  if(state.chapterIV){
    available.push(`return-signal-${state.chapterIV.route}`);
    if(state.chapterIV.completed.includes("M15"))available.push("return-signal-reply");
  }
  return available;
}
