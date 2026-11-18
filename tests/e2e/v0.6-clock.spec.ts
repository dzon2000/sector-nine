import {expect, test} from "@playwright/test";

test("M1 keyboard speed control, pause and visibility use fresh tick intervals", async ({page}) => {
  await page.clock.install({time: new Date("2026-01-01T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.goto("/");
  await page.getByRole("button", {name: "Begin Operations"}).click();
  const tickReadout = page.locator(".board-title");
  const speed = page.getByRole("combobox", {name: "Simulation speed"});
  const pause = page.getByRole("button", {name: /Pause/});
  const run = page.getByRole("button", {name: /Run/});
  await expect(speed).toHaveValue("1");
  await expect(page.getByText("Profit / sim min")).toBeVisible();
  await expect(tickReadout).toContainText("Tick 0");
  await page.getByRole("button", {name: /Local playtest/}).click();
  await page.getByTestId("start-playtest").click();
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
  await page.getByTestId("stop-playtest").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-playtest").click();
  const stream = await (await download).createReadStream();
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk.toString("utf8"));
  expect(JSON.parse(chunks.join(""))).toMatchObject({
    activeWallMs: 2400,
    activeTicks: 3,
    speedEvents: [
      {speed: 1, tick: 0, elapsedMs: 0},
      {speed: 2, tick: 0, elapsedMs: 900},
      {speed: 1, tick: 3, elapsedMs: 4400},
    ],
  });
});

test("speed remains visible in mobile tutorial", async ({page}) => {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto("/");
  await page.getByRole("button", {name: "Begin Operations"}).click();
  const speed = page.getByRole("combobox", {name: "Simulation speed"});
  await expect(speed).toBeInViewport({ratio: 1});
  await speed.selectOption("2");
  await expect(speed).toHaveValue("2");
});
