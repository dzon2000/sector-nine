import {test,expect} from "@playwright/test";

test("WP6 hidden-tab pause does not advance active ticks or mission window",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Begin Operations"}).click();
  // Use a real app visibilitychange notification. The browser may stay focused in CI;
  // override only the read-only document.hidden property for this deterministic E2E fixture.
  await page.evaluate(()=>{
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button",{name:/Run/})).toBeVisible();
  const before=await page.getByText(/Tick \d+ · PAUSED/).textContent();
  await page.waitForTimeout(1400);
  await expect(page.getByText(/Tick \d+ · PAUSED/)).toHaveText(before!);
  await page.reload();
  await expect(page.getByText(/Tick \d+ · PAUSED/)).toHaveText(before!);
  await expect(page.getByRole("button",{name:/Run/})).toBeVisible();
});
