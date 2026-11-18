import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {Application,Container,Graphics,Sprite,Text,TextStyle,type Texture} from "pixi.js";
import {DEPOSITS,COAL_DEPOSITS,COPPER_DEPOSITS,SILICON_DEPOSITS,STEP,rotate,type Direction,type GameState,type Kind} from "../domain/model";
import {CARGO_GLYPHS,CARGO_COLORS,processorCargoSummary} from "./cargo";
import {loadBoardTextures,type BoardTextures} from "./boardAtlas";
import {STRUCTURE_GLYPHS} from "./structureVisuals";
export type Tool="select"|"demolish"|"iron_mine"|"coal_mine"|"furnace"|"assembler"|"advanced_furnace"|"conveyor"|"copper_mine"|"silicon_extractor"|"circuit_fabricator"|"coal_generator"|"splitter";
const TILE=44;
const fill:Record<Kind,number>={iron_mine:0xc58d53,coal_mine:0x676c79,furnace:0xd76446,assembler:0xc3a4e8,advanced_furnace:0xb64c4c,conveyor:0x508fa3,sell_terminal:0x68b98a,copper_mine:0xd69b57,silicon_extractor:0x8196b2,circuit_fabricator:0xbda0ed,coal_generator:0xdfc278,splitter:0x65c0b4};
const ROTATION:Record<Direction,number>={N:0,E:90,S:180,W:270};

function sprite(texture:Texture,label:string,x:number,y:number){
  const image=new Sprite({texture,label,anchor:0.5});
  image.position.set(x,y);
  return image;
}

function outlet(x:number,y:number,direction:Direction,color=0xeef8fe){
  const [dx,dy]=STEP[direction];
  const tipX=x+dx*17,tipY=y+dy*17;
  const baseX=tipX-dx*6,baseY=tipY-dy*6;
  return new Graphics({label:`outlet:${direction}`})
    .moveTo(tipX-dx*10,tipY-dy*10).lineTo(tipX,tipY)
    .stroke({width:4,color:0x101a27})
    .moveTo(tipX-dx*10,tipY-dy*10).lineTo(tipX,tipY)
    .stroke({width:2,color})
    .poly([tipX,tipY,baseX-dy*4,baseY+dx*4,baseX+dy*4,baseY-dx*4])
    .fill(color).stroke({width:1,color:0x101a27});
}

