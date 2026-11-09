import {describe,expect,it} from "vitest";
import {createGame,type Entity,type Item} from "../../src/domain/model";
import {CARGO_COLORS,CARGO_GLYPHS,processorCargoSummary} from "../../src/rendering/cargo";

function machine(kind:"furnace"|"assembler"|"advanced_furnace"):Entity{
 return {...createGame().entities[0],id:2,kind,oreInput:0,inputBuffers:{},reservedInputs:{}};
}
describe("PR #2 renderer review: typed cargo visibility",()=>{
 it("assigns a unique readable, non-color item glyph",()=>{
   const names=["iron_ore","iron_ingot","coal","gear","steel"] as Item[];
   expect(new Set(names.map(i=>CARGO_GLYPHS[i])).size).toBe(5);
   expect(names.every(i=>CARGO_GLYPHS[i].length>=2&&Number.isInteger(CARGO_COLORS[i]))).toBe(true);
 });
 it("shows all input types including missing inputs, not only processor output",()=>{
   const advanced=machine("advanced_furnace");
   advanced.inputBuffers={iron_ingot:2,coal:0};
   expect(processorCargoSummary(advanced)?.buffer).toBe("In2 Co0");
   advanced.reservedInputs={iron_ingot:2,coal:1};
   expect(processorCargoSummary(advanced)?.reserved).toBe("R In2 Co1");
   expect(processorCargoSummary(machine("furnace"))?.buffer).toBe("Or0");
   expect(processorCargoSummary(machine("assembler"))?.buffer).toBe("In0");
   expect(processorCargoSummary(createGame().entities[0])).toBeNull();
 });
});
