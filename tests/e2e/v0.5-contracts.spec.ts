import {expect,test,type Page} from "@playwright/test";

type Stage="after-m10"|"after-m11"|"after-m12"|"after-m13";

async function openCheckpoint(page:Page,stage:Stage){
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await page.getByRole("button",{name:/Pause$/}).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.evaluate(async stage=>{
    await new Promise<void>((resolve,reject)=>{
      const open=indexedDB.open("sector-nine-v0.1",1);
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result;
        const transaction=db.transaction("snapshots","readwrite");
        const store=transaction.objectStore("snapshots");
        const read=store.get("slot1");
        read.onsuccess=()=>{
          const game=read.result;
          if(!game){reject(Error("No saved game"));return;}
          game.mission.activeId="DONE";
          game.chapterII={foundryCompleted:true,started:true,completed:true,storySeen:true,metrics:null};
          game.foundryStorySeen=true;
          for(const technology of Object.keys(game.technologies))game.technologies[technology]=true;
          if(stage!=="after-m10"){
            const corporate=stage==="after-m12"||stage==="after-m13";
            const completed=stage==="after-m13"?["M11","M12","M13"]:corporate?["M11","M12"]:["M11"];
            game.chapterIII={route:corporate?"corporate":null,completed,active:null};
          }
          store.put(game,"slot1");
        };
        transaction.oncomplete=()=>{db.close();resolve();};
        transaction.onerror=()=>reject(transaction.error);
      };
    });
  },stage);
  await page.reload();
}

test("WP4 enters Chapter III explicitly and restores accepted M11 progress",async({page})=>{
  await openCheckpoint(page,"after-m10");
  await expect(page.getByRole("heading",{name:"Recover the Archive"})).toHaveCount(0);
  const entry=page.getByRole("button",{name:"Start Chapter III",exact:true});
  await entry.focus();
  await page.keyboard.press("Enter");
  const contracts=page.getByTestId("chapter-three-contracts");
  await expect(contracts.getByRole("heading",{name:"Recover the Archive"})).toBeFocused();
  await expect(contracts.getByText("OPERATIONS CONSOLE // M11",{exact:true})).toBeVisible();
  await expect(contracts).toContainText(/circuits/i);
  await expect(contracts).toContainText(/gears/i);
  await expect(contracts).toContainText(/archive/i);

  await contracts.getByRole("button",{name:"Accept Contract",exact:true}).click();
  await expect(contracts).toContainText(/window/i);
  await expect(contracts).toContainText(/streak|consecutive/i);
  await expect(contracts.getByRole("button",{name:"Accept Contract",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:/Run$/}).click();
  await expect(contracts).toContainText(/Window:\s*[1-9]\d*\s*\/\s*60 active ticks/i);
  await page.getByRole("button",{name:/Pause$/}).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  const windowProgress=contracts.getByText(/^Window:/i);
  const savedProgress=await windowProgress.innerText();
  await page.reload();
  await expect(windowProgress).toHaveText(savedProgress);
});

for(const route of ["Independent","Corporate"] as const){
  test(`WP4 previews, cancels, confirms and reloads the ${route} route`,async({page})=>{
    await openCheckpoint(page,"after-m11");
    const contracts=page.getByTestId("chapter-three-contracts");
    await expect(contracts.getByRole("heading",{name:"Choose the Recipient"})).toBeVisible();
    await expect(contracts.getByText("OPERATIONS CONSOLE // M12",{exact:true})).toBeVisible();
    const routeButton=contracts.getByRole("button",{name:route,exact:true});
    await routeButton.click();
    const confirmation=page.getByRole("dialog",{name:"Confirm Route",exact:true});
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(route);
    await expect(confirmation.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirmation.getByRole("button",{name:"Confirm",exact:true})).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(routeButton).toBeFocused();

    await page.keyboard.press("Enter");
    await confirmation.getByRole("button",{name:"Cancel",exact:true}).click();
    await expect(routeButton).toBeFocused();
    await page.keyboard.press("Enter");
    await confirmation.getByRole("button",{name:"Confirm",exact:true}).click();
    await expect(confirmation).toHaveCount(0);
    await expect(contracts.getByRole("heading",{name:"Choose the Recipient"})).toBeFocused();
    await expect(contracts).toContainText(route);
    await expect(contracts).toContainText(route==="Independent"?/coal/i:/steel/i);
    await expect(routeButton).toHaveCount(0);
    const accept=contracts.getByRole("button",{name:"Accept Contract",exact:true});
    await expect(accept).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("Saved");
    await page.reload();
    await expect(accept).toBeVisible();
    await expect(contracts).toContainText(route);
    await accept.click();
    await expect(accept).toHaveCount(0);
    await expect(page.getByTestId("save-status")).toHaveText("Saved");
    await page.reload();
    await expect(accept).toHaveCount(0);
    await expect(contracts).toContainText(/window/i);
  });
}

for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[1280,600],[390,700]] as const){
  test(`WP4 keeps the M13 contract and map usable at ${width}×${height}`,async({page})=>{
    await page.setViewportSize({width,height});
    await openCheckpoint(page,"after-m12");
    const contracts=page.getByTestId("chapter-three-contracts");
    await expect(contracts.getByRole("heading",{name:"Reconstruct Prometheus"})).toBeVisible();
    await expect(contracts.getByText("OPERATIONS CONSOLE // M13",{exact:true})).toBeVisible();
    await contracts.getByRole("button",{name:"Accept Contract",exact:true}).click();
    await expect(contracts).toContainText(/profit/i);
    const [board,mission]=await Promise.all([
      page.getByTestId("factory-board").boundingBox(),
      page.getByTestId("mission-hud").boundingBox(),
    ]);
    expect(board).not.toBeNull();
    expect(mission).not.toBeNull();
    expect(board!.width).toBeGreaterThan(150);
    expect(Math.abs(board!.width-board!.height)).toBeLessThan(3);
    expect(board!.y+board!.height).toBeLessThanOrEqual(mission!.y+1);
    expect(mission!.y+mission!.height).toBeLessThanOrEqual(height+1);
    const pageSize=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    expect(pageSize.width).toBeLessThanOrEqual(width+2);
    expect(pageSize.height).toBeLessThanOrEqual(height+2);
  });
}

