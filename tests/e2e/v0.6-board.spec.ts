import {test,expect,type Page} from "@playwright/test";

type Node = {
  label:string; textureLabel?:string; children:Node[]; text?:string; frame?:[number,number];
  anchor?:[number,number]; angle?:number; scaleMode?:string; x?:number; y?:number;
  bounds?:[number,number,number,number];
};
type BoardTest = {
  snapshot():Node[]; lifecycle():{initialized:number;destroyed:number};
  actions():string[]; setMode(mode:"alternating"|"forward"|"clockwise"):void;
  setDirection(direction:"N"|"E"|"S"|"W"):void; clearCargo():void; addBlockedFabricator():void; unmount():void;
};
declare global {interface Window {boardTest:BoardTest;}}

function find(nodes:Node[],label:string):Node|undefined {
  for(const node of nodes){
    if(node.label===label)return node;
    const match=find(node.children,label);
    if(match)return match;
  }
}
async function scene(page:Page,label:string){
  return find(await page.evaluate(()=>window.boardTest.snapshot()),label);
}
const fixture="/tests/e2e/fixtures/v06-board.html";
const atlas="**/sector-nine-v06*.png";

test("loads the atlas and places persistent cargo and directional overlays from board state",async({page})=>{
  await page.goto(fixture);
  const board=page.getByLabel("12 by 12 factory map");
  await expect(board.locator("canvas")).toHaveCount(1);
  await expect(board.getByLabel("copper deposit at (8,2), occupied by splitter")).toBeVisible();
  await expect.poll(()=>scene(page,"structure:splitter")).toMatchObject({
    x:374,y:110,anchor:[.5,.5],scaleMode:"nearest",frame:[31,40],
  });
  await expect.poll(async()=>(await scene(page,"structure:splitter"))?.angle).toBeCloseTo(270);
  await expect.poll(()=>scene(page,"structure:furnace")).toMatchObject({x:242,y:242,angle:0});
  await expect.poll(()=>scene(page,"cargo:coal")).toMatchObject({x:363,y:99,angle:0});
  await expect.poll(()=>scene(page,"cargo:iron_ingot")).toMatchObject({x:231,y:231,angle:0});
  const entities=await page.evaluate(()=>window.boardTest.snapshot());
  const splitter=find(entities,"entity:2")!.children;
  expect(splitter.filter(node=>node.label.startsWith("outlet:")).map(node=>node.label)).toEqual(["outlet:W","outlet:N:clockwise"]);
  expect(splitter.some(node=>node.label==="cargo-stalled")).toBe(true);
  const [warningX,warningY,warningWidth,warningHeight]=splitter.find(node=>node.label==="cargo-warning-mark")!.bounds!;
  const cargo=splitter.find(node=>node.label==="cargo:coal")!;
  expect(warningY).toBeGreaterThan(cargo.y!+cargo.frame![1]/2);
  for(const outlet of splitter.filter(node=>node.label.startsWith("outlet:")||node.label.startsWith("priority-mark:"))){
    const [outletX,outletY,outletWidth,outletHeight]=outlet.bounds!;
    expect(warningX+warningWidth<=outletX||outletX+outletWidth<=warningX||
      warningY+warningHeight<=outletY||outletY+outletHeight<=warningY).toBe(true);
  }
  expect(splitter.some(node=>node.label==="priority-mark:N")).toBe(true);
  expect(splitter.some(node=>node.label==="selection-frame")).toBe(true);
  expect(find(entities,"deposit:copper")).toBeUndefined();
  expect(find(entities,"deposit:silicon")?.text).toBe("Si");
  for(const cargo of ["iron_ore","copper_ore","iron_ingot","steel"])
    expect(find(entities,`cargo:${cargo}`)?.textureLabel).toBe(cargo);
  const marker=(await board.getByTestId("deposit-marker-copper").boundingBox())!;
  const canvas=(await board.locator("canvas").boundingBox())!;
  expect(marker.width).toBeLessThan(canvas.width/12/2);
  expect(marker.x).toBeGreaterThan(canvas.x+8.5*canvas.width/12);
  expect(marker.y+marker.height).toBeLessThan(canvas.y+warningY*(canvas.height/528));
  const conveyor=find(entities,"entity:4")!.children;
  expect(conveyor.some(node=>node.label.startsWith("cargo:"))).toBe(false);
  const bounds=(await board.boundingBox())!;
  const x=bounds.x+bounds.width*8.5/12, y=bounds.y+bounds.height*2.5/12;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y+28);
  await expect.poll(async()=>(await scene(page,"structure:splitter"))?.angle).toBeCloseTo(180);
  await expect.poll(()=>scene(page,"rotation-preview")).toBeDefined();
  await expect.poll(()=>scene(page,"priority-mark:W")).toBeDefined();
  await expect.poll(async()=>{
    const entity=await scene(page,"entity:2");
    return entity?.children.filter(node=>node.label.startsWith("outlet:")).map(node=>node.label);
  }).toEqual(["outlet:S","outlet:W:clockwise"]);
  await page.mouse.up();
  expect(await page.evaluate(()=>window.boardTest.actions())).toEqual(["rotate:2,S"]);
  await page.evaluate(()=>window.boardTest.setMode("forward"));
  await expect.poll(()=>scene(page,"outlet:W:forward")).toBeDefined();
  await page.evaluate(()=>window.boardTest.setMode("alternating"));
  await expect.poll(()=>scene(page,"outlet:W:forward")).toBeUndefined();
  await expect.poll(()=>scene(page,"outlet:N")).toBeDefined();
  await page.evaluate(()=>window.boardTest.clearCargo());
  await expect.poll(()=>scene(page,"cargo:coal")).toBeUndefined();
  await expect.poll(()=>scene(page,"cargo-warning-mark")).toBeUndefined();
  expect(await scene(page,"cargo:iron_ingot")).toBeDefined();
});

