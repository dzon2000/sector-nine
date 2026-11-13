import {recipeFor,type Entity,type Item} from "../domain/model";

/** Short distinct labels, readable without relying on cargo color. */
export const CARGO_GLYPHS:Record<Item,string>={
  iron_ore:"Or",iron_ingot:"In",coal:"Co",gear:"Ge",steel:"St",copper_ore:"Cu",silicon:"Si",circuit:"Ci"
};
export const CARGO_COLORS:Record<Item,number>={
  iron_ore:0xd5aa75,iron_ingot:0xffd27f,coal:0xb8c2d3,gear:0xc8b0f3,steel:0x9be3dd,copper_ore:0xd5aa75,silicon:0xb8c2d3,circuit:0xc8b0f3
};

/** Labels include missing input types (0/4), and reserved stock stays visible. */
export function processorCargoSummary(e:Entity):{buffer:string;reserved:string}|null{
  const recipe=recipeFor(e.kind);
  if(!recipe)return null;
  const labels=Object.keys(recipe.input) as Item[];
  const summary=(stock:Entity["inputBuffers"])=>labels.map(item=>
    `${CARGO_GLYPHS[item]}${stock?.[item]??0}`).join(" ");
  return {
    buffer:summary(e.inputBuffers),
    reserved:Object.values(e.reservedInputs??{}).some(v=>v>0)?"R "+summary(e.reservedInputs):""
  };
}
