import {expect,test,type Page} from "@playwright/test";

declare const process:{env:Record<string,string|undefined>};

async function openFactory(page:Page,width:number,height:number){
  await page.setViewportSize({width,height});
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause$/}).click();
  const board=page.getByTestId("factory-board");
  await expect(board.locator("canvas")).toBeVisible();
  return board;
}

async function selectBuildTool(page:Page,name:RegExp,compact:boolean){
  const construction=page.getByRole("button",{name:/Construction panel/});
  if(compact)await construction.click();
  await page.getByRole("button",{name}).click();
  if(compact)await construction.click();
}

for(const [width,height] of [[1280,720],[430,860],[1024,576]] as const){
  test(`inner surface owns tiles and frame never builds at ${width}×${height}`,async({page})=>{
    const compact=width<=980;
    const board=await openFactory(page,width,height);
    const outer=(await board.boundingBox())!;
    const canvas=(await board.locator("canvas").boundingBox())!;
    await selectBuildTool(page,/^Conveyor/,compact);
    for(const {x,y} of [
      {x:outer.x+1,y:canvas.y+canvas.height/8},
      {x:outer.x+outer.width-1,y:canvas.y+canvas.height/8},
      {x:canvas.x+canvas.width/8,y:outer.y+1},
      {x:canvas.x+canvas.width/8,y:outer.y+outer.height-1},
    ])await page.mouse.click(x,y);
    await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");

    // Near the left internal division, the outer frame maps this point into column 1;
    // the displayed canvas still shows column 0.
    const x=canvas.x+canvas.width/12-0.5;
    const y=canvas.y+canvas.height*1.5/12;
    await page.mouse.click(x,y);
    if(compact)await page.getByRole("button",{name:/Inspector panel/}).click();
    const inspector=page.getByRole("complementary",{name:"Inspector and diagnostics panel"});
    await expect(inspector.getByRole("definition").filter({hasText:"(0, 1)"})).toHaveCount(1);
    await expect(page.getByTestId("cash")).toHaveText("295.00 Cr");

    const inspectorToggle=page.getByRole("button",{name:/Inspector panel/});
    for(const [nextX,nextY,tile] of [
      [canvas.x+canvas.width*6.5/12,canvas.y+canvas.height*6.5/12,"(6, 6)"],
      [canvas.x+canvas.width-1,canvas.y+canvas.height-1,"(11, 11)"],
    ] as const){
      if(compact)await inspectorToggle.click();
      await page.mouse.click(nextX,nextY);
      if(compact)await inspectorToggle.click();
      await expect(inspector.getByRole("definition").filter({hasText:tile})).toHaveCount(1);
    }
    await expect(page.getByTestId("cash")).toHaveText("285.00 Cr");
  });
}

test("placement marks valid and invalid tiles with different symbols without changing funds",async({page})=>{
  const board=await openFactory(page,1280,720);
  await selectBuildTool(page,/^Iron Mine/,false);
  const canvas=(await board.locator("canvas").boundingBox())!;
  const hover=async(x:number,y:number)=>page.mouse.move(canvas.x+(x+.5)*canvas.width/12,canvas.y+(y+.5)*canvas.height/12);
  const preview=board.getByTestId("board-placement-preview");
  await hover(0,0);
  await expect(preview).toHaveText("×");
  await expect(preview).toHaveAccessibleName(/cannot build.*mines must be placed on an iron deposit/i);
  await hover(10,5);
  await expect(preview).toHaveAccessibleName(/cannot build.*tile is occupied/i);
  await hover(3,5);
  await expect(preview).toHaveText("+");
  await expect(preview).toHaveAccessibleName(/can build.*3,5/i);
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
  if(process.env.SECTOR9_WP3_CAPTURE_DIR)
    await board.screenshot({path:`${process.env.SECTOR9_WP3_CAPTURE_DIR}/placement-valid.png`});
  await hover(0,0);
  if(process.env.SECTOR9_WP3_CAPTURE_DIR)
    await board.screenshot({path:`${process.env.SECTOR9_WP3_CAPTURE_DIR}/placement-invalid.png`});
  await page.mouse.move(canvas.x-1,canvas.y+10);
  await expect(preview).toHaveCount(0);
});


test.describe("high density board",()=>{
  test.use({deviceScaleFactor:2});
  test("maps a CSS-zoomed inner surface independently of backing pixels",async({page})=>{
    const board=await openFactory(page,1440,900);
    const canvas=board.locator("canvas");
    await expect(canvas).toHaveAttribute("width","1056");
    expect((await canvas.boundingBox())?.width).toBe(528);
    await board.evaluate(node=>{node.style.zoom="0.8";});
    await selectBuildTool(page,/^Conveyor/,false);
    const visible=(await canvas.boundingBox())!;
    expect(Math.abs(visible.width-528*0.8)).toBeLessThan(2);
    expect((await board.locator(".board-surface").boundingBox())?.width).toBe(visible.width);
    await page.mouse.click(visible.x+visible.width/12-0.5,visible.y+visible.height*1.5/12);
    await expect(page.getByRole("definition").filter({hasText:"(0, 1)"})).toHaveCount(1);
    await expect(page.getByTestId("cash")).toHaveText("295.00 Cr");
    await expect(canvas).toHaveAttribute("width","1056");
  });
});
