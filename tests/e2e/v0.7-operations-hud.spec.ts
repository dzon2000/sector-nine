import {expect,test} from "@playwright/test";

for(const [width,height] of [[1280,720],[1440,900],[430,860],[1024,576]] as const){
  test(`operations HUD and whole map fit ${width}×${height}`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.goto("/");
    await page.getByRole("button",{name:"Skip Introduction"}).click();
    const map=page.getByTestId("factory-board");
    const canvas=map.locator("canvas");
    await expect(canvas).toBeVisible();
    const stage=page.getByTestId("mission-hud");
    await expect(map).toBeInViewport({ratio:1});
    await expect(stage).toBeInViewport({ratio:1});
    const bounds=await canvas.boundingBox();
    if(!bounds)throw Error("Map canvas missing.");
    expect(bounds.width).toBeCloseTo(bounds.height,0);
    if(height>=720&&width>=1280)expect(bounds.width).toBe(528);
    await expect(stage.getByText("Iron ore produced · 0 / 1",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(async()=>{
      await document.fonts.ready;
      return [...document.fonts].filter(font=>font.status==="loaded").map(font=>font.family);
    })).toEqual(expect.arrayContaining(["Inter","Barlow Semi Condensed"]));
  });
}

test("keyboard opens briefing and archive without moving focus or changing the objective",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause/}).click();
  const stage=page.getByTestId("mission-hud");
  const briefing=stage.getByRole("button",{name:"Briefing",exact:true});
  await briefing.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Mission Briefing"});
  await expect(dialog.getByRole("heading",{name:"Restore Extraction"})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Close briefing"})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(briefing).toBeFocused();
  const archive=stage.getByRole("button",{name:"Archive",exact:true});
  await archive.press("Enter");
  await page.getByRole("dialog",{name:"Transmission Archive"})
    .getByRole("button",{name:"Close archive"}).click();
  await expect(archive).toBeFocused();
  await expect(stage.getByText("OPERATIONS CONSOLE // M1")).toBeVisible();
  await expect(page.getByRole("button",{name:/Run/})).toBeVisible();
});

test("palette uses atlas art and identifies the selected tool at compact width",async({page})=>{
  await page.setViewportSize({width:430,height:860});
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  const construction=page.getByRole("button",{name:/Construction panel/});
  await construction.click();
  const palette=page.getByRole("complementary",{name:"Construction and technology panel"});
  await expect(palette.getByRole("heading",{name:"Extraction"})).toBeVisible();
  const mine=palette.getByRole("button",{name:/Iron Mine/});
  await expect(mine.locator("[data-atlas-frame=iron_mine]")).toBeVisible();
  await mine.click();
  await expect(mine).toHaveAttribute("aria-pressed","true");
  await expect(construction).toContainText("Iron Mine");
});

declare const process:{env:Record<string,string|undefined>};

test("approved live M1 desktop review",async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause/}).click();
  await page.getByRole("button",{name:/^Iron Mine/}).click();
  await expect(page.getByText("Tool · Iron Mine")).toBeVisible();
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.SECTOR9_WP2_CAPTURE_DIR)
    await page.screenshot({path:`${process.env.SECTOR9_WP2_CAPTURE_DIR}/m1-1280x720.png`});
});

test("paid M15 shows live power and selected blockage on desktop and compact",async({page})=>{
  await page.clock.install({time:new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/");
  await page.getByRole("button",{name:"Chapter Playtest",exact:true}).click();
  await page.getByRole("combobox",{name:"Starting chapter"}).selectOption("iv");
  await page.getByRole("combobox",{name:"Recipient route"}).selectOption("corporate");
  await page.getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 2077 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Start Chapter IV"}).click();
  await page.getByRole("button",{name:/Run$/}).click();
  await page.clock.runFor(30_000);
  const hud=page.getByTestId("mission-hud");
  await expect(hud.getByRole("heading",{name:"Ship raw copper"})).toBeVisible();
  await page.getByRole("button",{name:/Pause$/}).click();
  const board=page.getByTestId("factory-board");
  const bounds=await board.boundingBox();
  if(!bounds)throw Error("Map frame missing.");
  await board.click({position:{x:1.5*bounds.width/12,y:7.5*bounds.height/12}});
  const inspector=page.getByRole("complementary",{name:"Inspector and diagnostics panel"});
  await inspector.getByRole("button",{name:"Rotate clockwise"}).click();
  await page.getByRole("button",{name:/Run$/}).click();
  await page.clock.runFor(60_000);
  await page.getByRole("button",{name:/Pause$/}).click();
  await expect(page.getByText("Tick 2167 · PAUSED",{exact:true})).toBeVisible();
  await expect(page.getByTestId("hud-power")).toHaveText("2 / 2");
  await expect(hud.getByText("Copper ore shipped · 0 / 3")).toBeVisible();
  await expect(inspector.getByText("! Output blocked",{exact:true})).toBeVisible();
  await expect(page.getByText("Tool · Inspect · ! Output blocked",{exact:true})).toBeVisible();
  await expect(page.getByTestId("profit")).toHaveText("573.65 Cr");
  const take=async(size:string)=>{
    if(process.env.SECTOR9_WP2_CAPTURE_DIR){
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:`${process.env.SECTOR9_WP2_CAPTURE_DIR}/m15-${size}.png`});
    }
  };
  await take("1440x900");
  await page.setViewportSize({width:430,height:860});
  await expect(board).toBeInViewport({ratio:1});
  await expect(hud).toBeInViewport({ratio:1});
  await expect(hud.getByRole("button",{name:"Return to Campaign"})).toBeInViewport({ratio:1});
  await expect(hud.getByRole("button",{name:"Reset Chapter Playtest"})).toBeInViewport({ratio:1});
  await expect(hud.getByText("Copper ore shipped · 0 / 3",{exact:true})).toBeInViewport({ratio:1});
  await expect(page.getByRole("button",{name:"Inspector panel · Blocked",exact:true})).toBeInViewport({ratio:1});
  await take("430x860");

  await page.getByRole("combobox",{name:"Simulation speed"}).selectOption("2");
  await page.getByRole("button",{name:/Run$/}).click();
  await page.clock.runFor(1_000);
  await page.getByRole("button",{name:/Pause$/}).click();
  await expect(page.getByText("Tick 2169 · PAUSED",{exact:true})).toBeVisible();
  await expect(board).toBeInViewport({ratio:1});
  await expect(page.getByRole("button",{name:"Inspector panel · Blocked",exact:true})).toBeVisible();
  if(process.env.SECTOR9_WP3_CAPTURE_DIR){
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:`${process.env.SECTOR9_WP3_CAPTURE_DIR}/m15-compact-2x.png`});
  }
});

test("Menu help replay contains keyboard focus and returns it to Menu on Escape",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause/}).click();
  const menu=page.getByRole("button",{name:"Menu",exact:true});
  await menu.press("Enter");
  await page.getByRole("button",{name:"Help / Replay Intro"}).press("Enter");
  const heading=page.getByRole("dialog").getByRole("heading",{name:"CORPORATE OPERATIONS // SECTOR 9"});
  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog").getByRole("button",{name:"Next",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect(page.getByRole("button",{name:/Run$/})).toBeVisible();
});
