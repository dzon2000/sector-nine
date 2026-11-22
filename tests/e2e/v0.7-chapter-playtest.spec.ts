import {expect,test,type Page} from "@playwright/test";
import {trustedCiBuildCommit} from "../../src/ui/buildProvenance";

declare const process:{env:Record<string,string|undefined>};

test("a fresh browser can launch a paid Chapter II playtest and return to its untouched campaign",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Chapter Playtest",exact:true}).click({timeout:4000});
  const selector=page.getByRole("dialog",{name:"Chapter Playtest"});
  await expect(selector.getByText("Start at M8",{exact:true})).toBeVisible();
  await selector.getByRole("combobox",{name:"Starting chapter"}).selectOption("ii");
  await selector.getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Begin Chapter II"})).toBeVisible();
  await page.reload();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByRole("button",{name:"Skip Introduction"})).toBeVisible();
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
});

function picker(page:Page){
  return page.getByRole("dialog",{name:"Chapter Playtest"});
}

async function chooseChapter(page:Page,chapter:"ii"|"iii"|"iv",route?:"independent"|"corporate"){
  await page.getByRole("button",{name:"Chapter Playtest",exact:true}).click();
  await picker(page).getByRole("combobox",{name:"Starting chapter"}).selectOption(chapter);
  if(route)await picker(page).getByRole("combobox",{name:"Recipient route"}).selectOption(route);
}

for(const scenario of [
  {chapter:"iii",tick:1728,cash:"5033.45 Cr",mission:"M11",button:"Start Chapter III"},
  {chapter:"iv",route:"independent",tick:2099,cash:"7333.75 Cr",mission:"M14",button:"Start Chapter IV"},
  {chapter:"iv",route:"corporate",tick:2077,cash:"7724.25 Cr",mission:"M14",button:"Start Chapter IV"},
] as const){
  test(`Chapter ${scenario.chapter} ${"route" in scenario?scenario.route:""} offers the correct paid handoff`,async({page})=>{
    await page.goto("/");
    await chooseChapter(page,scenario.chapter,"route" in scenario?scenario.route:undefined);
    await expect(picker(page).getByText(`Start at ${scenario.mission}`,{exact:true})).toBeVisible();
    await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
    await expect(page.getByText(`Tick ${scenario.tick} · PAUSED`,{exact:true})).toBeVisible();
    await expect(page.getByTestId("cash")).toHaveText(scenario.cash);
    await expect(page.getByRole("combobox",{name:"Simulation speed"})).toHaveValue("1");
    await page.getByRole("button",{name:scenario.button}).click();
    await expect(page.getByText(`Tick ${scenario.tick} · PAUSED`,{exact:true})).toBeVisible();
    if("route" in scenario){
      await expect(page.getByText(/0 of 30 simulation ticks/)).toBeVisible();
      await expect(page.getByRole("heading",{
        name:scenario.route==="corporate"?"Redacted service ticket":"Maintenance-channel transmission",
      })).toBeVisible();
    }else{
      await expect(page.getByText("OPERATIONS CONSOLE // M11",{exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"Accept Contract"})).toBeVisible();
    }
  });
}

test("the campaign and recorder survive playtest trips, reset cancellation and confirmed reset",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause/}).click();
  await page.getByRole("button",{name:/^Conveyor/}).click();
  await page.getByTestId("factory-board").click({position:{x:18,y:18}});
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
  await expect(page.getByTestId("playtest-status")).toContainText("Recording");
  const campaign=await page.evaluate(()=>localStorage.getItem("sector-nine-v0.3-local-playtest"));

  await chooseChapter(page,"iv","corporate");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByTestId("cash")).toHaveText("7724.25 Cr");
  await expect(page.getByTestId("playtest-status")).toHaveCount(0);
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
  const download=page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  const stream=await (await download).createReadStream();
  const chunks:string[]=[];
  for await(const chunk of stream)chunks.push(chunk.toString("utf8"));
  expect(JSON.parse(chunks.join("")))
    .toMatchObject({format:"sector-nine-playtest-v1",schemaVersion:5,missionRuleVersion:5,
      buildCommit:trustedCiBuildCommit(process.env.GITHUB_ACTIONS,process.env.GITHUB_SHA),activeTicks:0,sessionOrigin:{kind:"chapter-playtest",chapter:"IV",
        startingMission:"M14",checkpointId:"iv-corporate",checkpointTick:2077,recipientRoute:"corporate"}});

  await page.getByRole("button",{name:"Start Chapter IV"}).click();
  await expect(page.getByRole("heading",{name:"Answer the Call"})).toBeVisible();
  await page.getByRole("button",{name:"Reset Chapter Playtest"}).click();
  await page.getByRole("dialog",{name:"Reset Chapter Playtest"}).getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByRole("heading",{name:"Answer the Call"})).toBeVisible();
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByTestId("cash")).toHaveText("295.00 Cr");
  expect(await page.evaluate(()=>localStorage.getItem("sector-nine-v0.3-local-playtest"))).toBe(campaign);

  await page.goBack();
  await expect(page.getByRole("heading",{name:"Answer the Call"})).toBeVisible();
  await expect(page.getByTestId("playtest-status")).toContainText("Recording");
  await page.goForward();
  await expect(page.getByTestId("cash")).toHaveText("295.00 Cr");
  await chooseChapter(page,"ii");
  await picker(page).getByRole("button",{name:"Resume Chapter Playtest"}).click();
  await expect(page.getByRole("heading",{name:"Answer the Call"})).toBeVisible();
  await page.getByRole("button",{name:"Reset Chapter Playtest"}).click();
  await page.getByRole("button",{name:"Restore checkpoint"}).click();
  await expect(page.getByRole("button",{name:"Start Chapter IV"})).toBeVisible();
  await expect(page.getByText("Tick 2077 · PAUSED",{exact:true})).toBeVisible();
  await expect(page.getByTestId("playtest-status")).toHaveCount(0);
});

