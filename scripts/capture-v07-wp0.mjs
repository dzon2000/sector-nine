import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const art = "/docs/specifications/art/v0.7-wp0";
const output = resolve(process.argv[2] ?? join(root, art, "captures"));
const dimensions = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 430, height: 860 },
];
const temp = await mkdtemp(join(tmpdir(), "sektor9-wp0-"));
let browser;
let server;

try {
  execFileSync(process.execPath, [
    "node_modules/vitest/vitest.mjs", "run", "tests/integration/economy/v0.4-recovery.test.ts",
    "-t", "exports validated post-M13 checkpoints",
  ], { cwd: root, env: { ...process.env, SEKTOR9_POST_M13_EXPORT_DIR: temp }, stdio: "inherit" });

  server = await createServer({ root, server: { host: "127.0.0.1" } });
  await server.listen();
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  const [domain, commands, chapter, simulation, diagnostics, validator] = await Promise.all([
    "/src/domain/model.ts", "/src/game/commands.ts", "/src/game/chapterFour.ts",
    "/src/simulation/engine.ts", "/src/game/diagnostics.ts", "/src/persistence/indexedDb.ts",
  ].map(path => server.ssrLoadModule(path)));
  const early = validator.validateSave(commands.setPause(commands.begin(domain.createGame()), true));
  const checkpoint = JSON.parse(await readFile(join(temp, "corporate.json"), "utf8"));
  const started = chapter.beginChapterIV(checkpoint);
  assert.equal(started.ok, true);
  let late = commands.setPause(started.state, false);
  for (let index = 0; index < 30; index++) late = simulation.tick(late);
  assert.equal(late.chapterIV.activeId, "M15");
  const conveyor = late.entities.find(entity => entity.x === 1 && entity.y === 7);
  assert.equal(conveyor.kind, "conveyor");
  const rerouted = commands.face(late, conveyor.id, "E");
  assert.equal(rerouted.ok, true);
  late = rerouted.state;
  for (let index = 0; index < 60; index++) late = simulation.tick(late);
  late = validator.validateSave(commands.setPause(late, true));
  assert.equal(late.chapterIV.activeId, "M15");
  assert.equal(late.chapterIV.copperShipmentTicks.length, 0);
  const selected = late.entities.find(entity => entity.id === conveyor.id);
  const diagnostic = diagnostics.entityDiagnostics(late, selected.id);
  assert.ok(late.diagnostics.samples.at(-1).entities[selected.id].conveyorStalledTicks > 0);

  const atlas = JSON.parse(await readFile(join(root, "src/rendering/assets/sector-nine-v06.json"), "utf8"));
  const scenes = [
    { id: "m1", state: early, tool: "Iron Mine", selected: null },
    { id: "m15", state: late, tool: "Inspect", selected, diagnostic },
  ];
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--enable-unsafe-swiftshader"],
  });
  await mkdir(output, { recursive: true });
  for (const scene of scenes) {
    console.info(scene.id, JSON.stringify({
      tick: scene.state.tick, balanceCents: scene.state.balanceCents,
      operating: domain.stats(scene.state), power: scene.state.power &&
        { supply: scene.state.power.supply, demand: scene.state.power.demand },
      selected: scene.selected && { x: scene.selected.x, y: scene.selected.y, cargo: scene.selected.belt },
      diagnostic: scene.diagnostic,
    }));
    const board = await captureArtwork(scene, origin);
    for (const viewport of dimensions) {
      const size = viewport.width + "x" + viewport.height;
      await usingPage(viewport, async page => {
        await openGame(page, origin, scene);
        await page.screenshot({ path: join(output, `baseline-${scene.id}-${size}.png`) });
      });
      await usingPage(viewport, async page => {
        await openPreview(page, scene, board, origin, domain, atlas);
        await verifyPreview(page);
        await page.screenshot({ path: join(output, `preview-${scene.id}-${size}.png`) });
      });
    }
    await usingPage({ width: 1024, height: 576 }, async page => {
      await openPreview(page, scene, board, origin, domain, atlas);
      await verifyPreview(page);
    });
  }
  console.info("WP0 captures, keyboard disclosure/focus return, and layout checks complete.");
} finally {
  await browser?.close();
  await server?.close();
  await rm(temp, { recursive: true, force: true });
}

async function usingPage(viewport, run) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function seed(page, origin, state) {
  await page.route(origin + "/__wp0_seed", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>WP0 seed</title>",
  }));
  await page.goto(origin + "/__wp0_seed");
  await page.evaluate(state => new Promise((resolveSeed, rejectSeed) => {
    const open = indexedDB.open("sector-nine-v0.1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("snapshots");
    open.onerror = () => rejectSeed(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").add(state, "slot1");
      transaction.oncomplete = () => { open.result.close(); resolveSeed(); };
      transaction.onabort = () => { open.result.close(); rejectSeed(transaction.error); };
    };
  }), state);
}

