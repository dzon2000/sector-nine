import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {Application,Container,Graphics,Sprite,Text,TextStyle,type Texture} from "pixi.js";
import {DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,STEP,type Direction,type GameState,type Kind} from "../domain/model";
import {placementError} from "../game/commands";
import {CARGO_GLYPHS,CARGO_COLORS,processorCargoSummary} from "./cargo";
import {loadBoardTextures,type BoardTextures} from "./boardAtlas";
import {conveyorTexture,splitterLinkTexture} from "./conveyorSprites";
import {beltConnections,TRACK_TILE} from "./conveyorTracks";
import {splitterOutlets} from "./splitterOutlets";
import {STRUCTURE_GLYPHS} from "./structureVisuals";
export type Tool="select"|"demolish"|"iron_mine"|"coal_mine"|"furnace"|"assembler"|"advanced_furnace"|"conveyor"|"copper_mine"|"silicon_extractor"|"circuit_fabricator"|"coal_generator"|"splitter";
const TILE=TRACK_TILE;
const fill:Record<Kind,number>={iron_mine:0xc58d53,coal_mine:0x676c79,furnace:0xd76446,assembler:0xc3a4e8,advanced_furnace:0xb64c4c,conveyor:0x508fa3,sell_terminal:0x68b98a,copper_mine:0xd69b57,silicon_extractor:0x8196b2,circuit_fabricator:0xbda0ed,coal_generator:0xdfc278,splitter:0x65c0b4};
type Tile={x:number;y:number};
const ROTATION:Record<Direction,number>={N:0,E:90,S:180,W:270};
const CHAPTER_DEPOSIT_MARKERS=[
  {name:"copper",label:"Cu",extractor:"copper_mine",point:COPPER_DEPOSITS[0]},
  {name:"silicon",label:"Si",extractor:"silicon_extractor",point:SILICON_DEPOSITS[0]},
] as const;

function sprite(texture:Texture,label:string,x:number,y:number){
  const image=new Sprite({texture,label,anchor:0.5});
  image.position.set(x,y);
  return image;
}

function outlet(x:number,y:number,direction:Direction,priority?:"forward"|"clockwise"){
  const color=priority?0xffcd63:0xeef8fe;
  const [dx,dy]=STEP[direction];
  const tipX=x+dx*17,tipY=y+dy*17;
  const baseX=tipX-dx*6,baseY=tipY-dy*6;
  return new Graphics({label:priority?`outlet:${direction}:${priority}`:`outlet:${direction}`})
    .moveTo(tipX-dx*10,tipY-dy*10).lineTo(tipX,tipY)
    .stroke({width:4,color:0x101a27})
    .moveTo(tipX-dx*10,tipY-dy*10).lineTo(tipX,tipY)
    .stroke({width:2,color})
    .poly([tipX,tipY,baseX-dy*4,baseY+dx*4,baseX+dy*4,baseY-dx*4])
    .fill(color).stroke({width:1,color:0x101a27});
}

function selectionFrame(x:number,y:number,rotating:boolean){
  const frame=new Graphics({label:rotating?"rotation-preview":"selection-frame"});
  if(!rotating)return frame.roundRect(x+2,y+2,40,40,4).stroke({width:2,color:0xf2eee2});
  return frame
    .moveTo(x+2,y+13).lineTo(x+2,y+2).lineTo(x+13,y+2)
    .moveTo(x+31,y+2).lineTo(x+42,y+2).lineTo(x+42,y+13)
    .moveTo(x+42,y+31).lineTo(x+42,y+42).lineTo(x+31,y+42)
    .moveTo(x+13,y+42).lineTo(x+2,y+42).lineTo(x+2,y+31)
    .stroke({width:2,color:0xb5e7ff});
}

function priorityMark(x:number,y:number,direction:Direction){
  const [dx,dy]=STEP[direction];
  const tipX=x+dx*8,tipY=y+dy*8;
  const baseX=tipX-dx*4,baseY=tipY-dy*4;
  return new Graphics({label:`priority-mark:${direction}`})
    .poly([tipX,tipY,baseX-dy*3,baseY+dx*3,baseX+dy*3,baseY-dx*3])
    .fill(0xffcd63).stroke({width:1,color:0x101a27});
}

