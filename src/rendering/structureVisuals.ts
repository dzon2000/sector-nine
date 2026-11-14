import type {Kind} from "../domain/model";

/** Legible two-character labels: distinguish new electronics from old metallurgy. */
export const STRUCTURE_GLYPHS:Readonly<Record<Kind,string>>={
 iron_mine:"M",coal_mine:"C",furnace:"F",assembler:"A",advanced_furnace:"S",
 conveyor:"B",sell_terminal:"$",copper_mine:"Cu",silicon_extractor:"Si",
 circuit_fabricator:"Ci",coal_generator:"Pw",splitter:"Sp"
};
