import {Texture} from "pixi.js";
import type {Direction} from "../domain/model";
import {conveyorTrack,splitterTrack,TRACK_TILE,type BeltConnections} from "./conveyorTracks";

const palette=[
  [0,0,0,0],
  [0x11,0x17,0x20,255],
  [0x69,0x73,0x81,255],
  [0x2a,0x31,0x3d,255],
  [0x49,0x53,0x62,255],
] as const;
const textures=new Map<string,Texture>();

export function conveyorTexture(facing:Direction,connections:BeltConnections):Texture {
  return trackTexture(`conveyor:${facing}:${connections.inputs.join("")}:${connections.outputs.join("")}`,
    ()=>conveyorTrack(facing,connections));
}

export function splitterLinkTexture(connections:BeltConnections):Texture {
  return trackTexture(`splitter-links:${connections.inputs.join("")}:${connections.outputs.join("")}`,
    ()=>splitterTrack(connections));
}

function trackTexture(key:string,makeBitmap:()=>Uint8Array):Texture {
  const cached=textures.get(key);
  if(cached)return cached;
  const canvas=document.createElement("canvas");
  canvas.width=TRACK_TILE;
  canvas.height=TRACK_TILE;
  const context=canvas.getContext("2d")!;
  const pixels=context.createImageData(TRACK_TILE,TRACK_TILE);
  makeBitmap().forEach((color,index)=>pixels.data.set(palette[color],index*4));
  context.putImageData(pixels,0,0);
  const texture=Texture.from(canvas);
  texture.label=key;
  texture.source.scaleMode="nearest";
  textures.set(key,texture);
  return texture;
}
