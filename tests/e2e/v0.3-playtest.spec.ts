import {test,expect,type Page} from "@playwright/test";

async function seed(page:Page,mutation:"m5-ready"|"m6-streak"|"m7-starved"|"legacy-m6"){
  await page.evaluate(async mutation=>{
    await new Promise<void>((resolve,reject)=>{
      const open=indexedDB.open("sector-nine-v0.1",1);
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result,tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots"),request=store.get("slot1");
        request.onsuccess=()=>{
          const s=request.result;
          if(!s){reject(new Error("Missing saved campaign"));return;}
          s.foundryStorySeen=true;s.introOpen=false;
          const empty=()=>({iron_ore:0,iron_ingot:0,coal:0,gear:0,steel:0});
          if(mutation==="m5-ready"){
            s.mission.activeId="M5";s.mission.soldCoal=9;s.technologies.coal_extraction=true;
            s.entities.push({id:2,kind:"conveyor",x:9,y:5,direction:"E",belt:"coal",output:null,oreInput:0,
              inputBuffers:{},reservedInputs:{},cycle:null,status:"working"});s.nextId=3;
            s.materialLedger.coal.opening=1;s.paused=false;
          }else{
            s.tick=60;s.paused=mutation!=="m6-streak";
            s.rollingEvents=Array.from({length:60},(_,i)=>({tick:i+1,revenueCents:0,costCents:0}));
            s.lastEvent=s.rollingEvents.at(-1);
            s.mission.activeId=mutation==="m7-starved"?"M7":"M6";
            s.missionRuleVersion=mutation==="legacy-m6"?2:3;
            if(s.missionRuleVersion===3){
              s.missionMetrics={activatedAtTick:0,streakTicks:mutation==="m6-streak"?119:0,lastEvaluatedTick:60,
                salesTicks:Array.from({length:60},(_,i)=>({
                  tick:i+1,sales:{...empty(),gear:mutation==="m6-streak"&&i>=1&&i<=10?1:0}
                }))};
            }else s.missionMetrics=null;
            s.diagnostics={samples:[]};
            s.technologies.mechanical_components=true;
            if(mutation==="m6-streak"){s.sales.gear=10;s.mission.soldGear=10;s.materialLedger.gear.opening=10;s.materialLedger.gear.sold=10;}
          }
          store.put(s,"slot1");
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  },mutation);
}
test("WP5 new M5 to M6 teaches rate and meaningful missing-capacity hint without new modal",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await seed(page,"m5-ready");await page.reload();
  await expect(page.getByText("Mechanical Precision")).toBeVisible({timeout:8000});
  const footer=page.locator("footer");
  await expect(footer).toContainText("9 gears in EVERY trailing 60 active ticks");
  await expect(footer).toContainText("120 consecutive ticks");
  await expect(footer).toContainText("one furnace may not provide enough ingots");
  await expect(page.getByTestId("mission-throughput")).toContainText("Gear sales: 0/9");
  await expect(page.getByTestId("mission-bottleneck")).toContainText("Collect 60 active mission ticks");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("WP5 M6 to M7 transitions to simultaneous targets and highlights coal/steel shortfall",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
  await seed(page,"m6-streak");await page.reload();
  await expect(page.getByText("The Old Foundry")).toBeVisible({timeout:8000});
  const footer=page.locator("footer");
  await expect(footer).toContainText("TWO streams selling together");
  await expect(footer).toContainText("7 gears, 7 steel and 175.00 Cr");
  await expect(page.getByTestId("mission-throughput")).toContainText("Steel sales: 0/7");
  await expect(page.getByTestId("mission-bottleneck")).toContainText("Collect 60 active mission ticks");
});
test("WP5 legacy M6 retains 8-gear guidance rather than v3 120-tick requirement",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
  await seed(page,"legacy-m6");await page.reload();
  await expect(page.locator("footer")).toContainText("Legacy campaign: sell eight gears");
  await expect(page.getByTestId("mission-throughput")).toHaveCount(0);
});
test("WP6 legacy rule provenance in downloaded playtest JSON",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await seed(page,"legacy-m6");await page.reload();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
  await page.getByTestId("stop-playtest").click();
  const downloadPromise=page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  const download=await downloadPromise;
  const stream=await download.createReadStream();
  const chunks:string[]=[];
  for await(const chunk of stream)chunks.push(chunk.toString("utf8"));
  const report=JSON.parse(chunks.join(""));
  expect(report).toMatchObject({
    format:"sector-nine-playtest-v1",schemaVersion:3,missionRuleVersion:2
  });
});
test("WP5 opt-in local playtest records only real commands, reloads and exports anonymized JSON",async({page})=>{
  page.on("dialog",d=>d.accept());
  await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await expect(page.getByTestId("playtest-status")).toHaveCount(0);
  await page.getByTestId("start-playtest").click();
  await page.getByRole("radio",{name:"Planning / routing"}).check();
  await page.getByRole("button",{name:/Conveyor/}).click();
  const board=page.getByTestId("factory-board");
  const bounds=await board.boundingBox();if(!bounds)throw Error("Board absent");
  await board.locator("canvas").click({position:{x:4.5*bounds.width/12,y:5.5*bounds.height/12}});
  await page.locator(".inspector").getByRole("button",{name:"Rotate clockwise"}).click();
  await page.locator(".inspector").getByRole("button",{name:"Demolish",exact:true}).click();
  await expect(page.getByTestId("playtest-panel")).toContainText("placed 1, rotated 1, demolished 1, researched 0");
  await page.reload();
  await expect(page.getByTestId("playtest-panel")).toContainText("placed 1, rotated 1, demolished 1, researched 0");
  await page.getByTestId("stop-playtest").click();
  const downloadPromise=page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe("sector-nine-playtest.json");
  const stream=await download.createReadStream();
  const chunks:string[]=[];
  for await(const chunk of stream)chunks.push(chunk.toString("utf8"));
  const report=JSON.parse(chunks.join(""));
  expect(report.format).toBe("sector-nine-playtest-v1");
  expect(report.schemaVersion).toBe(3);
  expect(report.missionRuleVersion).toBe(3);
  expect(report.commands).toEqual({place:1,turn:1,demolish:1,research:0});
  expect(report.commandEvents.map((e:{kind:string})=>e.kind)).toEqual(["place","turn","demolish"]);
  expect(report).toHaveProperty("planningMs");
  expect(report).toHaveProperty("waitingMs");
  expect(report).toHaveProperty("pausedMs");
  expect(report).toHaveProperty("activeTicks");
  expect(JSON.stringify(report)).not.toMatch(/email|userAgent|ipAddress|deviceId/i);
});

test("WP5 damaged optional playtest data cannot block loading or contaminate recorder",async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem("sector-nine-v0.3-local-playtest",JSON.stringify({active:true,commands:{}}));
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await expect(page.getByTestId("cash")).toHaveText("300.00 Cr");
  await page.getByRole("button",{name:/Local playtest/}).click();
  await expect(page.getByTestId("start-playtest")).toBeVisible();
  await expect(page.getByTestId("playtest-status")).toHaveCount(0);
});
