import {test,expect,type Page} from "@playwright/test";
const center=async(page:Page,x:number,y:number)=>{
 const r=await page.getByTestId("factory-board").boundingBox();
 if(!r)throw Error("board not visible");
 return {x:r.x+(x+.5)*r.width/12,y:r.y+(y+.5)*r.height/12};
};
async function ready(page:Page){
 await page.goto("/");
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Conveyor/}).click();
 const p=await center(page,4,4);await page.mouse.click(p.x,p.y);
 await page.getByRole("button",{name:"Inspect"}).click();
 await page.mouse.click(p.x,p.y);
 await expect(page.getByRole("heading",{name:"Conveyor"})).toBeVisible();
 return p;
}
async function facing(page:Page){return page.getByRole("definition").count();}
async function drag(page:Page,start:{x:number;y:number},dx:number,dy:number){
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(start.x+dx,start.y+dy,{steps:5});
 await page.mouse.up();
}
test("WP4 #5 direct rotation cardinal directions and no-op preserve one event",async({page})=>{
 const p=await ready(page);
 await page.getByTestId("playtest-panel").getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 const direction=page.getByTestId("selected-facing");
 for(const [dx,dy,expected] of [[-30,0,"W"],[0,-30,"N"],[30,0,"E"],[0,30,"S"]] as const){
   await drag(page,p,dx,dy);
   await expect(direction).toHaveText(expected);
 }
 await drag(page,p,0,30);
 await expect(direction).toHaveText("S");
 await expect(page.getByTestId("playtest-panel")).toContainText("rotated 4");
 await page.reload();await page.getByRole("button",{name:"Inspect"}).click();
 const same=await center(page,4,4);await page.mouse.click(same.x,same.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("S");
});
test("WP4 #5 short drag, escape, cancellation, terminal and adjacent targets",async({page})=>{
 const p=await ready(page);
 await drag(page,p,3,3);
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-45,p.y);
 await page.keyboard.press("Escape");await page.mouse.up();
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
 const terminal=await center(page,10,5);await drag(page,terminal,-40,0);
 await page.mouse.click(p.x,p.y);await expect(page.getByTestId("selected-facing")).toHaveText("E");
 const other=await center(page,5,4);await drag(page,p,other.x-p.x,other.y-p.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("E");
});
test("WP4 #5 scaled board and placement tool do not rotate existing object",async({page})=>{
 const p=await ready(page);
 await page.getByTestId("factory-board").evaluate(el=>{(el as HTMLElement).style.width="360px";});
 const scaled=await center(page,4,4);
 await drag(page,scaled,0,-24);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
 await page.getByRole("button",{name:/Conveyor/}).click();
 await drag(page,scaled,30,0);
 await page.getByRole("button",{name:"Inspect"}).click();
 await page.mouse.click(scaled.x,scaled.y);
 await expect(page.getByTestId("selected-facing")).toHaveText("N");
});
