import {test,expect} from "@playwright/test";

test("WP4 technology panel displays prerequisites and never auto-purchases",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await page.getByRole("button",{name:/Technology \+/}).click();
  await expect(page.getByTestId("technology-coal_extraction")).toContainText("Locked");
  await expect(page.getByTestId("technology-coal_extraction")).toContainText("Complete M4");
  await expect(page.getByTestId("technology-mechanical_components")).toContainText("Sell 20 iron ingots");
  await expect(page.getByTestId("technology-advanced_smelting")).toContainText("Own Coal Extraction");
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
});

test("WP4 purchase confirmation is cancellable; successful unlock persists after reload",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  // Seed an earned milestone in the game's own snapshot to test the browser UI
  // without simulating the whole v0.1 tutorial again. Normal purchases use UI commands.
  await page.evaluate(async()=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open("sector-nine-v0.1",1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction("snapshots","readwrite");
        const store=tx.objectStore("snapshots");
        const get=store.get("slot1");
        get.onsuccess=()=>{
          const state=get.result;
          if(!state){reject(new Error("Missing initial save"));return;}
          state.mission.activeId="DONE";
          state.mission.soldIngot=20;
          state.sales.iron_ingot=20;
          store.put(state,"slot1");
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  });
  await page.reload();
  await page.getByRole("button",{name:/Technology \+/}).click();
  const coal=page.getByTestId("technology-coal_extraction");
  await expect(coal).toContainText("Available");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.getByTestId("unlock-coal_extraction").click();
  await expect(coal).toContainText("Available");
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
  page.once("dialog",dialog=>dialog.accept());
  await page.getByTestId("unlock-coal_extraction").click();
  await expect(coal).toContainText("Unlocked");
  await expect(page.getByTestId("cash")).toHaveText("220.00 Cr");
  await page.reload();
  await page.getByRole("button",{name:/Technology \+/}).click();
  await expect(page.getByTestId("technology-coal_extraction")).toContainText("Unlocked");
  await expect(page.getByTestId("cash")).toHaveText("220.00 Cr");
});
