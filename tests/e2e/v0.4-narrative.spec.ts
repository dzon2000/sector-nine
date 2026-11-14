import {test,expect,type Page} from "@playwright/test";
async function startChapter(page:Page){
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await page.evaluate(async()=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open("sector-nine-v0.1",1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction("snapshots","readwrite");
        const get=tx.objectStore("snapshots").get("slot1");
        get.onsuccess=()=>{
          const s=get.result;if(!s){reject(Error("No saved game"));return;}
          s.mission.activeId="DONE";s.foundryStorySeen=true;s.paused=true;
          s.technologies.coal_extraction=true;s.technologies.mechanical_components=true;s.technologies.advanced_smelting=true;
          tx.objectStore("snapshots").put(s,"slot1");
        };
        tx.onerror=()=>reject(tx.error);
        tx.oncomplete=()=>{db.close();resolve();};
      };
    });
  });
  await page.reload();
  await page.getByTestId("begin-chapter-ii").click();
}
async function seedStage(page:Page,stage:"M9"|"M10"|"DONE"){
 await page.evaluate(async stage=>{
   await new Promise<void>((resolve,reject)=>{
     const req=indexedDB.open("sector-nine-v0.1",1);
     req.onerror=()=>reject(req.error);
     req.onsuccess=()=>{
       const db=req.result,tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots"),get=store.get("slot1");
       get.onsuccess=()=>{
         const s=get.result;
         s.mission.activeId=stage;
         s.technologies.resource_surveying=true;
         if(stage!=="M9"){s.technologies.circuit_fabrication=true;s.technologies.industrial_power=true;}
         s.chapterII.completed=stage==="DONE";
         s.chapterII.metrics=stage==="DONE"?null:{
            activatedAtTick:s.tick,salesTicks:[],streakTicks:0,totals:{
              iron_ore:0,iron_ingot:0,coal:0,gear:0,steel:0,copper_ore:0,silicon:0,circuit:0
            }
         };
         store.put(s,"slot1");
       };
       tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
     };
   });
 },stage);
 await page.reload();
}
test("WP5 Chapter II opening optional, skippable and persistently replayable",async({page})=>{
 await startChapter(page);
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Inspect Request"})).toBeVisible();
 await page.getByRole("button",{name:"Inspect Request"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("UNREGISTERED PROCUREMENT REQUEST");
 await page.getByRole("button",{name:"Next Transmission"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("No external client is registered");
 await page.getByRole("button",{name:"Return to Factory"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toHaveCount(0);
 await page.getByRole("button",{name:"Replay Unknown Client Request"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("Steel was the key");
 await page.getByRole("button",{name:"Skip Transmission"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toHaveCount(0);
});
test("WP5 milestone dispatches available in factory without modal interruption; completed factory remains playable",async({page})=>{
 await startChapter(page);
 await seedStage(page,"M9");
 await expect(page.getByRole("button",{name:"Replay Materials Verified"})).toBeVisible();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toHaveCount(0);
 await page.getByRole("button",{name:"Replay Materials Verified"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("PROJECT PROMETHEUS");
 await page.getByRole("button",{name:"Skip Transmission"}).click();
 await seedStage(page,"M10");
 await page.getByRole("button",{name:"Replay Signal Recovered"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("power itself");
 await page.getByRole("button",{name:"Skip Transmission"}).click();
 await seedStage(page,"DONE");
 await expect(page.getByRole("heading",{name:"First Signal Restored"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Replay Prometheus Archive"})).toBeVisible();
 await page.getByRole("button",{name:"Replay Prometheus Archive"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("SUBLEVEL 03");
 await page.getByRole("button",{name:"Next Transmission"}).click();
 await expect(page.getByRole("dialog",{name:"Chapter II Transmission"})).toContainText("Suspend investigation");
 await page.getByRole("button",{name:"Return to Factory"}).click();
 await expect(page.getByTestId("factory-board")).toBeVisible();
 await expect(page.getByRole("button",{name:/Run|Pause/})).toBeVisible();
});