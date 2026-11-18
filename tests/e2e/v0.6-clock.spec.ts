import {expect, test} from "@playwright/test";

test("M1 keyboard speed control, pause and visibility use fresh tick intervals", async ({page}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await page.getByRole("button", {name: "Begin Operations"}).click();
  const tickReadout = page.locator(".board-title");
  const speed = page.getByRole("combobox", {name: "Simulation speed"});
  const pause = page.getByRole("button", {name: /Pause/});
  const run = page.getByRole("button", {name: /Run/});
  await expect(speed).toHaveValue("1");
  await expect(page.getByText("Profit / sim min")).toBeVisible();
  await expect(tickReadout).toContainText("Tick 0");
  await page.clock.runFor(900);
  await speed.focus();
  await speed.press("ArrowDown");
  await speed.press("Enter");
  await expect(speed).toHaveValue("2");
  await page.clock.runFor(499);
  await expect(tickReadout).toContainText("Tick 0");
  await page.clock.runFor(1);
  await expect(tickReadout).toContainText("Tick 1");

  await pause.click();
  await page.clock.runFor(1000);
  await expect(tickReadout).toContainText("Tick 1");
  await expect(speed).toHaveValue("2");
  await run.click();
  await page.clock.runFor(499);
  await expect(tickReadout).toContainText("Tick 1");
  await page.clock.runFor(1);
  await expect(tickReadout).toContainText("Tick 2");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {configurable: true, value: true});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(1000);
  await expect(tickReadout).toContainText("Tick 2");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {configurable: true, value: false});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(speed).toHaveValue("2");
  await run.click();
  await page.clock.runFor(500);
  await expect(tickReadout).toContainText("Tick 3");
  await pause.click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(speed).toHaveValue("1");
  await expect(tickReadout).toContainText("Tick 3");
});

test("speed remains visible in mobile tutorial", async ({page}) => {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto("/");
  await page.getByRole("button", {name: "Begin Operations"}).click();
  const speed = page.getByRole("combobox", {name: "Simulation speed"});
  await expect(speed).toBeInViewport();
  await speed.selectOption("2");
  await expect(speed).toHaveValue("2");
});
