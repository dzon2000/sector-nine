import { expect, test, type Page } from "@playwright/test";
import type { ChapterIIIRoute } from "../../src/domain/contracts";
import { rotate, type GameState } from "../../src/domain/model";

// The browser test can call Node's built-ins without adding Node types to the app's TypeScript config.
declare const process: {
  execPath: string;
  env: Record<string, string | undefined>;
  getBuiltinModule(name: "node:child_process"): {
    execFileSync(command: string, args: string[], options: { env: typeof process.env; stdio: "pipe" }): void;
  };
  getBuiltinModule(name: "node:fs/promises"): {
    mkdtemp(prefix: string): Promise<string>;
    readFile(path: string, encoding: "utf8"): Promise<string>;
    rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  };
  getBuiltinModule(name: "node:os"): { tmpdir(): string };
  getBuiltinModule(name: "node:path"): { join(...parts: string[]): string };
};
const { execFileSync } = process.getBuiltinModule("node:child_process");
const { mkdtemp, readFile, rm } = process.getBuiltinModule("node:fs/promises");
const { tmpdir } = process.getBuiltinModule("node:os");
const { join } = process.getBuiltinModule("node:path");

let exportDirectory: string;

test.beforeAll(async () => {
  test.setTimeout(60_000);
  exportDirectory = await mkdtemp(join(tmpdir(), "sektor9-chapter-four-"));
  execFileSync(process.execPath, [
    "node_modules/vitest/vitest.mjs", "run", "tests/integration/economy/v0.4-recovery.test.ts",
    "-t", "exports validated post-M13 checkpoints",
  ], { env: { ...process.env, SEKTOR9_POST_M13_EXPORT_DIR: exportDirectory }, stdio: "pipe" });
});

test.afterAll(async () => {
  if (exportDirectory) await rm(exportDirectory, { recursive: true, force: true });
});

async function openCheckpoint(page: Page, route: ChapterIIIRoute): Promise<GameState> {
  const checkpoint: GameState = JSON.parse(await readFile(join(exportDirectory, route + ".json"), "utf8"));
  await page.route("**/__chapter-four-seed", request => request.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Checkpoint</title>",
  }), { times: 1 });
  await page.goto("/__chapter-four-seed");
  await page.evaluate(state => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("sector-nine-v0.1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("snapshots");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").add(state, "slot1");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), checkpoint);
  await page.goto("/");
  await expect(page.getByText(`Tick ${checkpoint.tick} · PAUSED`, { exact: true })).toBeVisible();
  return checkpoint;
}

test("Chapter IV is optional, starts by keyboard, and persists on the paid independent route", async ({ page }) => {
  const checkpoint = await openCheckpoint(page, "independent");
  await expect(page.getByText(/continue operating in free play/i)).toBeVisible();
  const start = page.getByRole("button", { name: "Start Chapter IV" });
  await expect(start).toBeVisible();
  await expect(page.getByRole("heading", { name: "M14 — Answer the Call" })).toHaveCount(0);
  await start.press("Enter");
  const dispatch = page.getByRole("heading", { name: "Maintenance-channel transmission" });
  await expect(dispatch).toBeVisible();
  await expect(page.getByRole("heading", { name: "M14 — Answer the Call" })).toBeFocused();
  await expect(page.getByText(/0 of 30 simulation ticks/)).toBeVisible();
  await expect(page.getByText(/longest circuit-sales gap/i)).toBeVisible();
  await expect(page.getByText(`Tick ${checkpoint.tick} · PAUSED`, { exact: true })).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(dispatch).toBeVisible();
  await expect(start).toHaveCount(0);
});