test("WP5 persists the briefing and exports actions from a local opt-in recording",async({page})=>{
  await openCheckpoint(page,"after-m10");
  expect(await page.evaluate(()=>localStorage.getItem("sector-nine-v0.3-local-playtest"))).toBeNull();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByRole("button",{name:"Start recording",exact:true}).click();
  const contracts=page.getByTestId("chapter-three-contracts");
  await contracts.getByRole("button",{name:"Start Chapter III"}).click();
  const briefing=contracts.getByRole("button",{name:"Read Project Prometheus Briefing"});
  const dialog=page.getByRole("dialog",{name:"Chapter III Transmission"});
  await briefing.click();
  await expect(dialog).toContainText("Sublevel 03");
  await dialog.getByRole("button",{name:"Skip Transmission"}).click();
  await expect(briefing).toBeFocused();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await briefing.click();
  await dialog.getByRole("button",{name:"Return to Factory"}).click();
  await contracts.getByRole("button",{name:"Accept Contract",exact:true}).click();
  await page.getByRole("button",{name:"Stop recording"}).click();
  const downloaded=page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  const stream=await (await downloaded).createReadStream();
  const decoder=new TextDecoder();
  let json="";
  for await(const chunk of stream)json+=decoder.decode(chunk,{stream:true});
  const report=JSON.parse(json+decoder.decode());
  expect(report).toMatchObject({schemaVersion:5,missionRuleVersion:5,chapterIIIRoute:null});
  expect(report.buildCommit===null||/^[a-f0-9]{40}$/.test(report.buildCommit)).toBe(true);
  expect(report.contractTransitions.map(({type}:{type:string})=>type)).toEqual(["chapter_started","contract_accepted"]);
  expect(report).not.toHaveProperty("startedAt");
  expect(report).not.toHaveProperty("lastContractProgress");
});

test("WP5 replays the shared conclusion and leaves the completed factory running",async({page})=>{
  await openCheckpoint(page,"after-m13");
  const contracts=page.getByTestId("chapter-three-contracts");
  const conclusion=contracts.getByRole("button",{name:"Read Prometheus Reconstruction"});
  await conclusion.click();
  const dialog=page.getByRole("dialog",{name:"Chapter III Transmission"});
  await expect(dialog).toContainText("RECONSTRUCTION VERIFIED");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(contracts.getByRole("heading",{name:"Project Prometheus Complete"})).toBeVisible();
  await expect(contracts.getByRole("button",{name:"Accept Contract"})).toHaveCount(0);
  const tick=page.locator(".board-title").getByText(/^Tick/);
  const before=await tick.innerText();
  await page.getByRole("button",{name:/Run$/}).click();
  await expect.poll(async()=>Number((await tick.innerText()).match(/^Tick (\d+)/)?.[1]))
    .toBeGreaterThan(Number(before.match(/^Tick (\d+)/)?.[1]));
});
