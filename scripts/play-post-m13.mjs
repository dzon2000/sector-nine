import {spawnSync} from "node:child_process";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "@playwright/test";
import {createServer} from "vite";

const [route,option,...extra]=process.argv.slice(2);
if(!["independent","corporate"].includes(route)||(option!==undefined&&option!=="--verify")||extra.length){
  console.error("Usage: node scripts/play-post-m13.mjs <independent|corporate> [--verify]");
  process.exit(1);
}

const root=fileURLToPath(new URL("..",import.meta.url));
const resolve=createRequire(import.meta.url).resolve;
const vitest=join(dirname(resolve("vitest/package.json")),"vitest.mjs");
const exportDirectory=await mkdtemp(join(tmpdir(),"sektor9-post-m13-"));
let browser;
let server;
try{
  const replay=spawnSync(process.execPath,[vitest,"run","tests/integration/economy/v0.4-recovery.test.ts",
    "-t","exports validated post-M13 checkpoints"],{
    cwd:root,stdio:"inherit",env:{...process.env,SEKTOR9_POST_M13_EXPORT_DIR:exportDirectory},
  });
  if(replay.error)throw replay.error;
  if(replay.status!==0)throw new Error("The paid checkpoint export failed.");
  const checkpoint=JSON.parse(await readFile(join(exportDirectory,route+".json"),"utf8"));

  server=await createServer({root,server:{host:"127.0.0.1"}});
  await server.listen();
  const address=server.httpServer.address();
  const origin="http://127.0.0.1:"+address.port;
  browser=await chromium.launch({
    headless:option==="--verify",
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();

  // Keep the application unloaded until this fresh browser context has a committed save.
  const seedUrl=origin+"/__post-m13-seed";
  await page.route(seedUrl,request=>request.fulfill({contentType:"text/html",body:"<!doctype html><title>SEKTOR 9</title>"}),{times:1});
  await page.goto(seedUrl);
  await page.evaluate(state=>new Promise((resolveSeed,rejectSeed)=>{
    const open=indexedDB.open("sector-nine-v0.1",1);
    open.onupgradeneeded=()=>open.result.createObjectStore("snapshots");
    open.onerror=()=>rejectSeed(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const transaction=db.transaction("snapshots","readwrite");
      transaction.objectStore("snapshots").add(state,"slot1");
      transaction.oncomplete=()=>{db.close();resolveSeed();};
      transaction.onabort=()=>{db.close();rejectSeed(transaction.error);};
    };
  }),checkpoint);
  await page.goto(origin);
  await page.getByText(`Tick ${checkpoint.tick} · PAUSED`,{exact:true}).waitFor();
  console.info(`Loaded paid ${route} checkpoint at tick ${checkpoint.tick} in an isolated browser.`);
  if(option!=="--verify"){
    console.info("Close the playtest page when finished.");
    await page.waitForEvent("close",{timeout:0});
  }
}finally{
  await browser?.close();
  await server?.close();
  await rm(exportDirectory,{recursive:true,force:true});
}
