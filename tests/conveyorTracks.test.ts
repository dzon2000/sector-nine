import {describe,expect,it} from "vitest";
import {rotate,STEP,type Direction,type Entity} from "../src/domain/model";
import {beltConnections,conveyorTrack,splitterTrack,TRACK_TILE} from "../src/rendering/conveyorTracks";

function belt(id:number,x:number,y:number,direction:Direction,kind:Entity["kind"]="conveyor") {
  return {id,x,y,kind,direction};
}

describe("conveyor track connections",()=>{
  it("matches only feeding neighbors and recomputes both sides for rotation previews",()=>{
    const entities=[
      belt(1,3,3,"N"),belt(2,3,4,"N"),belt(3,2,3,"N"),
      belt(4,4,3,"W"),belt(5,3,2,"N"),
    ];
    const connections=beltConnections(entities);
    expect(connections.get(1)).toEqual({inputs:["E","S"],outputs:["N"]});
    expect(connections.get(3)?.outputs).toEqual([]);
    const rotated=beltConnections(entities,{id:1,direction:"W"});
    expect(rotated.get(1)).toEqual({inputs:["E","S"],outputs:["W"]});
    expect(rotated.get(3)?.inputs).toEqual(["E"]);
    expect(rotated.get(5)?.inputs).toEqual([]);
  });

  it("joins both potential splitter outputs and genuine inputs independent of entity ordering",()=>{
    const entities=[belt(1,2,2,"N","splitter"),belt(2,2,1,"N"),belt(3,3,2,"E"),belt(4,1,2,"E")];
    const connections=beltConnections(entities);
    expect(connections.get(1)).toEqual({inputs:["W"],outputs:["N","E"]});
    expect(connections.get(2)?.inputs).toEqual(["S"]);
    expect(connections.get(3)?.inputs).toEqual(["W"]);
    expect(beltConnections(entities.slice().reverse()).get(1)).toEqual(connections.get(1));
  });
});

function pixel(bitmap:Uint8Array,x:number,y:number) {
  return bitmap[y*TRACK_TILE+x];
}
function edge(bitmap:Uint8Array,direction:Direction) {
  return Array.from({length:TRACK_TILE},(_,i)=>{
    if(direction==="N")return pixel(bitmap,i,0);
    if(direction==="S")return pixel(bitmap,i,TRACK_TILE-1);
    if(direction==="W")return pixel(bitmap,0,i);
    return pixel(bitmap,TRACK_TILE-1,i);
  });
}
const directions=["N","E","S","W"] as const;
const opposite=(direction:Direction)=>rotate(rotate(direction));

describe("44-pixel conveyor sprites",()=>{
  it.each(directions)("joins both quarter turns facing %s with identical edge colors",output=>{
    const straight=conveyorTrack(output,{inputs:[opposite(output)],outputs:[output]});
    for(const input of [rotate(output),rotate(opposite(output))]){
      const corner=conveyorTrack(output,{inputs:[input],outputs:[output]});
      const upstream=conveyorTrack(opposite(input),{inputs:[],outputs:[opposite(input)]});
      expect(edge(corner,input)).toEqual(edge(upstream,opposite(input)));
      expect(edge(corner,output)).toEqual(edge(straight,output));
      expect(edge(corner,input).slice(13,31).every(Boolean)).toBe(true);
      expect(edge(corner,opposite(output)).some(Boolean)).toBe(false);
      const disconnected=conveyorTrack(output,{inputs:[input],outputs:[]});
      expect(edge(disconnected,input)).toEqual(edge(upstream,opposite(input)));
      expect(edge(disconnected,output).some(Boolean)).toBe(false);
      const [dx,dy]=STEP[input], [ox,oy]=STEP[output];
      expect(pixel(corner,Math.floor(22+(dx+ox)*5),Math.floor(22+(dy+oy)*5))).not.toBe(0);
      expect(pixel(corner,Math.floor(22-(dx+ox)*7),Math.floor(22-(dy+oy)*7))).toBe(0);
    }
  });

  it("caps isolated ends and keeps three genuine merge ports flush",()=>{
    const isolated=conveyorTrack("N",{inputs:[],outputs:[]});
    for(const direction of directions)expect(edge(isolated,direction).some(Boolean)).toBe(false);
    const merge=conveyorTrack("N",{inputs:["E","S","W"],outputs:["N"]});
    const splitter=splitterTrack({inputs:["S","W"],outputs:["N","E"]});
    for(const direction of directions){
      expect(edge(merge,direction).slice(13,31).every(Boolean)).toBe(true);
      expect(edge(splitter,direction)).toEqual(edge(merge,direction));
    }
  });
});
