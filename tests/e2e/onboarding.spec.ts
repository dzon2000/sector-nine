import {test,expect} from "@playwright/test";
test("AC18 intro before build, begin tutorial, persistence on reload",async({page})=>{
 await page.goto("/");
 await expect(page.getByRole("dialog")).toBeVisible();
 await expect(page.getByText("Your predecessor's industrial complex")).toBeVisible();
 await page.getByRole("button",{name:"Begin Operations"}).click();
 await expect(page.getByText("Restore Extraction")).toBeVisible();
 await page.getByRole("button",{name:/Iron Mine/}).click();
 await page.reload();
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await expect(page.getByText("Restore Extraction")).toBeVisible();
});
