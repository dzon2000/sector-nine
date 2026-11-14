import {test,expect} from "@playwright/test";
declare const process:{env:Record<string,string|undefined>};
const original=process.env.GITHUB_ACTIONS==="true"&&/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA??"")
  ?process.env.GITHUB_SHA!:null;
async function report(page:import("@playwright/test").Page){
 const promise=page.waitForEvent("download");
 await page.getByTestId("export-playtest").click();
 const download=await promise;
 const stream=await download.createReadStream();
 const parts:string[]=[];
 for await(const part of stream)parts.push(part.toString("utf8"));
 return JSON.parse(parts.join(""));
}
test("WP5 exported build provenance is exact CI checkout SHA or JSON null",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 await page.getByRole("radio",{name:"Waiting for mission/stability"}).check();
 await page.waitForTimeout(75);
 await page.getByTestId("stop-playtest").click();
 const payload=await report(page);
 expect(payload).toMatchObject({format:"sector-nine-playtest-v1",schemaVersion:3,missionRuleVersion:3});
 expect(payload).toHaveProperty("buildCommit",original);
 expect(payload.waitingForMissionMs).toBeGreaterThanOrEqual(0);
 expect(payload.waitingMs).toBe(0);
 expect(payload.wallMs).toBe(payload.pausedMs+payload.waitingMs+payload.waitingForMissionMs+
   payload.planningMs+payload.unclassifiedMs);
 expect(payload).toHaveProperty("poweredTicks");
 expect(payload).toHaveProperty("unpoweredTicks");
 expect(JSON.stringify(payload)).not.toMatch(/email|userAgent|ipAddress|deviceId/i);
});
test("WP5 original provenance and mission classification survive reload unchanged",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 await page.getByRole("radio",{name:"Waiting for mission/stability"}).check();
 await page.waitForTimeout(100);
 await page.reload();
 await expect(page.getByRole("radio",{name:"Waiting for mission/stability"})).toBeChecked();
 await page.getByTestId("stop-playtest").click();
 const exported=await report(page);
 expect(exported.buildCommit).toBe(original);
 expect(exported.waitingForMissionMs).toBeGreaterThanOrEqual(0);
});
test("WP5 legacy local session missing new metadata is readable and not relabeled",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Begin Operations"}).click();
 await page.getByRole("button",{name:/Local playtest/}).click();
 await page.getByTestId("start-playtest").click();
 await page.getByTestId("stop-playtest").click();
 await page.evaluate(()=>{
   const key="sector-nine-v0.3-local-playtest",s=JSON.parse(localStorage.getItem(key)!);
   delete s.buildCommit;delete s.waitingForMissionMs;delete s.poweredTicks;delete s.unpoweredTicks;
   localStorage.setItem(key,JSON.stringify(s));
 });
 await page.reload();
 const exported=await report(page);
 expect(exported.format).toBe("sector-nine-playtest-v1");
 expect(exported.buildCommit).toBeNull();
 expect(exported.waitingForMissionMs).toBe(0);
 expect(exported.waitingMs).toBe(0);
});