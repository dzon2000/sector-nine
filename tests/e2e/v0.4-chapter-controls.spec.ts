import {test,expect,type Page} from "@playwright/test";
async function reachFoundry(page:Page){
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.evaluate(async()=>{
   await new Promise<void>((resolve,reject)=>{
     const open=indexedDB.open("sector-nine-v0.1",1);
     open.onerror=()=>reject(open.error);
     open.onsuccess=()=>{
       const db=open.result,tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots");
       const get=store.get("slot1");
       get.onsuccess=()=>{
         const s=get.result;
         if(!s){reject(Error("Missing existing save"));return;}
         s.mission.activeId="DONE";s.foundryStorySeen=true;
         s.technologies.coal_extraction=true;s.technologies.mechanical_components=true;
         s.technologies.advanced_smelting=true;s.paused=true;
         store.put(s,"slot1");
       };
       tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
     };
   });
 });
 await page.reload();
}
test("WP4 Chapter II starts only by explicit action, reveals resources and paid research",async({page})=>{
 await reachFoundry(page);
 await expect(page.getByTestId("begin-chapter-ii")).toBeVisible();
 await expect(page.getByText("Foundry Restored")).toBeVisible();
 await page.reload();
 await expect(page.getByTestId("begin-chapter-ii")).toBeVisible();
 await page.getByTestId("begin-chapter-ii").click();
 await expect(page.getByRole("heading",{name:"Unregistered Materials"})).toBeVisible();
 await expect(page.getByTestId("chapter-objectives")).toContainText("Copper sold: 0/10");
 await expect(page.getByTestId("technology-resource_surveying")).toContainText("Available");
 await expect(page.getByTestId("technology-circuit_fabrication")).toContainText("Locked");
 await expect(page.getByTestId("technology-industrial_power")).toContainText("Locked");
 await expect(page.getByRole("button",{name:/Copper Mine/})).toContainText("Locked");
 await page.once("dialog",dialog=>dialog.accept());
 await page.getByTestId("unlock-resource_surveying").click();
 await expect(page.getByTestId("technology-resource_surveying")).toContainText("Unlocked");
 await expect(page.getByTestId("cash")).toHaveText("220.00 Cr");
 await expect(page.getByRole("button",{name:/Copper Mine/})).not.toContainText("Locked");
 await page.reload();
 await page.getByRole("button",{name:/Technology \\+/}).click();
 await expect(page.getByTestId("chapter-objectives")).toContainText("Copper sold: 0/10");
 await expect(page.getByTestId("technology-resource_surveying")).toContainText("Unlocked");
 await expect(page.getByTestId("begin-chapter-ii")).toHaveCount(0);
});
test("WP4 Chapter II construction controls support physical deposit placement and inspection",async({page})=>{
 await reachFoundry(page);
 await page.getByTestId("begin-chapter-ii").click();
 await page.once("dialog",dialog=>dialog.accept());
 await page.getByTestId("unlock-resource_surveying").click();
 await page.getByRole("button",{name:/Copper Mine/}).click();
 const board=page.getByTestId("factory-board");
 const bounds=await board.boundingBox();if(!bounds)throw Error("Board absent");
 const x=bounds.width*8.5/12,y=bounds.height*2.5/12;
 await board.click({position:{x,y}});
 await expect(page.getByRole("heading",{name:"Copper Mine"})).toBeVisible();
 await expect(page.getByTestId("cash")).toHaveText("145.00 Cr");
 await page.getByRole("button",{name:"Inspect"}).click();
 await board.click({position:{x,y}});
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
});