test("splitter routing survives reload and rotates relative to its facing", async ({ page }) => {
  const checkpoint = await openCheckpoint(page, "corporate");
  const splitter = checkpoint.entities.find(entity => entity.kind === "splitter" && entity.belt !== null);
  if (!splitter) throw new Error("Paid checkpoint must contain a splitter.");
  const board = page.getByTestId("factory-board");
  const selectSplitter = async () => {
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error("Factory board must be visible.");
    await board.click({ position: {
      x: (splitter.x + 0.5) * bounds.width / checkpoint.width,
      y: (splitter.y + 0.5) * bounds.height / checkpoint.height,
    } });
  };
  await selectSplitter();
  const routing = page.getByRole("combobox", { name: "Splitter routing" });
  await expect(routing).toHaveCount(0);
  await page.getByRole("button", { name: "Start Chapter IV" }).click();
  await expect(page.getByRole("heading", { name: "Redacted service ticket" })).toBeVisible();
  await expect(routing).toHaveValue("alternating");
  await expect(routing.getByRole("option", { name: `Priority forward (${splitter.direction})` })).toHaveCount(1);
  await expect(routing.getByRole("option", { name: `Priority clockwise (${rotate(splitter.direction)})` })).toHaveCount(1);
  const cargo = page.getByTestId("splitter-cargo");
  const originalCargo = await cargo.textContent();
  await routing.press("End");
  await expect(routing).toHaveValue("clockwise");
  await expect(cargo).toHaveText(originalCargo!);
  await expect(page.getByText(`Tick ${checkpoint.tick} · PAUSED`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rotate clockwise" }).click();
  await expect(routing).toHaveValue("clockwise");
  await expect(routing.getByRole("option", { name: `Priority clockwise (${rotate(rotate(splitter.direction))})` })).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await selectSplitter();
  await expect(routing).toHaveValue("clockwise");
});

test("M15 ships copper, restores circuit service after reload, and unlocks one reply", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await openCheckpoint(page, "independent");
  await page.getByRole("button", { name: "Start Chapter IV" }).click();
  await page.getByRole("button", { name: /Run$/ }).click();
  await page.clock.runFor(29_000);
  await expect(page.getByRole("heading", { name: "M14 — Answer the Call" })).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(page.getByRole("heading", { name: "M15 — Restore Service" })).toBeVisible();
  await expect(page.getByText("Copper ore shipped · 0 / 3")).toBeVisible();
  await page.clock.runFor(35_000);
  await expect(page.getByText("Copper ore shipped · 0 / 3")).toBeVisible();
  await page.getByRole("button", { name: /Pause$/ }).click();

  const board = page.getByTestId("factory-board");
  const tile = async () => {
    const bounds = (await board.boundingBox())!;
    return { x: bounds.x + bounds.width * 7.5 / 12, y: bounds.y + bounds.height * 1.5 / 12 };
  };
  await page.getByRole("button", { name: /^Demolish/ }).first().click();
  page.once("dialog", dialog => dialog.accept());
  const point = await tile();
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: /^Splitter(?:\s|$)/ }).click();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y - 18);
  await page.mouse.up();
  await page.getByRole("button", { name: /^Inspect/ }).first().click();
  await page.mouse.click(point.x, point.y);
  const routing = page.getByRole("combobox", { name: "Splitter routing" });
  await expect(routing.locator('option[value="forward"]')).toHaveText("Priority forward (N)");
  await page.getByRole("button", { name: /Run$/ }).click();
  await page.clock.runFor(50_000);
  await expect(page.getByText("Copper ore shipped · 3 / 3")).toBeVisible();
  await expect(page.getByText("Restore circuit continuity", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Pause$/ }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByText("Restore circuit continuity", { exact: true })).toBeVisible();
  const restoredPoint = await tile();
  await page.mouse.click(restoredPoint.x, restoredPoint.y);
  await page.getByRole("combobox", { name: "Splitter routing" }).selectOption("clockwise");
  await page.getByRole("button", { name: /Run$/ }).click();
  await page.clock.runFor(65_000);
  const reply = page.getByText("Sector 9, we can see your line again.", { exact: true });
  await expect(reply).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(reply).toBeVisible();
  await expect(page.getByText(/return to free play/i)).toBeVisible();
});