export function Board({state,tool,direction,onTile,onDragRotate,selectedId}:{state:GameState;tool:Tool;direction:Direction;onTile:(x:number,y:number)=>number|null;onDragRotate:(id:number,direction:Direction)=>void;selectedId:number|null}){
  const active=useRef<{id:number|null;pointerId:number;startX:number;startY:number;tileX:number;tileY:number;handledOnDown:boolean}|null>(null);
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
  const cancelPointer=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(active.current?.pointerId===event.pointerId)cancel();
  };
  const onDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||active.current)return;
    const p=point(event.clientX,event.clientY);if(!p)return;
    const entity=state.entities.find(e=>e.x===p.x&&e.y===p.y);
    const handledOnDown=!entity&&tool!=="select"&&tool!=="demolish";
    event.currentTarget.setPointerCapture(event.pointerId);
    const id=handledOnDown?onTile(p.x,p.y):
      tool!=="demolish"&&entity&&entity.kind!=="sell_terminal"?entity.id:null;
    active.current={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
      tileX:p.x,tileY:p.y,handledOnDown};
  };
  const onMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const gesture=active.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(gesture.id!==null&&Math.hypot(dx,dy)>=12){
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
  const element=useRef<HTMLDivElement>(null);
  const [renderer,setRenderer]=useState<{app:Application;textures?:BoardTextures}|null>(null);
  const [rendererError,setRendererError]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    let ready=false;
    const app=new Application();
    void (async()=>{
      try{
        await app.init({width:TILE*12,height:TILE*12,background:0x101a27,antialias:true,
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
      element.current?.appendChild(app.canvas);
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
  },[]);
  useEffect(()=>{
    if(!renderer)return;
    const {app:instance,textures}=renderer;
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
    const lastTick=state.diagnostics?.samples.at(-1);
    for(const e of state.entities){
      const X=e.x*TILE,Y=e.y*TILE;
      const cx=X+22,cy=Y+22;
      const previewing=e.id===preview?.id;
      const facing=previewing?preview.direction:e.direction;
      const selected=e.id===selectedId||previewing;
      const layer=new Container({label:`entity:${e.id}`});
      root.addChild(layer);
      const isBelt=e.kind==="conveyor"||e.kind==="splitter";
      const structureTexture=textures?.[e.kind];
      if(structureTexture){
        const image=sprite(structureTexture,`structure:${e.kind}`,cx,cy);
        if(isBelt)image.angle=ROTATION[facing];
        layer.addChild(image);
      }else{
        layer.addChild(new Graphics().roundRect(X+4,Y+4,36,36,5).fill(fill[e.kind])
          .stroke({width:1,color:0x253a4a}));
        const label=new Text({label:`structure:${e.kind}`,text:STRUCTURE_GLYPHS[e.kind],
          style:{fontSize:18,fontWeight:"bold",fill:0x101a27}});
        label.position.set(X+9,Y+10);layer.addChild(label);
      }
      if(selected){
        layer.addChild(new Graphics().roundRect(X+2,Y+2,40,40,4)
          .stroke({width:2,color:previewing?0xb5e7ff:0xf2eee2}));
      }
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
      if(e.kind!=="sell_terminal")layer.addChild(outlet(cx,cy,facing));
      if(e.kind==="splitter")layer.addChild(outlet(cx,cy,rotate(facing)));
      const cargo=isBelt?e.belt:e.output;
      if(cargo){
        const blocked=isBelt
          ?lastTick?.tick===state.tick&&lastTick.entities[e.id]?.conveyorStalledTicks===1
          :e.status==="blocked_output";
        const texture=textures?.[cargo];
        const plate=texture?(cargo==="coal"?0x465362:0x101a27):CARGO_COLORS[cargo];
        const border=blocked?0xff9177:0x7999ac;
        layer.addChild(new Graphics().roundRect(X+2,Y+2,18,18,3).fill(plate).stroke({width:1,color:border}));
        if(texture){
          layer.addChild(sprite(texture,`cargo:${cargo}`,X+11,Y+11));
        }else{
          const label=new Text({label:`cargo:${cargo}`,text:CARGO_GLYPHS[cargo],
            style:{fontSize:10,fontWeight:"bold",fill:0x101a27}});
          label.position.set(X+4,Y+4);layer.addChild(label);
        }
      }
    }
    instance.render();
  },[state,selectedId,renderer,preview]);
  return <div className="board" ref={element} aria-label="12 by 12 factory map" data-testid="factory-board"
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
    onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}>
      {rendererError&&<span role="status">Factory map renderer unavailable.</span>}
      {state.chapterII?.started&&([
        {name:"copper",label:"Cu",extractor:"copper_mine",point:COPPER_DEPOSITS[0]},
        {name:"silicon",label:"Si",extractor:"silicon_extractor",point:SILICON_DEPOSITS[0]}
      ] as const).map(({name,label,extractor,point})=>{
        const occupant=state.entities.find(e=>e.x===point.x&&e.y===point.y);
        if(!occupant||occupant.kind===extractor)return null;
        return <span key={name} className="deposit-overlay"
          data-testid={`deposit-marker-${name}`}
          aria-label={`${name} deposit at (${point.x},${point.y}), occupied by ${occupant.kind}`}
          title={`${name} deposit (${point.x},${point.y}) — occupied by ${occupant.kind}`}
          style={{left:`${point.x/12*100}%`,top:`${point.y/12*100}%`}}>
          {label}
        </span>;
      })}
    </div>;
}
