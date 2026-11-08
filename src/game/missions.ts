import {stats,type GameState} from "../domain/model";
export const MISSIONS={
 M1:{title:"Restore Extraction",hint:"Build an iron mine on a highlighted deposit. Rotate toward a delivery route and run the simulation."},
 M2:{title:"First Delivery",hint:"Deliver 10 iron ore to the terminal. Place conveyors, then rotate with R so their arrows lead toward the terminal."},
 M3:{title:"Added Value",hint:"Sell 20 iron ingots. Feed two ore into a furnace to make one ingot; orient its output toward the terminal."},
 M4:{title:"Prove Profitability",hint:"Maintain at least 50.00 Cr operating profit per rolling 60 ticks for 60 consecutive active ticks. Capital spending does not affect this metric."},
 DONE:{title:"Prologue Completed",hint:"Sector 9 is commercially viable. Prometheus archive: one access request pending. Sandbox mode unlocked."}
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
    if(m.profitStreakTicks>=60){m.activeId="DONE";return "Sector 9 is commercially viable again. Prometheus archive: one access request pending.";}
  }
  return null;
}
