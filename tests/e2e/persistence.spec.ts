import {test,expect,type Page} from "@playwright/test";
async function tile(page:Page,x:number,y:number){
 const board=page.getByTestId("factory-board");
 await expect(board.locator("canvas")).toBeVisible();
 const bounds=await board.boundingBox();if(!bounds)throw Error("Board not visible");
 await board.locator("canvas").click({position:{x:(x+.5)*bounds.width/12,y:(y+.5)*bounds.height/12}});
}
test("AC13 rapid construction, reload and reset never resurrect old state",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Conveyor/}).click();
 for(let x=4;x<10;x++)await tile(page,x,5);
 await expect(page.getByTestId("cash")).toHaveText("270.00 Cr");
 await expect(page.getByTestId("save-status")).toHaveText("Saved");
 await page.reload();
 await expect(page.getByTestId("cash")).toHaveText("270.00 Cr");
 await page.getByRole("button",{name:"New Game / Factory Reset"}).click();
 page.on("dialog",dialog=>dialog.accept());
});
test("AC13 rapid edits persist; reset clears snapshots across reload",async({page})=>{
 page.on("dialog",dialog=>dialog.accept());
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Conveyor/}).click();
 for(let x=4;x<10;x++)await tile(page,x,5);
 await expect(page.getByTestId("cash")).toHaveText("270.00 Cr");
 await expect(page.getByTestId("save-status")).toHaveText("Saved");
 await page.reload();
 await expect(page.getByTestId("cash")).toHaveText("270.00 Cr");
 await page.getByRole("button",{name:"New Game / Factory Reset"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.reload();
 await expect(page.getByRole("dialog")).toBeVisible();
 await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
});
test("AC09 real ore sale survives reload",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Iron Mine/}).click();
 await tile(page,3,5);
 await page.getByRole("button",{name:/Conveyor/}).click();
 for(let x=4;x<10;x++)await tile(page,x,5);
 await expect(page.getByText("First Delivery")).toBeVisible({timeout:10000});
 await expect(page.getByText(/1 \/ 10 ore sold/)).toBeVisible({timeout:20000});
 await page.getByRole("button",{name:/Pause/}).click();
 await expect(page.getByTestId("save-status")).toHaveText("Saved");
 await page.reload();
 await expect(page.getByText(/ore sold/)).toBeVisible();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});

for(const schemaVersion of [3,99,5]){
 test(`WP1 schema ${schemaVersion} rejected, cancel preserves bytes, confirmed restart persists M1`,async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  const rejected={schemaVersion,marker:"original invalid data"};
  await page.evaluate(snapshot=>new Promise<void>((resolve,reject)=>{
   const open=indexedDB.open("sector-nine-v0.1",1);
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result;
    const tx=db.transaction("snapshots","readwrite");
    tx.objectStore("snapshots").put(snapshot,"slot1");
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>reject(tx.error);
   };
  }),rejected);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(schemaVersion===5?/corrupt/i:/unsupported/i);
  const restart=page.getByRole("button",{name:"Start new game"});
  const confirmation=page.getByRole("dialog",{name:"Confirm restart"});
  await restart.focus();
  await page.keyboard.press("Enter");
  await expect(confirmation.getByRole("button",{name:"Cancel"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(restart).toBeFocused();
  await restart.click();
  await confirmation.getByRole("button",{name:"Cancel"}).click();
  await expect(restart).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Save error"})).toBeVisible();
  expect(await page.evaluate(()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open("sector-nine-v0.1",1);
   open.onsuccess=()=>{
    const db=open.result;
    const read=db.transaction("snapshots").objectStore("snapshots").get("slot1");
    read.onsuccess=()=>{db.close();resolve(read.result);};
    read.onerror=()=>reject(read.error);
   };
   open.onerror=()=>reject(open.error);
  }))).toEqual(rejected);
  await page.getByRole("button",{name:"Start new game"}).click();
  await page.getByRole("button",{name:"Replace save and restart"}).click();
  await expect(page.getByRole("button",{name:"Begin Operations"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:"Begin Operations"})).toBeVisible();
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
 });
}

test("WP1 a second tab cannot restore the campaign after a confirmed reset",async({page,context})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Conveyor/}).click();
 await tile(page,4,5);
 await expect(page.getByTestId("cash")).toHaveText("295.00 Cr");
 await expect(page.getByTestId("save-status")).toHaveText("Saved");

 const resettingTab=await context.newPage();
 await resettingTab.goto("/");
 await expect(resettingTab.getByTestId("cash")).toHaveText("295.00 Cr");
 resettingTab.once("dialog",dialog=>dialog.accept());
 await resettingTab.getByRole("button",{name:"New Game / Factory Reset"}).click();
 await expect(resettingTab.getByRole("button",{name:"Begin Operations"})).toBeVisible();

 await page.bringToFront();
 await page.evaluate(()=>{
  const toggle=[...document.querySelectorAll("button")].find(button=>/^(▶ Run|Ⅱ Pause)$/.test(button.textContent??""));
  toggle?.click();
 });
 await expect(page.getByRole("alert")).toContainText("restarted in another tab");
 await resettingTab.reload();
 await expect(resettingTab.getByRole("button",{name:"Begin Operations"})).toBeVisible();
 await expect(resettingTab.getByTestId("cash")).toHaveText("300.00 Cr");
});
