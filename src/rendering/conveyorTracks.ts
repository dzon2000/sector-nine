import {rotate,STEP,type Direction,type Entity} from "../domain/model";
import {splitterOutlets} from "./splitterOutlets";

export const TRACK_TILE=44;
type Belt=Pick<Entity,"id"|"x"|"y"|"direction"|"kind">;
export interface BeltConnections {
  inputs:Direction[];
  outputs:Direction[];
}

const directions=["N","E","S","W"] as const;

export function beltConnections(entities:readonly Belt[],preview?:{id:number;direction:Direction}|null) {
  const belts=entities.filter(entity=>entity.kind==="conveyor"||entity.kind==="splitter");
  const byPosition=new Map(belts.map(belt=>[`${belt.x},${belt.y}`,belt]));
  const facings=new Map(belts.map(belt=>[belt.id,preview?.id===belt.id?preview.direction:belt.direction]));
  const outlets=new Map(belts.map(belt=>{
    const facing=facings.get(belt.id)!;
    return [belt.id,belt.kind==="splitter"?splitterOutlets(facing).map(outlet=>outlet.direction):[facing]];
  }));
  return new Map(belts.map(belt=>{
    const inputs:Direction[]=[],outputs:Direction[]=[];
    for(const direction of directions){
      const [dx,dy]=STEP[direction];
      const neighbor=byPosition.get(`${belt.x+dx},${belt.y+dy}`);
      if(!neighbor)continue;
      if(outlets.get(neighbor.id)!.includes(rotate(rotate(direction))))inputs.push(direction);
      if(outlets.get(belt.id)!.includes(direction))outputs.push(direction);
    }
    return [belt.id,{inputs,outputs}];
  }));
}

const center=TRACK_TILE/2;
const bendRadius=15;
const cappedReach=11;
const halfWidth=9;
type Point=readonly [number,number];

function along(direction:Direction,reach:number):Point {
  const [dx,dy]=STEP[direction];
  return [center+dx*reach,center+dy*reach];
}

function bend(input:Direction,output:Direction,radius:number):Point[] {
  const [ix,iy]=STEP[input], [ox,oy]=STEP[output];
  return Array.from({length:13},(_,index)=>{
    const angle=index*Math.PI/24;
    const a=radius*(1-Math.sin(angle));
    const b=radius*(1-Math.cos(angle));
    return [center+ix*a+ox*b,center+iy*a+oy*b];
  });
}

export function conveyorTrack(output:Direction,connections:BeltConnections):Uint8Array {
  const inputPorts=connections.inputs.filter(input=>input!==output);
  const outgoingReach=connections.outputs.includes(output)||connections.inputs.includes(output)?center:cappedReach;
  const end=along(output,outgoingReach);
  const radius=Math.min(bendRadius,outgoingReach);
  const rear=rotate(rotate(output));
  if(!inputPorts.length)return paint([[along(rear,cappedReach),end]]);
  return paint(inputPorts.map(input=>{
    const start=along(input,center);
    return input===rear?[start,end]:[start,...bend(input,output,radius),end];
  }));
}

export function splitterTrack(connections:BeltConnections):Uint8Array {
  const ports=directions.filter(direction=>connections.inputs.includes(direction)||connections.outputs.includes(direction));
  return paint(ports.map(direction=>[[center,center],along(direction,center)]));
}

// Indexed artwork with fixed rail widths and neutral cross-sections at tile boundaries.
function paint(paths:readonly Point[][]):Uint8Array {
  const segments=paths.flatMap(points=>points.slice(1).map(([x,y],index)=>{
    const [startX,startY]=points[index];
    const dx=x-startX,dy=y-startY;
    return {startX,startY,dx,dy,lengthSquared:dx*dx+dy*dy};
  }).filter(segment=>segment.lengthSquared>0));
  const bitmap=new Uint8Array(TRACK_TILE*TRACK_TILE);
  for(let y=0;y<TRACK_TILE;y++)for(let x=0;x<TRACK_TILE;x++){
    let nearest=halfWidth*halfWidth;
    let across=0;
    for(const {startX,startY,dx,dy,lengthSquared} of segments){
      const fromX=x+.5-startX,fromY=y+.5-startY;
      const t=Math.min(1,Math.max(0,(fromX*dx+fromY*dy)/lengthSquared));
      const distance=(fromX-t*dx)**2+(fromY-t*dy)**2;
      if(distance>=nearest)continue;
      nearest=distance;
      across=dx*dx>dy*dy?x:y;
    }
    if(nearest===halfWidth*halfWidth)continue;
    const atEdge=x===0||y===0||x===TRACK_TILE-1||y===TRACK_TILE-1;
    bitmap[y*TRACK_TILE+x]=nearest>=64?1:nearest>=25?2:!atEdge&&across%5<2?4:3;
  }
  return bitmap;
}
