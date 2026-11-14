import {test,expect} from "@playwright/test";

test("WP6 browser playtest/export stays local; no unsolicited remote telemetry",async({page})=>{
  const externalRequests:string[]=[];
  const host=new URL(test.info().project.use.baseURL??"http://127.0.0.1:5173").origin;
  page.on("request",request=>{
    const url=request.url();
    if(!url.startsWith("http://")&&!url.startsWith("https://"))return;
    const u=new URL(url);
    if(u.origin!==host && u.hostname!=="localhost" && u.hostname!=="127.0.0.1")
      externalRequests.push(u.origin);
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  await page.getByRole("button",{name:/Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
  await page.getByRole("radio",{name:"Waiting for mission/stability"}).check();
  await page.getByTestId("stop-playtest").click();
  const download=page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  await download;
  await page.reload();
  await expect(page.getByTestId("factory-board")).toBeVisible();
  expect(externalRequests).toEqual([]);
});