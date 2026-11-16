import {test,expect,type Page} from "@playwright/test";

async function boardCenter(page:Page,x:number,y:number){
 const rect=await page.getByTestId("factory-board").boundingBox();
 if(!rect)throw Error("Factory board missing");
 return {x:rect.x+rect.width*(x+.5)/12,y:rect.y+rect.height*(y+.5)/12};
}
async function drag(page:Page,p:{x:number;y:number},dx:number,dy:number){
 await page.mouse.move(p.x,p.y);await page.mouse.down();
 await page.waitForTimeout(150); // actual press-and-hold instead of immediate pointermove
 await page.mouse.move(p.x+dx,p.y+dy,{steps:5});await page.mouse.up();
}
test("PR #8: direct rotation works while Conveyor construction remains selected",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 const board=page.getByTestId("factory-board");
 await page.getByRole("button",{name:/Conveyor/}).click();
 const a=await boardCenter(page,4,4);
 await page.mouse.click(a.x,a.y);
 // Simulates human: no explicit Inspect tool switch before press-drag.
 await drag(page,a,0,-30);
 await page.getByRole("button",{name:"Inspect",exact:true}).click();
 await page.mouse.click(a.x,a.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
 await page.reload();
 await page.getByRole("button",{name:"Inspect",exact:true}).click();
 const after=await boardCenter(page,4,4);
 await page.mouse.click(after.x,after.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
});

test("PR #8: drag existing structure never creates construction or demolition action",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 const board=page.getByTestId("factory-board");
 await page.getByRole("button",{name:/Conveyor/}).click();
 let a=await boardCenter(page,4,4);await page.mouse.click(a.x,a.y);
 const occupiedCount=await board.evaluate(el=>el.querySelectorAll("canvas").length);
 expect(occupiedCount).toBe(1);
 await drag(page,a,30,0);
 await page.getByRole("button",{name:"Inspect",exact:true}).click();
 await page.mouse.click(a.x,a.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
 await drag(page,a,0,-30);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
 // Old construction tool can still place in an empty cell.
 await page.getByRole("button",{name:/Conveyor/}).click();
 const empty=await boardCenter(page,5,4);
 await page.mouse.click(empty.x,empty.y);
 await page.getByRole("button",{name:"Inspect",exact:true}).click();
 await page.mouse.click(empty.x,empty.y);
 await expect(page.getByRole("heading",{name:"Conveyor"})).toBeVisible();
});

test("PR #8: one press-drag places and rotates once, with facing saved after reload",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 const recorder=page.getByTestId("playtest-panel");
 await recorder.getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 await page.getByRole("button",{name:/^Conveyor/}).click();
 const start=await boardCenter(page,4,4);
 const adjacent=await boardCenter(page,4,3);
 await page.mouse.move(start.x,start.y);
 await page.mouse.down();
 await expect(recorder).toContainText("placed 1, rotated 0");
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
 await page.mouse.move(adjacent.x,adjacent.y,{steps:5});
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
 await page.mouse.up();
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
 await expect(recorder).toContainText("placed 1, rotated 1");

 await page.reload();
 await page.getByRole("button",{name:"Inspect",exact:true}).click();
 const reloaded=await boardCenter(page,4,4);
 const empty=await boardCenter(page,4,3);
 await page.mouse.click(empty.x,empty.y);
 await expect(page.getByTestId("selected-facing")).toHaveCount(0);
 await page.mouse.click(reloaded.x,reloaded.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
});

test("PR #8: cancelling a new structure's rotation keeps the placement at its starting facing",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 const recorder=page.getByTestId("playtest-panel");
 await recorder.getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 for(const [x,cancellation] of [[3,"Escape"],[4,"pointercancel"],[5,"lostpointercapture"],[6,"outside"]] as const){
   await page.getByRole("button",{name:/^Conveyor/}).click();
   const start=await boardCenter(page,x,4);
   await page.mouse.move(start.x,start.y);
   await page.mouse.down();
   await page.mouse.move(start.x,start.y-30,{steps:3});
   if(cancellation==="Escape")await page.keyboard.press("Escape");
   else if(cancellation==="outside")await page.mouse.move(start.x,0);
   else await page.getByTestId("factory-board").dispatchEvent(cancellation,{pointerId:1});
   await page.mouse.up();
   await page.getByRole("button",{name:"Inspect",exact:true}).click();
   await page.mouse.click(start.x,start.y);
   await expect(page.getByTestId("selected-facing")).toHaveText("E");
 }
 await expect(recorder).toContainText("placed 4, rotated 0");
});

