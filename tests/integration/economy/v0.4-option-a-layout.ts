import type {Direction,Kind} from "../../../src/domain/model";
type Built=readonly [Exclude<Kind,"sell_terminal">,number,number,Direction];
const belt=(x:number,y:number,d:Direction):Built=>["conveyor",x,y,d];
export const physicalM10:Built[]=[
  ["copper_mine",8,2,"W"],["splitter",7,2,"W"],
  belt(7,1,"E"),belt(8,1,"E"),belt(9,1,"S"),belt(9,2,"S"),
  ...Array.from({length:9},(_,i)=>belt(6,2+i,i===8?"E":"S")),
  ...[7,8,9,10].map(x=>belt(x,10,"E")),
  belt(11,10,"N"),belt(11,9,"N"),belt(11,8,"W"),belt(10,8,"W"),
  ["silicon_extractor",8,9,"N"],["splitter",8,8,"N"],
  belt(8,7,"N"),belt(8,6,"N"),belt(8,5,"N"),belt(8,4,"N"),belt(8,3,"E"),
  ["circuit_fabricator",9,3,"S"],belt(9,4,"S"),
  ["circuit_fabricator",9,8,"N"],belt(9,7,"N"),belt(9,6,"N"),belt(9,5,"E"),
  ["coal_mine",7,9,"N"],["coal_generator",7,8,"N"],
  ["coal_mine",5,9,"W"],["splitter",4,9,"W"],
  belt(3,9,"N"),belt(3,8,"N"),["coal_generator",3,7,"N"],
  belt(4,8,"N"),belt(4,7,"N"),belt(4,6,"N"),belt(4,5,"N"),belt(4,4,"W"),
  ["iron_mine",2,2,"E"],["furnace",3,2,"S"],belt(3,3,"S"),["advanced_furnace",3,4,"W"],
  belt(2,4,"W"),belt(1,4,"N"),belt(1,3,"N"),belt(1,2,"N"),belt(1,1,"N"),belt(1,0,"E"),
  ...Array.from({length:9},(_,i)=>belt(i+2,0,"E")),
  belt(11,0,"S"),...Array.from({length:4},(_,i)=>belt(11,i+1,"S")),belt(11,5,"W")
];
