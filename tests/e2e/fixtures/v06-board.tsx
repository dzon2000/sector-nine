import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Application,Container,Sprite,Text} from "pixi.js";
import {createGame,type Entity} from "../../../src/domain/model";
import {Board} from "../../../src/rendering/Board";
import "../../../src/ui/styles.css";

const initialized:Application[]=[];
let destroyed=0;
const init=Application.prototype.init;
Application.prototype.init=async function(options){
  await init.call(this,options);
  initialized.push(this);
};
const destroy=Application.prototype.destroy;
Application.prototype.destroy=function(...args){
  destroy.apply(this,args);
  destroyed++;
};

const root=createRoot(document.getElementById("root")!);
const base=createGame();
const entity=(id:number,kind:Entity["kind"],x:number,y:number,options:Partial<Entity>):Entity=>
  ({id,kind,x,y,direction:"N",belt:null,output:null,oreInput:0,cycle:null,status:"working",...options});
const game={
  ...base,chapterII:{foundryCompleted:true,started:true,completed:false,storySeen:true,metrics:null},
  entities:[
    ...base.entities,
    entity(2,"splitter",8,2,{direction:"W",belt:"coal",splitterNext:0}),
    entity(3,"furnace",5,5,{direction:"S",output:"iron_ingot",inputBuffers:{iron_ore:2}}),
    entity(4,"conveyor",6,5,{direction:"E"}),
  ],
};

function describe(node:Container):unknown{
  return {
    label:node.label,
    ...(node instanceof Sprite?{
      frame:[node.texture.frame.width,node.texture.frame.height],
      anchor:[node.anchor.x,node.anchor.y],angle:node.angle,scaleMode:node.texture.source.scaleMode,
      x:node.x,y:node.y,
    }:{}),
    ...(node instanceof Text?{text:node.text}:{}),
    children:node.children.map(describe),
  };
}
const actions:string[]=[];
function render(){
  root.render(<StrictMode><Board state={game} tool="select" direction="E" selectedId={2}
    onTile={(x,y)=>{actions.push(`tile:${x},${y}`);return null;}}
    onDragRotate={(id,direction)=>actions.push(`rotate:${id},${direction}`)}/></StrictMode>);
}
render();
Object.assign(window,{boardTest:{
  snapshot:()=>initialized.find(app=>app.stage)?.stage.children.map(describe)??[],
  lifecycle:()=>({initialized:initialized.length,destroyed}),
  actions:()=>actions,
  clearCargo:()=>{game.entities[1]={...game.entities[1],belt:null};render();},
  unmount:()=>root.unmount(),
}});