test("atlas failure keeps glyphs, interaction and occupied-deposit names",async({page})=>{
  const failure=page.waitForEvent("requestfailed",{predicate:request=>request.url().includes("sector-nine-v06")});
  await page.route(atlas,route=>route.abort());
  await page.goto(fixture);
  await failure;
  const board=page.getByLabel("12 by 12 factory map");
  await expect(board.locator("canvas")).toHaveCount(1);
  await expect(board.getByLabel("copper deposit at (8,2), occupied by splitter")).toBeVisible();
  await expect.poll(()=>scene(page,"structure:splitter")).toMatchObject({text:"Sp"});
  await expect.poll(()=>scene(page,"cargo:coal")).toMatchObject({text:"Co"});
  const outer=(await board.boundingBox())!;
  const canvas=(await board.locator("canvas").boundingBox())!;
  await page.mouse.click(outer.x+1,canvas.y+canvas.height/8);
  await page.mouse.click(canvas.x+canvas.width/12-0.5,canvas.y+canvas.height*1.5/12);
  await page.mouse.click(canvas.x+canvas.width*8.5/12,canvas.y+canvas.height*2.5/12);
  expect(await page.evaluate(()=>window.boardTest.actions())).toEqual(["tile:0,1","tile:8,2"]);
});

test("atlas fallback keeps a blocked processor glyph and cargo clear of the warning",async({page})=>{
  await page.route(atlas,route=>route.abort());
  await page.goto(fixture);
  await expect.poll(()=>scene(page,"structure:splitter")).toMatchObject({text:"Sp"});
  await page.evaluate(()=>window.boardTest.addBlockedFabricator());
  await expect.poll(()=>scene(page,"structure:circuit_fabricator")).toMatchObject({text:expect.any(String)});
  const fabricator=(await scene(page,"entity:11"))!.children;
  const [x,y,width,height]=fabricator.find(node=>node.label==="cargo-warning-mark")!.bounds!;
  for(const label of ["structure:circuit_fabricator","cargo:circuit","cargo-stalled","outlet:N"]){
    const [left,top,w,h]=fabricator.find(node=>node.label===label)!.bounds!;
    expect(x+width<=left||left+w<=x||y+height<=top||top+h<=y,label).toBe(true);
  }
});

test("unmount destroys Pixi applications even while the atlas is pending",async({page})=>{
  let release!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  let requested!:()=>void;
  const request=new Promise<void>(resolve=>{requested=resolve;});
  await page.route(atlas,async route=>{requested();await blocked;await route.continue();});
  try{
    await page.goto(fixture,{waitUntil:"domcontentloaded"});
    const board=page.getByLabel("12 by 12 factory map");
    await expect(board.locator("canvas")).toHaveCount(1);
    await request;
    await page.evaluate(()=>window.boardTest.unmount());
    await expect(board).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>{
      const {initialized,destroyed}=window.boardTest.lifecycle();
      return initialized>0&&initialized===destroyed;
    })).toBe(true);
  }finally{
    release();
  }
});