async function openGame(page, origin, scene, captureOnly = false) {
  await seed(page, origin, scene.state);
  const atlasLoaded = page.waitForResponse(response =>
    response.url().includes("sector-nine-v06.png") && response.headers()["content-type"]?.startsWith("image/"));
  await page.goto(origin);
  await page.getByText(`Tick ${scene.state.tick} · PAUSED`, { exact: true }).waitFor();
  await atlasLoaded;
  const board = page.getByTestId("factory-board");
  await board.locator("canvas").waitFor();
  const compact = page.viewportSize().width <= 980;
  if (scene.selected) {
    const bounds = await board.boundingBox();
    await page.mouse.click(
      bounds.x + (scene.selected.x + 0.5) * bounds.width / 12,
      bounds.y + (scene.selected.y + 0.5) * bounds.height / 12,
    );
  } else {
    if (compact) await page.getByRole("button", { name: "Construction panel" }).click();
    await page.getByRole("button", { name: /^Iron Mine/ }).click();
    if (compact) await page.getByRole("button", { name: "Construction panel" }).click();
  }
  if (captureOnly) {
    await page.addStyleTag({ content: ".center .board { width: 528px; max-height: none; }" });
  }
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function captureArtwork(scene, origin) {
  let image;
  await usingPage({ width: 1440, height: 900 }, async page => {
    await openGame(page, origin, scene, true);
    const capture = await page.locator(".board canvas").screenshot();
    const shaded = await page.evaluate(async encoded => {
      const source = new Image();
      source.src = "data:image/png;base64," + encoded;
      await source.decode();
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, source.width, source.height);
      const fills = new Map([[0x101a27, [34, 44, 50]], [0x1a2938, [41, 53, 60]], [0x203144, [43, 56, 63]]]);
      let remapped = 0;
      for (let i = 0; i < pixels.data.length; i += 4) {
        const rgb = (pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2];
        const fill = fills.get(rgb);
        if (!fill) continue;
        pixels.data.set(fill, i);
        remapped++;
      }
      context.putImageData(pixels, 0, 0);
      return { url: canvas.toDataURL(), remapped, total: source.width * source.height };
    }, capture.toString("base64"));
    assert.ok(shaded.remapped > shaded.total / 2, "preview map uses the lower-contrast grid");
    image = Buffer.from(shaded.url.split(",")[1], "base64");
  });
  return image;
}

function toolGroups(scene, domain, atlas) {
  const groups = [
    ["Routing", ["inspect", "conveyor", "splitter"]],
    ["Extraction", ["iron_mine", "coal_mine", "copper_mine", "silicon_extractor"]],
    ["Processing", ["furnace", "advanced_furnace", "assembler", "circuit_fabricator", "coal_generator"]],
  ];
  return groups.map(([title, tools]) => `
    <h3>${title}</h3><div class="tool-list">${tools.map(kind => {
      const definition = domain.DEFINITIONS[kind];
      if (scene.id === "m1" && !["inspect", "conveyor", "iron_mine", "furnace"].includes(kind)) return "";
      const frame = atlas.frames[kind]?.frame;
      const icon = frame ? `<svg class="icon" aria-hidden="true" viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}">
        <image width="${atlas.meta.size.w}" height="${atlas.meta.size.h}" href="/src/rendering/assets/sector-nine-v06.png"/></svg>`
        : '<span class="tool-mark" aria-hidden="true">⌖</span>';
      const label = definition?.label ?? "Inspect";
      const cost = kind === "furnace" && scene.id === "m1" ? "Locked" : definition ? domain.money(definition.price) : "";
      return `<div class="tool${label === scene.tool ? " active" : ""}">${icon}<b>${label}</b><small>${cost}</small></div>`;
    }).join("")}</div>`).join("");
}

