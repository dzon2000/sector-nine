import {test,expect,type Page} from "@playwright/test";

/** Seed validated deterministic active-tick fixture; no UI timer or animation inference. */
async function seedDiagnostics(page:Page,legacy=false){
  await page.evaluate(async legacySave=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open("sector-nine-v0.1",1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction("snapshots","readwrite");
        const store=tx.objectStore("snapshots");
        const req=store.get("slot1");
        req.onsuccess=()=>{
          const s=req.result;
          if(!s){reject(new Error("No game save"));return;}
          const items=["iron_ore","iron_ingot","coal","gear","steel"] as const;
          const empty=()=>Object.fromEntries(items.map(item=>[item,0]));
          s.tick=60;s.paused=true;s.introOpen=false;s.foundryStorySeen=true;
          s.mission.activeId="M6";s.mission.soldGear=9;
          s.missionRuleVersion=legacySave?2:3;
          s.missionMetrics=legacySave?null:{
            activatedAtTick:0,streakTicks:1,lastEvaluatedTick:60,
            salesTicks:Array.from({length:60},(_,i)=>({
              tick:i+1,sales:{...empty(),gear:i<9?1:0}
            }))
          };
          s.rollingEvents=Array.from({length:60},(_,i)=>({
            tick:i+1,revenueCents:i<9?2100:0,costCents:0
          }));
          s.lastEvent=s.rollingEvents.at(-1);
          s.sales.gear=9;
          s.materialLedger.gear.opening=9;
          s.materialLedger.gear.sold=9;
          s.totalRevenueCents=18900;s.balanceCents=48900;
          s.technologies.mechanical_components=true;
          s.entities.push(
            {id:2,kind:"conveyor",x:9,y:5,direction:"E",output:null,belt:null,oreInput:0,
              cycle:null,status:"waiting_for_inputs",inputBuffers:{},reservedInputs:{}},
            {id:3,kind:"furnace",x:5,y:5,direction:"E",output:null,belt:null,oreInput:0,
              cycle:null,status:"waiting_for_inputs",inputBuffers:{},reservedInputs:{}}
          );
          s.nextId=4;
          s.diagnostics={samples:Array.from({length:60},(_,i)=>({
            tick:i+1,
            entities:{
              "1":{status:"idle",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:0},
              "2":{status:"idle",completedUnits:0,conveyorMoves:i<9?1:0,conveyorStalledTicks:0},
              "3":{status:"input_starved",completedUnits:0,conveyorMoves:0,conveyorStalledTicks:0}
            },
            terminalSales:{...empty(),gear:i<9?1:0}
          }))};
          store.put(s,"slot1");
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  },legacy);
}
async function select(page:Page,x:number,y:number){
  await page.getByTestId("factory-board").locator("canvas").click({
    position:{x:x*44+22,y:y*44+22}
  });
}
test("WP4 mission HUD, terminal and inspector show source-derived counters across reload",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await seedDiagnostics(page);
  await page.reload();
  const hud=page.getByTestId("mission-throughput");
  await expect(hud).toContainText("Gear sales: 9/9 per 60 ticks");
  await expect(hud).toContainText("Stable: 1/120 consecutive qualifying ticks");
  await expect(page.getByTestId("mission-bottleneck")).toContainText("maintain stable throughput");
  await expect(page.getByTestId("terminal-throughput")).toContainText("gear: 9");
  await select(page,5,5);
  await expect(page.getByTestId("entity-diagnostics")).toContainText("Missing inputs");
  await expect(page.getByTestId("entity-diagnostics")).toContainText("100% (60 ticks)");
  await expect(page.getByTestId("diagnostic-hint")).toContainText("Missing iron ore");
  await select(page,9,5);
  await expect(page.getByTestId("entity-diagnostics")).toContainText("Moved: 9 items");
  await page.reload();
  await expect(page.getByTestId("mission-throughput")).toContainText("Stable: 1/120");
  await expect(page.getByTestId("terminal-throughput")).toContainText("gear: 9");
});
test("WP4 legacy active M6 retains cumulative progress without v3 throughput HUD",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await seedDiagnostics(page,true);
  await page.reload();
  await expect(page.getByTestId("mission-throughput")).toHaveCount(0);
  await expect(page.getByText("9 / 8 gears sold")).toBeVisible();
  await expect(page.getByTestId("terminal-throughput")).toContainText("gear: 9");
});
