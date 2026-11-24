import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Application,Container,Graphics,Sprite,Text} from "pixi.js";
import {createGame,emptySales,type Entity,type GameState,type SplitterMode} from "../../../src/domain/model";
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
let game:GameState={
  ...base,chapterII:{foundryCompleted:true,started:true,completed:false,storySeen:true,metrics:null},
  diagnostics:{samples:[{tick:base.tick,terminalSales:emptySales(),entities:{
    2:{status:"idle",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:1},
  }}]},
  entities:[
    ...base.entities,
    entity(2,"splitter",8,2,{direction:"W",belt:"coal",splitterNext:0,splitterMode:"clockwise"}),
    entity(3,"furnace",5,5,{direction:"S",output:"iron_ingot",inputBuffers:{iron_ore:2}}),
    entity(4,"conveyor",6,5,{direction:"E"}),
    entity(5,"conveyor",2,8,{direction:"E"}),
    entity(6,"conveyor",3,8,{direction:"N",belt:"gear"}),
    entity(7,"conveyor",3,7,{direction:"N"}),
    entity(8,"conveyor",5,10,{direction:"N",belt:"iron_ore"}),
    entity(9,"conveyor",6,10,{direction:"N",belt:"copper_ore"}),
    entity(10,"conveyor",7,10,{direction:"N",belt:"steel"}),
  ],
};

function describe(node:Container):unknown{
  const bounds=node instanceof Graphics?node.getLocalBounds():null;
  return {
    label:node.label,
    ...(node instanceof Sprite?{
      textureLabel:node.texture.label,frame:[node.texture.frame.width,node.texture.frame.height],
      anchor:[node.anchor.x,node.anchor.y],angle:node.angle,scaleMode:node.texture.source.scaleMode,
      x:node.x,y:node.y,
    }:{}),
    ...(node instanceof Text?{text:node.text}:{}),
    ...(bounds?{bounds:[bounds.x,bounds.y,bounds.width,bounds.height]}:{}),
    children:node.children.map(describe),
  };
}
const actions:string[]=[];
function render(){
  root.render(<StrictMode><Board state={game} tool="select" direction="E" selectedId={2}
    onTile={(x,y)=>{actions.push(`tile:${x},${y}`);return null;}}
    onDragRotate={(id,direction)=>actions.push(`rotate:${id},${direction}`)}/></StrictMode>);
}
function updateSplitter(changes:Partial<Entity>){
  game={...game,entities:game.entities.map(entity=>entity.id===2?{...entity,...changes}:entity)};
  render();
}
render();
Object.assign(window,{boardTest:{
  snapshot:()=>initialized.find(app=>app.stage)?.stage.children.map(describe)??[],
  lifecycle:()=>({initialized:initialized.length,destroyed}),
  actions:()=>actions,
  setMode:(splitterMode:SplitterMode)=>updateSplitter({splitterMode}),
  setDirection:(direction:Entity["direction"])=>updateSplitter({direction}),
  clearCargo:()=>updateSplitter({belt:null}),
  unmount:()=>root.unmount(),
}});