function blockedCargoMark(x:number,y:number,radius=5){
  return new Graphics({label:"cargo-warning-mark"})
    .circle(x,y,radius).fill(0x101a27).stroke({width:1,color:0xff9177})
    .rect(x-1,y-3,2,4).rect(x-1,y+2,2,1).fill(0xffe8df);
}

export function Board({state,tool,direction,onTile,onDragRotate,selectedId}:{state:GameState;tool:Tool;direction:Direction;onTile:(x:number,y:number)=>number|null;onDragRotate:(id:number,direction:Direction)=>void;selectedId:number|null}){
  const active=useRef<{id:number|null;pointerId:number;startX:number;startY:number;tileX:number;tileY:number;handledOnDown:boolean}|null>(null);
  const surface=useRef<HTMLDivElement>(null);
  const [renderer,setRenderer]=useState<{app:Application;textures?:BoardTextures}|null>(null);
  const [rendererError,setRendererError]=useState(false);
  const [preview,setPreview]=useState<{id:number;direction:Direction}|null>(null);
  const [hover,setHover]=useState<Tile|null>(null);
  const point=(clientX:number,clientY:number):Tile|null=>{
    if(!renderer)return null;
    const rect=surface.current?.getBoundingClientRect();
    if(!rect||rect.width<=0||rect.height<=0||
      clientX<rect.left||clientX>=rect.right||clientY<rect.top||clientY>=rect.bottom)return null;
    return {
      x:Math.floor((clientX-rect.left)*state.width/rect.width),
      y:Math.floor((clientY-rect.top)*state.height/rect.height),
    };
  };
  const vector=(dx:number,dy:number):Direction=>Math.abs(dx)>=Math.abs(dy)?dx>=0?"E":"W":dy>=0?"S":"N";
  const cancel=()=>{active.current=null;setPreview(null);setHover(null);};
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};
    window.addEventListener("keydown",escape);
    return ()=>window.removeEventListener("keydown",escape);
  },[]);
  const cancelPointer=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(active.current?.pointerId===event.pointerId)cancel();
  };
  const onDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||active.current)return;
    const p=point(event.clientX,event.clientY);if(!p)return;
    setHover(null);
    const entity=state.entities.find(e=>e.x===p.x&&e.y===p.y);
    const handledOnDown=!entity&&tool!=="select"&&tool!=="demolish";
    event.currentTarget.setPointerCapture(event.pointerId);
    const id=handledOnDown?onTile(p.x,p.y):
      tool!=="demolish"&&entity&&entity.kind!=="sell_terminal"?entity.id:null;
    active.current={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
      tileX:p.x,tileY:p.y,handledOnDown};
  };
  const onMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const gesture=active.current;
    if(!gesture){
      const next=event.pointerType==="touch"||event.buttons?null:point(event.clientX,event.clientY);
      setHover(current=>current?.x===next?.x&&current?.y===next?.y?current:next);
      return;
    }
    if(gesture.pointerId!==event.pointerId)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(gesture.id!==null&&point(event.clientX,event.clientY)&&Math.hypot(dx,dy)>=12){
      setPreview({id:gesture.id,direction:vector(dx,dy)});
    }else setPreview(null);
  };
  const onUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const gesture=active.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    const release=point(event.clientX,event.clientY);
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    const dragged=Math.hypot(dx,dy)>=12;
    cancel();
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if(!release)return;
    if(dragged&&gesture.id!==null)onDragRotate(gesture.id,vector(dx,dy));
    else if(!dragged&&!gesture.handledOnDown)onTile(gesture.tileX,gesture.tileY);
  };
  useEffect(()=>{
    let cancelled=false;
    let ready=false;
    const app=new Application();
    void (async()=>{
      try{
        await app.init({width:TILE*state.width,height:TILE*state.height,background:0x101a27,antialias:true,
          resolution:Math.min(devicePixelRatio,2),autoDensity:true,autoStart:false});
      }catch{
        if(app.renderer)app.destroy(true,{children:true});
        else app.stage.destroy({children:true});
        if(!cancelled)setRendererError(true);
        return;
      }
      if(cancelled){app.destroy(true,{children:true});return;}
      ready=true;
      app.canvas.setAttribute("aria-hidden","true");
      app.canvas.style.imageRendering="pixelated";
      surface.current?.appendChild(app.canvas);
      setRenderer({app});
      try{
        const textures=await loadBoardTextures();
        if(!cancelled)setRenderer({app,textures});
      }catch{
        // The existing glyph board remains available if the optional artwork cannot load.
      }
    })();
    return ()=>{
      cancelled=true;
      if(ready)app.destroy(true,{children:true});
    };
  },[state.width,state.height]);
  useEffect(()=>{
    if(!renderer)return;
    const {app:instance,textures}=renderer;
    const root=new Container();instance.stage.removeChildren().forEach(c=>c.destroy({children:true}));
    instance.stage.addChild(root);
    for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){
      const g=new Graphics().rect(x*TILE+1,y*TILE+1,TILE-2,TILE-2).fill((x+y)%2?0x1a2938:0x203144);
      root.addChild(g);
    }
    const showDeposits=(deposits:readonly Tile[],name:string,glyph:string,color:number,
      textColor:number,fontSize:number,left:number,top:number)=>{
      for(const deposit of deposits){
        if(state.entities.some(entity=>entity.x===deposit.x&&entity.y===deposit.y))continue;
        const x=deposit.x*TILE,y=deposit.y*TILE;
        root.addChild(new Graphics().circle(x+22,y+22,15).fill(color));
        const label=new Text({label:`deposit:${name}`,text:glyph,style:{fontSize,fontWeight:"bold",fill:textColor}});
        label.position.set(x+left,y+top);root.addChild(label);
      }
    };
    showDeposits(DEPOSITS,"iron","Fe",0x715f41,0xf2d38a,13,13,13);
    showDeposits(COAL_DEPOSITS,"coal","C",0x464c55,0xf1f1f1,13,17,13);
    if(state.chapterII?.started){
      showDeposits(COPPER_DEPOSITS,"copper","Cu",0x9b754d,0xffffff,12,11,14);
      showDeposits(SILICON_DEPOSITS,"silicon","Si",0x596d88,0xffffff,12,11,14);
    }
    const lastTick=state.diagnostics?.samples.at(-1);
    const links=textures?beltConnections(state.entities,preview):undefined;
    for(const e of state.entities){
      const X=e.x*TILE,Y=e.y*TILE;
      const cx=X+22,cy=Y+22;
      const previewing=e.id===preview?.id;
      const facing=previewing?preview.direction:e.direction;
      const selected=e.id===selectedId||previewing;
      const layer=new Container({label:`entity:${e.id}`});
      root.addChild(layer);
      const isBelt=e.kind==="conveyor"||e.kind==="splitter";
      const connections=links?.get(e.id);
      const structureTexture=e.kind==="conveyor"&&connections
        ?conveyorTexture(facing,connections)
        :textures?.[e.kind];
      if(structureTexture){
        if(e.kind==="splitter"&&connections&&(connections.inputs.length||connections.outputs.length)){
          layer.addChild(sprite(splitterLinkTexture(connections),"track:splitter-links",cx,cy));
        }
        const image=sprite(structureTexture,`structure:${e.kind}`,cx,cy);
        if(e.kind==="splitter")image.angle=ROTATION[facing];
        layer.addChild(image);
      }else{
        layer.addChild(new Graphics().roundRect(X+4,Y+4,36,36,5).fill(fill[e.kind])
          .stroke({width:1,color:0x253a4a}));
        const label=new Text({label:`structure:${e.kind}`,text:STRUCTURE_GLYPHS[e.kind],
          style:{fontSize:18,fontWeight:"bold",fill:0x101a27}});
        label.position.set(X+9,Y+10);layer.addChild(label);
      }
      if(selected)layer.addChild(selectionFrame(X,Y,previewing));
      const stock=processorCargoSummary(e);
      if(stock){
        layer.addChild(new Graphics().roundRect(X+4,Y+32,36,11,2).fill(0x10202e));
        const available=new Text({text:stock.buffer,style:{fontSize:8,fontWeight:"bold",fill:0xe7f4fb}});
        available.position.set(X+6,Y+32);layer.addChild(available);
        if(stock.reserved){
          const reserved=new Text({text:stock.reserved,style:{fontSize:7,fontWeight:"bold",fill:0xf7db9e}});
          reserved.position.set(X+5,Y+23);layer.addChild(reserved);
        }
      }
      if(e.kind==="splitter"){
        for(const branch of splitterOutlets(facing,e.splitterMode)){
          layer.addChild(outlet(cx,cy,branch.direction,branch.preferred?branch.mode:undefined));
          if(branch.preferred)layer.addChild(priorityMark(cx,cy,branch.direction));
        }
      }else if(e.kind!=="sell_terminal")layer.addChild(outlet(cx,cy,facing));
      const cargo=isBelt?e.belt:e.output;
      if(cargo){
        const blocked=isBelt
          ?lastTick?.tick===state.tick&&lastTick.entities[e.id]?.conveyorStalledTicks===1
          :e.status==="blocked_output";
        const texture=textures?.[cargo];
        const plate=texture?(cargo==="coal"?0x465362:0x101a27):CARGO_COLORS[cargo];
        const border=blocked?0xff9177:0x7999ac;
        const badge=new Graphics({label:blocked?"cargo-stalled":"cargo-badge"});
        if(texture){
          layer.addChild(badge.roundRect(X+2,Y+2,18,18,3).fill(plate).stroke({width:1,color:border}));
          layer.addChild(sprite(texture,`cargo:${cargo}`,X+11,Y+11));
        }else{
          layer.addChild(badge.roundRect(X+25,Y+5,17,14,3).fill(plate).stroke({width:1,color:border}));
          const label=new Text({label:`cargo:${cargo}`,text:CARGO_GLYPHS[cargo],
            style:{fontSize:10,fontWeight:"bold",fill:0x101a27}});
          label.position.set(X+27,Y+6);layer.addChild(label);
        }
        if(blocked){
          const covered=state.chapterII?.started&&CHAPTER_DEPOSIT_MARKERS.some(({extractor,point})=>
            e.x===point.x&&e.y===point.y&&e.kind!==extractor);
          // Stay clear of the structure glyph, cargo and covered deposit label.
          const warning=isBelt?blockedCargoMark(X+37,Y+35):
            !structureTexture&&!texture?blockedCargoMark(X+5,Y+5,4):
            texture&&!covered?blockedCargoMark(X+37,Y+7):blockedCargoMark(cx,cy,4);
          layer.addChild(warning);
        }
      }
    }
    instance.render();
  },[state,selectedId,renderer,preview]);
  const placement=hover&&renderer&&!state.introOpen&&tool!=="select"&&tool!=="demolish"
    ?{tile:hover,error:placementError(state,tool,hover.x,hover.y)}:null;
  return <div className="board" aria-label="12 by 12 factory map" data-testid="factory-board"
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
    onPointerLeave={()=>setHover(null)} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}>
    <div className="board-surface" ref={surface}>
      {rendererError&&<span role="status">Factory map renderer unavailable.</span>}
      {state.chapterII?.started&&CHAPTER_DEPOSIT_MARKERS.map(({name,label,extractor,point})=>{
        const occupant=state.entities.find(e=>e.x===point.x&&e.y===point.y);
        if(!occupant||occupant.kind===extractor)return null;
        return <span key={name} className="deposit-overlay" role="img"
          data-testid={`deposit-marker-${name}`}
          aria-label={`${name} deposit at (${point.x},${point.y}), occupied by ${occupant.kind}`}
          style={{
            left:`${(point.x+0.64)/state.width*100}%`,
            top:`${(point.y+0.04)/state.height*100}%`,
            width:`${0.32/state.width*100}%`,height:`${0.32/state.height*100}%`,
          }}>
          {label}
        </span>;
      })}
      {placement&&<span className="placement-preview" data-testid="board-placement-preview" role="img"
        data-valid={placement.error===undefined}
        aria-label={placement.error
          ?`Cannot build at (${placement.tile.x},${placement.tile.y}) — ${placement.error}`
          :`Can build at (${placement.tile.x},${placement.tile.y})`}
        style={{
          left:`${placement.tile.x/state.width*100}%`,top:`${placement.tile.y/state.height*100}%`,
          width:`${100/state.width}%`,height:`${100/state.height}%`,
        }}>
        <span aria-hidden="true">{placement.error?"×":"+"}</span>
      </span>}
    </div>
  </div>;
}
