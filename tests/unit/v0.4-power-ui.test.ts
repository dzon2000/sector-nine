import {describe,expect,it} from "vitest";
import {createGame,type Entity} from "../../src/domain/model";
import {diagnosticHint} from "../../src/game/diagnostics";
import {STRUCTURE_GLYPHS} from "../../src/rendering/structureVisuals";
function entity(kind:Entity["kind"]):Entity{
 return {id:2,kind,x:4,y:4,direction:"E",output:null,belt:null,oreInput:0,
 inputBuffers:{},reservedInputs:{},cycle:null,status:"waiting_for_inputs"};
}
describe("WP5 headless power troubleshooting and distinct structure visual labels",()=>{
 it("distinguishes fabricator power shortage from missing material and blocked output",()=>{
   const s=createGame();const f=entity("circuit_fabricator");
   s.entities.push(f);f.cycle=4;
   s.tick=10;
   s.power={tick:10,supply:0,demand:1,served:0,demandCovered:false,
    unpoweredProcessingTicks:1,coalBurned:0,lastServedFabricatorId:0,
    history:[{tick:10,supply:0,demand:1,served:0,demandCovered:false,unpoweredProcessingTicks:1,coalBurned:0}]};
   expect(diagnosticHint(s,2)).toMatch(/Power shortage/i);
   f.cycle=null;
   expect(diagnosticHint(s,2)).toMatch(/Missing copper ore and silicon/i);
   f.output="circuit";
   s.diagnostics={samples:[{tick:10,entities:{"2":{status:"output_blocked",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:0}},
     terminalSales:{iron_ore:0,iron_ingot:0,coal:0,gear:0,steel:0,copper_ore:0,silicon:0,circuit:0}}]};
   expect(diagnosticHint(s,2)).toMatch(/Output blocked/i);
 });
 it("explains exhausted generator fuel separately from powered machinery",()=>{
   const s=createGame();s.tick=4;const g=entity("coal_generator");g.fuelTicksRemaining=0;
   s.entities.push(g);
   expect(diagnosticHint(s,2)).toMatch(/fuel/i);
   g.fuelTicksRemaining=6;
   expect(diagnosticHint(s,2)).toMatch(/fuel remaining/i);
 });
 it("keeps every new entity glyph distinguishable from legacy heavy structures",()=>{
   expect(STRUCTURE_GLYPHS.copper_mine).toBe("Cu");
   expect(STRUCTURE_GLYPHS.silicon_extractor).toBe("Si");
   expect(STRUCTURE_GLYPHS.circuit_fabricator).toBe("Ci");
   expect(STRUCTURE_GLYPHS.coal_generator).toBe("Pw");
   expect(STRUCTURE_GLYPHS.splitter).toBe("Sp");
   expect(STRUCTURE_GLYPHS.splitter).not.toBe(STRUCTURE_GLYPHS.advanced_furnace);
 });
});