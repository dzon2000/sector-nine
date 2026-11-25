import {test,expect,type Page} from "@playwright/test";

async function seed(page:Page,mutations:{mission?:string;foundryStorySeen?:boolean;coalUnlocked?:boolean}){
  await page.evaluate(async values=>{
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open("sector-nine-v0.1",1);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result;
        const tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots");
        const get=store.get("slot1");
        get.onsuccess=()=>{
          const state=get.result;
          if(!state){reject(new Error("Missing snapshot"));return;}
          if(values.mission)state.mission.activeId=values.mission;
          if(values.foundryStorySeen!==undefined)state.foundryStorySeen=values.foundryStorySeen;
          if(values.coalUnlocked!==undefined)state.technologies.coal_extraction=values.coalUnlocked;
          store.put(state,"slot1");
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  },mutations);
}
test("WP5 M5 story can be skipped and replayed without blocking progress (AC-15)",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await seed(page,{mission:"M5",foundryStorySeen:false});
  await page.reload();
  await expect(page.getByRole("dialog",{name:"Foundry Directive"})).toBeVisible();
  await expect(page.getByRole("heading",{name:/FOUNDRY RESTORATION/})).toBeVisible();
  await page.getByRole("button",{name:"Skip Directive"}).click();
  await expect(page.getByRole("dialog",{name:"Foundry Directive"})).toHaveCount(0);
  await expect(page.getByText("Below the Surface")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog",{name:"Foundry Directive"})).toHaveCount(0);
  const menu=page.getByRole("button",{name:"Menu",exact:true});
  await menu.press("Enter");
  await page.getByRole("button",{name:"Replay Foundry Directive"}).press("Enter");
  const replay=page.getByRole("dialog",{name:"Foundry Directive"});
  await expect(replay.getByRole("heading",{name:/FOUNDRY RESTORATION/})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(replay.getByRole("button",{name:"Next",exact:true})).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(replay.getByRole("heading",{name:"CONDITIONAL AUTHORIZATION"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(replay).toHaveCount(0);
  await expect(menu).toBeFocused();
});
test("WP5 coal palette, deposits and typed inspector are usable (AC-01, 02, 14)",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await expect(page.getByRole("button",{name:/Coal Mine/})).toContainText("Locked");
  await seed(page,{mission:"M5",foundryStorySeen:true,coalUnlocked:true});
  await page.reload();
  await expect(page.getByRole("button",{name:/Coal Mine/})).not.toContainText("Locked");
  await expect(page.getByText("(7,9) · (5,9)",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/Coal Mine/}).click();
  const board=page.getByTestId("factory-board");
  const bounds=await board.boundingBox();if(!bounds)throw Error("Board absent");
  await board.locator("canvas").click({position:{x:7.5*bounds.width/12,y:9.5*bounds.height/12}});
  await expect(page.getByRole("heading",{name:"Coal Mine"})).toBeVisible();
  await expect(page.getByText("Below the Surface")).toBeVisible();
});
