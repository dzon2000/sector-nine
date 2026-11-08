import {useEffect,useRef} from "react";
import {Application,Container,Graphics,Text,TextStyle} from "pixi.js";
import {DEPOSITS,STEP,type Direction,type GameState,type Kind} from "../domain/model";
export type Tool="select"|"demolish"|"iron_mine"|"furnace"|"conveyor";
const TILE=44;
const fill:Record<Kind,number>={iron_mine:0xc58d53,furnace:0xd76446,conveyor:0x508fa3,sell_terminal:0x68b98a};
export function Board({state,tool,direction,onTile,selectedId}:{state:GameState;tool:Tool;direction:Direction;onTile:(x:number,y:number)=>void;selectedId:number|null}){
  const element=useRef<HTMLDivElement>(null);
  const app=useRef<Application|null>(null);
  const action=useRef(onTile);action.current=onTile;
  useEffect(()=>{
    let cancelled=false;
    const instance=new Application();
    (async()=>{
      await instance.init({width:TILE*12,height:TILE*12,background:0x101a27,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true});
      if(cancelled){instance.destroy(true);return;}
      element.current?.appendChild(instance.canvas);
      app.current=instance;
    })();
    return ()=>{cancelled=true;if(app.current===instance){app.current=null;instance.destroy(true);}};
  },[]);
  useEffect(()=>{
    const instance=app.current;
    if(!instance)return;
    const root=new Container();instance.stage.removeChildren().forEach(c=>c.destroy({children:true}));
    instance.stage.addChild(root);
    for(let y=0;y<12;y++)for(let x=0;x<12;x++){
      const g=new Graphics().rect(x*TILE+1,y*TILE+1,TILE-2,TILE-2).fill((x+y)%2?0x1a2938:0x203144);
      g.eventMode="static";g.cursor="pointer";g.on("pointertap",()=>action.current(x,y));root.addChild(g);
    }
    for(const d of DEPOSITS){
      root.addChild(new Graphics().circle(d.x*TILE+22,d.y*TILE+22,15).fill(0x715f41));
      const t=new Text({text:"Fe",style:new TextStyle({fontSize:13,fontWeight:"bold",fill:0xf2d38a})});
      t.position.set(d.x*TILE+13,d.y*TILE+13);root.addChild(t);
    }
    for(const e of state.entities){
      const X=e.x*TILE,Y=e.y*TILE;
      const selected=e.id===selectedId;
      root.addChild(new Graphics().roundRect(X+4,Y+4,36,36,5).fill(fill[e.kind]).stroke({width:selected?3:1,color:selected?0xffffff:0x253a4a}));
      const glyph=e.kind==="iron_mine"?"M":e.kind==="furnace"?"F":e.kind==="conveyor"?"B":"$";
      const label=new Text({text:glyph,style:new TextStyle({fontSize:18,fontWeight:"bold",fill:0x101a27})});
      label.position.set(X+9,Y+10);root.addChild(label);
      if(e.kind!=="sell_terminal"){
        const [dx,dy]=STEP[e.direction];
        const g=new Graphics().moveTo(X+22,Y+22).lineTo(X+22+dx*15,Y+22+dy*15).stroke({width:3,color:0xffffff});
        root.addChild(g);
      }
      const count=e.kind==="conveyor"?(e.belt?1:0):e.kind==="furnace"?e.oreInput+(e.output?1:0):(e.output?1:0);
      if(count){
        root.addChild(new Graphics().circle(X+33,Y+10,7).fill(e.output==="iron_ingot"||e.belt==="iron_ingot"?0xffd27f:0xa5c2eb));
        const t=new Text({text:String(count),style:new TextStyle({fontSize:10,fill:0x101a27,fontWeight:"bold"})});t.position.set(X+30,Y+5);root.addChild(t);
      }
    }
  },[state,tool,direction,selectedId]);
  return <div className="board" ref={element} aria-label="12 by 12 factory map" data-testid="factory-board"/>;
}
