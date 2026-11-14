import {test,expect,type Page} from "@playwright/test";
async function launch(page:Page){
 await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Technology \+/}).click();
 await page.getByRole("button",{name:/Local playtest/}).click();
}
for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[1280,600]] as const){
 test("WP4 #7 fixed viewport and independent panels "+width+"×"+height,async({page})=>{
   await page.setViewportSize({width,height});await launch(page);
   const geometry=await page.evaluate(()=>{
     const board=document.querySelector('[data-testid="factory-board"]')!.getBoundingClientRect();
     const mission=document.querySelector('[data-testid="mission-hud"]')!.getBoundingClientRect();
     const header=document.querySelector("header")!.getBoundingClientRect();
     const left=document.querySelector(".palette") as HTMLElement,right=document.querySelector(".inspector") as HTMLElement;
     return {board:{top:board.top,bottom:board.bottom,width:board.width,height:board.height,left:board.left,right:board.right},
       mission:{top:mission.top,bottom:mission.bottom},header:{top:header.top,bottom:header.bottom},
       scrollY:document.documentElement.scrollHeight,scrollX:document.documentElement.scrollWidth,
       innerHeight:window.innerHeight,innerWidth:window.innerWidth,
       left:{client:left.clientHeight,scroll:left.scrollHeight},right:{client:right.clientHeight,scroll:right.scrollHeight}};
   });
   expect(geometry.scrollY).toBeLessThanOrEqual(height+2);
   expect(geometry.scrollX).toBeLessThanOrEqual(width+2);
   expect(geometry.board.width).toBeGreaterThan(150);
   expect(Math.abs(geometry.board.width-geometry.board.height)).toBeLessThan(3);
   expect(geometry.board.top).toBeGreaterThanOrEqual(geometry.header.bottom-1);
   expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.mission.top+1);
   expect(geometry.mission.bottom).toBeLessThanOrEqual(height+1);
   expect(geometry.left.scroll).toBeGreaterThan(geometry.left.client);
   expect(geometry.right.scroll).toBeGreaterThan(geometry.right.client);
 });
}
test("WP4 #7 mobile fallback exposes side panels via accessible toggles",async({page})=>{
 await page.setViewportSize({width:390,height:700});
 await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
 await expect(page.getByTestId("factory-board")).toBeVisible();
 await expect(page.getByTestId("mission-hud")).toBeVisible();
 await expect(page.getByRole("button",{name:/Construction panel/})).toBeVisible();
 await page.getByRole("button",{name:/Construction panel/}).click();
 await expect(page.getByRole("heading",{name:"Construction"})).toBeVisible();
});