async function openPreview(page, scene, board, origin, domain, atlas) {
  const { state, selected, diagnostic } = scene;
  const power = state.power;
  const kpi = domain.stats(state);
  const isLate = scene.id === "m15";
  const mission = isLate ? "Restore Service" : "Restore Extraction";
  const groups = toolGroups(scene, domain, atlas);
  const inspection = selected ? `<h3>Conveyor</h3>
    <p class="condition"><strong>! Output blocked</strong></p>
    <p>Inspect the next tile, its input capacity and direction.</p>
    <dl><dt>Tile</dt><dd>(${selected.x}, ${selected.y})</dd><dt>Facing</dt><dd>${selected.direction}</dd>
    <dt>Carrying</dt><dd>${selected.belt.replaceAll("_", " ")}</dd><dt>Stalled</dt>
    <dd>${diagnostic.conveyorStalledTicks} / ${diagnostic.ticks} ticks</dd></dl>
    <p class="divider">The highlighted tile cannot move its cargo.</p>`
    : '<p>Select a machine or conveyor to see its input, output, and orientation.</p>';
  const stage = isLate
    ? `<p class="objective-title">Ship raw copper <span class="score">${state.chapterIV.copperShipmentTicks.length} / 3</span></p>
       <p>Send copper ore to the sales terminal. Circuit continuity is measured after the shipment.</p>`
    : '<p class="objective-title">Produce iron ore <span class="score">0 / 1</span></p><p>Place an iron mine on a deposit, then run the simulation.</p>';
  const brief = isLate
    ? "Origin: [redacted]. Restart request outstanding since the shutdown. The station needs raw copper for repairs before circuit service can resume."
    : "The facility has 300 Cr to restart production. Build on an iron deposit to resume extraction.";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SEKTOR 9 · WP0 review</title><link rel="stylesheet" href="${art}/console.css"></head>
    <body>
    <header><div class="brand">SEKTOR <strong>9</strong></div>
      <div class="telemetry" aria-label="Factory KPIs">
        <div class="metric"><p>Cash</p><b>${domain.money(state.balanceCents)}</b></div>
        <div class="metric"><p>Operating profit / sim min</p><b>${kpi ? domain.money(kpi.profitCents) : "Collecting data"}</b></div>
        ${power ? `<div class="metric"><p>Power supply / demand</p><b>${power.supply} / ${power.demand}</b></div>` : ""}
      </div>
      <div class="controls" aria-label="Simulated controls"><span class="sim-state">Paused</span>
        <span class="pill" aria-label="Simulation speed 1 times">1× ▾</span><span class="pill primary">&#9654;&#65038; Run</span><button data-opens="operations">Menu</button>
      </div>
    </header>
    <div class="compact"><button data-opens="construction">Build · ${scene.tool}</button>
      <button data-opens="inspector">Inspector${selected ? " · ! Blocked" : ""}</button></div>
    <main class="workspace">
      <aside class="panel tools"><h2>Construction</h2>${groups}</aside>
      <section class="stage" aria-label="Sector map">
        <div class="board-frame"><div class="board-title"><h2>Factory map</h2>
          <span class="micro">12 × 12 · Tick ${state.tick}</span></div>
          <div class="board"><img class="map" src="data:image/png;base64,${board.toString("base64")}" alt="12 by 12 factory sprite board">
            ${selected ? `<div class="map-blockage" style="--x:${selected.x / 12 * 100}%;--y:${selected.y / 12 * 100}%" aria-label="Blocked conveyor"><span aria-hidden="true">!</span></div>` : ""}
          </div><p class="map-help"><span>Tool · ${scene.tool}</span>
            ${selected ? '<span class="signal">! Output blocked</span>' : '<span>Fe · Iron deposit</span>'}</p>
        </div>
      </section>
      <aside class="panel inspection"><h2>Inspector</h2>${inspection}</aside>
    </main>
    <footer class="mission" aria-label="Active mission"><div><p class="mission-id">OPERATIONS CONSOLE // ${scene.id.toUpperCase()}</p><h2>${mission}</h2></div>
      <div class="objective">${stage}</div>
      <div class="mission-actions"><button data-opens="briefing">Briefing</button><button data-opens="archive">Archive</button></div>
    </footer>
    <dialog id="briefing" aria-labelledby="brief-title"><h2 id="brief-title">${mission}</h2><p>${brief}</p><form method="dialog"><button>Close briefing</button></form></dialog>
    <dialog id="archive" aria-labelledby="archive-title"><h2 id="archive-title">Transmission archive</h2><p>${isLate ? "Redacted service ticket · Chapter IV" : "Corporate Operations · Opening directive"}</p><p>${brief}</p><form method="dialog"><button>Close archive</button></form></dialog>
    <dialog id="operations" aria-labelledby="ops-title"><h2 id="ops-title">Operations menu</h2><ul><li>Help and shortcuts</li><li>Playtest recorder</li><li>Restart campaign</li></ul><form method="dialog"><button>Close menu</button></form></dialog>
    <dialog id="construction" aria-labelledby="build-title"><h2 id="build-title">Construction</h2>${groups}<form method="dialog"><button>Close construction</button></form></dialog>
    <dialog id="inspector" aria-labelledby="inspect-title" class="inspection"><h2 id="inspect-title">Inspector</h2>${inspection}<form method="dialog"><button>Close inspector</button></form></dialog>
    <script>for (const control of document.querySelectorAll("[data-opens]")) {
      control.addEventListener("click", () => document.getElementById(control.dataset.opens).showModal());
    }</script></body></html>`;
  await page.route(origin + "/__wp0_preview", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(origin + "/__wp0_preview");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.querySelector(".map").decode();
  });
}

async function verifyPreview(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "horizontal overflow");
  assert.equal(await page.evaluate(() => {
    const map = document.querySelector(".board").getBoundingClientRect();
    const stage = document.querySelector(".objective").getBoundingClientRect();
    return map.top >= 0 && map.bottom <= innerHeight && stage.bottom <= innerHeight;
  }), true, "map and stage visible together");
  assert.equal(await page.evaluate(() => [...document.fonts].every(font => font.status === "loaded")), true, "preview fonts");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus-visible").getAttribute("data-opens"), "operations");
  const briefing = page.getByRole("button", { name: "Briefing" });
  await briefing.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.match(await page.locator(":focus").innerText(), /close briefing/i);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator(":focus").innerText(), "Briefing");
  await briefing.evaluate(button => button.blur());
}
