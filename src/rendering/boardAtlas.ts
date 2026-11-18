import {Assets,Spritesheet,type Texture} from "pixi.js";
import atlasData from "./assets/sector-nine-v06.json";
const atlasUrl=new URL("./assets/sector-nine-v06.png",import.meta.url).href;

export type BoardTextures=Record<string,Texture>;

// Shared across boards so unmounting one renderer never invalidates another board's textures.
let loading:Promise<BoardTextures>|undefined;

export function loadBoardTextures():Promise<BoardTextures>{
  if(!loading){
    loading=Assets.load<Texture>(atlasUrl).then(texture=>{
      texture.source.scaleMode="nearest";
      return new Spritesheet(texture,atlasData).parse();
    }).catch((error:unknown)=>{
      loading=undefined;
      throw error;
    });
  }
  return loading;
}