test("renders linked corner sprites and updates both joins during rotation preview",async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await page.goto(fixture);
  const track=async(id:number)=>(await scene(page,`entity:${id}`))?.children.find(node=>node.label==="structure:conveyor");
  await expect.poll(()=>track(6)).toMatchObject({frame:[44,44],scaleMode:"nearest",textureLabel:"conveyor:N:W:N"});
  await expect.poll(()=>track(7)).toMatchObject({textureLabel:"conveyor:N:S:"});
  expect((await scene(page,"entity:6"))?.children.some(node=>node.label==="cargo:gear")).toBe(true);
  const bounds=(await page.getByTestId("factory-board").boundingBox())!;
  const x=bounds.x+bounds.width*3.5/12, y=bounds.y+bounds.height*8.5/12;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+26,y);
  await expect.poll(()=>track(6)).toMatchObject({textureLabel:"conveyor:E:W:"});
  await expect.poll(()=>track(7)).toMatchObject({textureLabel:"conveyor:N::"});
  await page.mouse.up();
  await page.setViewportSize({width:680,height:700});
  await expect.poll(()=>track(6)).toMatchObject({frame:[44,44],scaleMode:"nearest",textureLabel:"conveyor:N:W:N"});
});

test("preferred splitter arrow remains distinct in every direction and clears in alternating mode",async({page})=>{
  await page.goto(fixture);
  for(const [forward,clockwise] of [["N","E"],["E","S"],["S","W"],["W","N"]] as const){
    await page.evaluate(({forward})=>{
      window.boardTest.setDirection(forward);
      window.boardTest.setMode("clockwise");
    },{forward});
    await expect.poll(()=>scene(page,`outlet:${forward}`)).toBeDefined();
    await expect.poll(()=>scene(page,`outlet:${clockwise}:clockwise`)).toBeDefined();
    await expect.poll(()=>scene(page,`priority-mark:${clockwise}`)).toBeDefined();
    await page.evaluate(()=>window.boardTest.setMode("forward"));
    await expect.poll(()=>scene(page,`outlet:${forward}:forward`)).toBeDefined();
    await expect.poll(()=>scene(page,`priority-mark:${forward}`)).toBeDefined();
    await expect.poll(()=>scene(page,`priority-mark:${clockwise}`)).toBeUndefined();
  }
  await page.evaluate(()=>window.boardTest.setMode("alternating"));
  await expect.poll(()=>scene(page,"priority-mark:W")).toBeUndefined();
});

test("real pointer capture loss and frame release both clear the rotate preview",async({page})=>{
  await page.goto(fixture);
  const board=page.getByTestId("factory-board");
  const canvas=(await board.locator("canvas").boundingBox())!;
  const x=canvas.x+canvas.width*8.5/12;
  const y=canvas.y+canvas.height*2.5/12;
  await board.evaluate(el=>{
    el.addEventListener("gotpointercapture",event=>{
      (el as HTMLElement).dataset.captureId=String((event as PointerEvent).pointerId);
    });
  });
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y+28);
  await expect.poll(()=>scene(page,"rotation-preview")).toBeDefined();
  await board.evaluate(el=>{
    const id=Number((el as HTMLElement).dataset.captureId);
    if(!el.hasPointerCapture(id))throw Error("Expected active pointer capture.");
    el.releasePointerCapture(id);
  });
  await page.mouse.move(x,y+30);
  await expect.poll(()=>scene(page,"rotation-preview")).toBeUndefined();
  await page.mouse.up();
  expect(await page.evaluate(()=>window.boardTest.actions())).toEqual([]);

  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width-1,y);
  await expect.poll(()=>scene(page,"rotation-preview")).toBeDefined();
  await page.mouse.move(canvas.x+canvas.width+1,y);
  await expect.poll(()=>scene(page,"rotation-preview")).toBeUndefined();
  await page.mouse.up();
  expect(await page.evaluate(()=>window.boardTest.actions())).toEqual([]);

  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width-1,y);
  await page.mouse.up();
  expect(await page.evaluate(()=>window.boardTest.actions())).toEqual(["rotate:2,E"]);
});