test("back out of replacement or reject bad fixtures without losing the existing chapter save",async({page})=>{
  await page.goto("/");
  await chooseChapter(page,"ii");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await chooseChapter(page,"iv","corporate");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await picker(page).getByRole("button",{name:"Back"}).click();
  await picker(page).getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByRole("button",{name:"Chapter Playtest",exact:true})).toBeFocused();

  await chooseChapter(page,"iv","corporate");
  const fixture="**/iv-corporate.json*";
  const failures=[
    {response:{status:404,body:"missing"},message:/checkpoint unavailable/i},
    {response:{status:200,contentType:"application/json",body:"{"},message:/json|unexpected/i},
    {response:{json:{schemaVersion:99}},message:/unsupported save schema/i},
  ];
  for(const {response,message} of failures){
    await page.route(fixture,route=>route.fulfill(response));
    await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
    await picker(page).getByRole("button",{name:"Replace Chapter Playtest"}).click();
    await expect(picker(page).getByRole("alert").filter({hasText:message})).toBeVisible();
    await page.unroute(fixture);
  }
  await picker(page).getByRole("button",{name:"Resume Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await chooseChapter(page,"iv","corporate");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await picker(page).getByRole("button",{name:"Replace Chapter Playtest"}).click();
  await expect(page.getByText("Tick 2077 · PAUSED",{exact:true})).toBeVisible();
});

test("a URL without a previous chapter start leaves an untouched campaign available",async({page})=>{
  await page.goto("/?playtest");
  await expect(page.getByRole("heading",{name:"Chapter playtest unavailable"})).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("No saved chapter playtest");
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByRole("button",{name:"Skip Introduction"})).toBeVisible();
});

test("an older chapter tab cannot save or publish its recorder over a replaced playtest",async({page,context})=>{
  await page.goto("/");
  await chooseChapter(page,"ii");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();

  const other=await context.newPage();
  await other.goto(page.url());
  await expect(other.getByTestId("playtest-status")).toContainText("Recording");
  await other.getByRole("button",{name:"Reset Chapter Playtest"}).click();
  await other.getByRole("button",{name:"Restore checkpoint"}).click();
  await expect(other.getByTestId("playtest-status")).toHaveCount(0);
  await page.getByRole("button",{name:/Run/}).click();
  await expect(page.getByRole("alert")).toContainText(/restarted in another tab/i);
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByRole("button",{name:"Skip Introduction"})).toBeVisible();
  await other.reload();
  await expect(other.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await expect(other.getByTestId("playtest-status")).toHaveCount(0);
});

test("switching explicitly preserves campaign ticks between autosaves",async({page})=>{
  await page.clock.install({time:new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.clock.runFor(3000);
  await expect(page.getByText("Tick 3 · RUNNING",{exact:true})).toBeVisible();
  await chooseChapter(page,"ii");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByText("Tick 3 · PAUSED",{exact:true})).toBeVisible();
});

test("a stale campaign save cannot replace an existing recorded chapter playtest",async({page,context})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Skip Introduction"}).click();
  await page.getByRole("button",{name:/Pause/}).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await chooseChapter(page,"ii");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await expect(page.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
  await page.getByRole("button",{name:"Return to Campaign"}).click();
  await expect(page.getByRole("button",{name:/Run/})).toBeVisible();

  const other=await context.newPage();
  await other.goto("/");
  other.once("dialog",dialog=>void dialog.accept());
  await other.getByRole("button",{name:"New Game / Factory Reset"}).click();
  await expect(other.getByRole("button",{name:"Skip Introduction"})).toBeVisible();
  await chooseChapter(page,"iii");
  await picker(page).getByRole("button",{name:"Start Chapter Playtest"}).click();
  await picker(page).getByRole("button",{name:"Replace Chapter Playtest"}).click();
  await expect(picker(page).getByRole("alert")).toContainText(/could not save the current campaign/i);

  await other.goto("/?playtest");
  await expect(other.getByText("Tick 870 · PAUSED",{exact:true})).toBeVisible();
  await expect(other.getByTestId("playtest-status")).toContainText("Recording");
});
