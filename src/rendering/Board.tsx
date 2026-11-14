import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {Application,Container,Graphics,Text,TextStyle} from "pixi.js";
import {DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,STEP,type Direction,type GameState,type Kind} from "../domain/model";
import {CARGO_GLYPHS,CARGO_COLORS,processorCargoSummary} from "./cargo";
import {STRUCTURE_GLYPHS} from "./structureVisuals";
export type Tool="select"|"demolish"|"iron_mine"|"coal_mine"|"furnace"|"assembler"|"advanced_furnace"|"conveyor"|"copper_mine"|"silicon_extractor"|"circuit_fabricator"|"coal_generator"|"splitter";
const TILE=44;
const fill:Record<Kind,number>={iron_mine:0xc58d53,coal_mine:0x676c79,furnace:0xd76446,assembler:0xc3a4e8,advanced_furnace:0xb64c4c,conveyor:0x508fa3,sell_terminal:0x68b98a,copper_mine:0xd69b57,silicon_extractor:0x8196b2,circuit_fabricator:0xbda0ed,coal_generator:0xdfc278,splitter:0x65c0b4};
export function Board({state,tool,direction,onTile,onDragRotate,selectedId}:{state:GameState;tool:Tool;direction:Direction;onTile:(x:number,y:number)=>void;onDragRotate:(id:number,direction:Direction)=>void;selectedId:number|null}){
  const active=useRef<{id:number;pointerId:number;startX:number;startY:number;tileX:number;tileY:number;cancelled:boolean}|null>(null);
  const [preview,setPreview]=useState<{id:number;direction:Direction}|null>(null);
  const point=(clientX:number,clientY:number)=>{
    const rect=element.current?.getBoundingClientRect();
    if(!rect||rect.width<=0||rect.height<=0)return null;
    const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;
    if(x<0||x>=1||y<0||y>=1)return null;
    return {x:Math.floor(x*12),y:Math.floor(y*12)};
  };
  const vector=(dx:number,dy:number):Direction=>Math.abs(dx)>=Math.abs(dy)?dx>=0?"E":"W":dy>=0?"S":"N";
  const cancel=()=>{active.current=null;setPreview(null);};
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};
    window.addEventListener("keydown",escape);
    return ()=>window.removeEventListener("keydown",escape);
  },[]);
  const onDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||active.current)return;
    const p=point(event.clientX,event.clientY);if(!p)return;
    const entity=state.entities.find(e=>e.x===p.x&&e.y===p.y);
    active.current={id:tool==="select"&&entity&&entity.kind!=="sell_terminal"?entity.id:-1,
      pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
      tileX:p.x,tileY:p.y,cancelled:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const gesture=active.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(tool==="select"&&gesture.id>0&&Math.hypot(dx,dy)>=12){
      setPreview({id:gesture.id,direction:vector(dx,dy)});
    }else setPreview(null);
  };
  const onUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const gesture=active.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    const release=point(event.clientX,event.clientY);
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    const shouldRotate=tool==="select"&&gesture.id>0&&Math.hypot(dx,dy)>=12;
    cancel();
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if(!release)return;
    if(shouldRotate)onDragRotate(gesture.id,vector(dx,dy));
    else if(Math.hypot(dx,dy)<12)onTile(gesture.tileX,gesture.tileY);
  };
  const element=useRef<HTMLDivElement>(null);
  const app=useRef<Application|null>(null);
  const [initialized,setInitialized]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    const instance=new Application();
    (async()=>{
      await instance.init({width:TILE*12,height:TILE*12,background:0x101a27,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true});
      if(cancelled){instance.destroy(true);return;}
      element.current?.appendChild(instance.canvas);
      app.current=instance;setInitialized(true);
    })();
    return ()=>{cancelled=true;if(app.current===instance){app.current=null;instance.destroy(true);}};
  },[]);
  useEffect(()=>{
    const instance=app.current;
    if(!instance||!initialized)return;
    const root=new Container();instance.stage.removeChildren().forEach(c=>c.destroy({children:true}));
    instance.stage.addChild(root);
    for(let y=0;y<12;y++)for(let x=0;x<12;x++){
      const g=new Graphics().rect(x*TILE+1,y*TILE+1,TILE-2,TILE-2).fill((x+y)%2?0x1a2938:0x203144);
      root.addChild(g);
    }
    for(const d of DEPOSITS){
      root.addChild(new Graphics().circle(d.x*TILE+22,d.y*TILE+22,15).fill(0x715f41));
      const t=new Text({text:"Fe",style:new TextStyle({fontSize:13,fontWeight:"bold",fill:0xf2d38a})});
      t.position.set(d.x*TILE+13,d.y*TILE+13);root.addChild(t);
    }
    for(const d of COAL_DEPOSITS){
      root.addChild(new Graphics().circle(d.x*TILE+22,d.y*TILE+22,15).fill(0x464c55));
      const t=new Text({text:"C",style:new TextStyle({fontSize:13,fontWeight:"bold",fill:0xf1f1f1})});
      t.position.set(d.x*TILE+17,d.y*TILE+13);root.addChild(t);
    }
    if(state.chapterII?.started){
      for(const [deposits,glyph,color] of [[COPPER_DEPOSITS,"Cu",0x9b754d],[SILICON_DEPOSITS,"Si",0x596d88]] as const){
        for(const d of deposits){
          root.addChild(new Graphics().circle(d.x*TILE+22,d.y*TILE+22,15).fill(color));
          const label=new Text({text:glyph,style:new TextStyle({fontSize:12,fontWeight:"bold",fill:0xffffff})});
          label.position.set(d.x*TILE+11,d.y*TILE+14);root.addChild(label);
        }
      }
    }
    for(const e of state.entities){
      const X=e.x*TILE,Y=e.y*TILE;
      const selected=e.id===selectedId||e.id===preview?.id;
      root.addChild(new Graphics().roundRect(X+4,Y+4,36,36,5).fill(fill[e.kind]).stroke({width:selected?3:1,color:selected?0xffffff:0x253a4a}));
      const symbol=STRUCTURE_GLYPHS[e.kind];
      const label=new Text({text:symbol,style:new TextStyle({fontSize:18,fontWeight:"bold",fill:0x101a27})});
      label.position.set(X+9,Y+10);root.addChild(label);
      if(e.kind!=="sell_terminal"){
        const [dx,dy]=STEP[preview?.id===e.id?preview.direction:e.direction];
        const g=new Graphics().moveTo(X+22,Y+22).lineTo(X+22+dx*15,Y+22+dy*15).stroke({width:3,color:0xffffff});
        root.addChild(g);
      }
      const cargo=e.kind==="conveyor"||e.kind==="splitter"?e.belt:e.output;
      if(cargo){
        root.addChild(new Graphics().roundRect(X+25,Y+5,17,14,3).fill(CARGO_COLORS[cargo]).stroke({width:1,color:0x162535}));
        const t=new Text({text:CARGO_GLYPHS[cargo],style:new TextStyle({fontSize:10,fontWeight:"bold",fill:0x101a27})});
        t.position.set(X+27,Y+6);root.addChild(t);
      }
      const stock=processorCargoSummary(e);
      if(stock){
        root.addChild(new Graphics().roundRect(X+4,Y+30,36,13,2).fill(0x10202e));
        const available=new Text({text:stock.buffer,style:new TextStyle({fontSize:8,fontWeight:"bold",fill:0xe7f4fb})});
        available.position.set(X+6,Y+31);root.addChild(available);
        if(stock.reserved){
          const reserved=new Text({text:stock.reserved,style:new TextStyle({fontSize:7,fontWeight:"bold",fill:0xf7db9e})});
          reserved.position.set(X+5,Y+23);root.addChild(reserved);
        }
      }
    }
  },[state,tool,direction,selectedId,initialized,preview]);
  return <div className="board" ref={element} aria-label="12 by 12 factory map" data-testid="factory-board"
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
    onPointerCancel={cancel} onLostPointerCapture={cancel}/>;
}