async function chapterII(page:Page){
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.evaluate(async()=>{
   await new Promise<void>((resolve,reject)=>{
     const req=indexedDB.open("sector-nine-v0.1",1);
     req.onerror=()=>reject(req.error);
     req.onsuccess=()=>{
       const db=req.result,tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots");
       const get=store.get("slot1");
       get.onsuccess=()=>{
         const s=get.result;
         s.mission.activeId="DONE";
         s.chapterII={foundryCompleted:true,started:false,completed:false,storySeen:false,metrics:null};s.foundryStorySeen=true;s.paused=true;
         s.technologies.coal_extraction=true;
         s.technologies.mechanical_components=true;
         s.technologies.advanced_smelting=true;
         s.balanceCents=100000;
         store.put(s,"slot1");
       };
       tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
     };
   });
 });
 await page.reload();
 await page.getByTestId("begin-chapter-ii").click();
}

test("PR #8: deposit overlays appear only over unrelated structures",async({page})=>{
 await chapterII(page);
 await expect(page.getByTestId("deposit-marker-copper")).toHaveCount(0);
 await expect(page.getByTestId("deposit-marker-silicon")).toHaveCount(0);
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("Copper");
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("Silicon");

 // A representative M1–M7 layout occupies both newly revealed sites.
 await page.getByRole("button",{name:/Conveyor/}).click();
 const silicon=await boardCenter(page,8,9);await page.mouse.click(silicon.x,silicon.y);
 await page.getByRole("button",{name:/^Furnace/}).click();
 const copper=await boardCenter(page,8,2);await page.mouse.click(copper.x,copper.y);
 await expect(page.getByTestId("deposit-marker-copper")).toBeVisible();
 await expect(page.getByTestId("deposit-marker-silicon")).toBeVisible();
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("occupied by Conveyor");
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("occupied by Furnace");
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("Clear");
 await page.reload();
 await expect(page.getByTestId("deposit-marker-copper")).toBeVisible();
 await expect(page.getByTestId("deposit-marker-silicon")).toBeVisible();
 await expect(page.getByTestId("chapter-deposit-status")).toContainText("occupied");

 await page.getByRole("button",{name:/Technology \+/}).click();
 await page.once("dialog",dialog=>dialog.accept());
 await page.getByTestId("unlock-resource_surveying").click();
 for(const [name,building,y] of [["copper","Copper Mine",2],["silicon","Silicon Extractor",9]] as const){
   const point=await boardCenter(page,8,y);
   const marker=page.getByTestId(`deposit-marker-${name}`);
   await page.getByRole("complementary",{name:/Construction and technology/})
     .getByRole("button",{name:"Demolish",exact:true}).click();
   await page.once("dialog",dialog=>dialog.accept());
   await page.mouse.click(point.x,point.y);
   await expect(marker).toHaveCount(0);
   await page.getByRole("button",{name:new RegExp(`^${building}`)}).click();
   await page.mouse.click(point.x,point.y);
   await expect(page.getByRole("heading",{name:building,exact:true})).toBeVisible();
   await expect(marker).toHaveCount(0);
 }
 await expect(page.getByTestId("chapter-deposit-status")).not.toContainText("Clear");
 await page.reload();
 await expect(page.getByTestId("deposit-marker-copper")).toHaveCount(0);
 await expect(page.getByTestId("deposit-marker-silicon")).toHaveCount(0);
});
