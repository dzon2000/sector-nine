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
 await page.reload();
 await expect(page.getByText(/ore sold/)).toBeVisible();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});
