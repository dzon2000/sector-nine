import {stats,type GameState} from "../domain/model";
import {activateMissionMetrics} from "./missionMetrics";
export const MISSIONS={
 M1:{title:"Restore Extraction",hint:"Build an iron mine on a highlighted deposit. Rotate toward a delivery route and run the simulation."},
 M2:{title:"First Delivery",hint:"Deliver 10 iron ore to the terminal. Place conveyors, then rotate with R so their arrows lead toward the terminal."},
 M3:{title:"Added Value",hint:"Sell 20 iron ingots. Feed two ore into a furnace to make one ingot; orient its output toward the terminal."},
 M4:{title:"Prove Profitability",hint:"Maintain at least 50.00 Cr operating profit per rolling 60 ticks for 60 consecutive active ticks. Capital spending does not affect this metric."},
 M5:{title:"Below the Surface",hint:"Open Technology, purchase Coal Extraction (80 Cr), then mine at (7,9) or (5,9) and deliver 10 coal to the terminal."},
 M6:{title:"Mechanical Precision",hint:"Unlock Mechanical Components (120 Cr). Route 2 iron ingots into an assembler for each gear. Sell 8 gears. Technology costs are investments, not operating costs."},
 M7:{title:"The Old Foundry",hint:"Unlock Advanced Smelting (180 Cr) after selling 10 coal and 8 gears. Feed 2 iron ingots and 1 coal to each steel cycle; inspect separate input buffers and blocked outputs. Sell 8 steel."},
 DONE:{title:"Foundry Restored",hint:"Steel production confirmed. Prometheus archive: sealed engineering records remain. Continue optimizing in sandbox mode."}
} as const;
export function updateMission(s:GameState):string|null {
  const m=s.mission;
  if(m.activeId==="M1"&&s.totalOreProduced>0&&s.entities.some(e=>e.kind==="iron_mine")){
    m.activeId="M2";return "Extraction online. Material without a route earns nothing.";
  }
  if(m.activeId==="M2"&&m.soldOre>=10){
    m.activeId="M3";return "First delivery confirmed. Processing can increase value per unit.";
  }
  if(m.activeId==="M3"&&m.soldIngot>=20){
    m.activeId="M4";m.profitStreakTicks=0;return "Your furnace is operational. Profit now depends on throughput and cost.";
  }
  if(m.activeId==="M4"){
    const p=stats(s);
    m.profitStreakTicks=p&&p.profitCents>=5000?m.profitStreakTicks+1:0;
    if(m.profitStreakTicks>=60){m.activeId="M5";return "Sector 9 is viable again. The old foundry blueprint has surfaced in the archive.";}
  }
  if(m.activeId==="M5"&&(m.soldCoal??0)>=10){
    m.activeId="M6";
    if(s.missionRuleVersion===3)s.missionMetrics=activateMissionMetrics(s.tick);
    return "Coal deliveries confirmed. Reconstruct mechanical assembly and sell eight gears.";
  }
  if(m.activeId==="M6"&&(m.soldGear??0)>=8){
    m.activeId="M7";
    if(s.missionRuleVersion===3)s.missionMetrics=activateMissionMetrics(s.tick);
    return "Mechanical assembly verified. Rebuild the advanced foundry using iron ingots and coal.";
  }
  if(m.activeId==="M7"&&s.technologies?.advanced_smelting&&(m.soldSteel??0)>=8){
    m.activeId="DONE";
    if(s.missionRuleVersion===3)s.missionMetrics=null;
    return "Steel deliveries verified. A sealed Prometheus engineering archive awaits future investigation.";
  }
  return null;
}
