// Validate the actual checked-out revision against bundled client provenance.
// Execute only after npm run build in GitHub Actions (no network, no injected guess).
import {execFileSync} from "node:child_process";
import {readdir,readFile} from "node:fs/promises";
import {join,extname} from "node:path";

const actual=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const declared=process.env.GITHUB_SHA;
if(process.env.GITHUB_ACTIONS!=="true"||!/^[0-9a-f]{40}$/.test(declared??"")||declared!==actual)
  throw Error("Untrusted or mismatching checkout SHA; refusing to attest build provenance.");
async function jsSources(folder){
  const entries=await readdir(folder,{withFileTypes:true});
  const arrays=await Promise.all(entries.map(async entry=>{
    const path=join(folder,entry.name);
    return entry.isDirectory()?jsSources(path):entry.isFile()&&extname(entry.name)===".js"?[path]:[];
  }));
  return arrays.flat();
}
const sources=await jsSources("dist");
if(!sources.length)throw Error("No built JavaScript artifacts to verify.");
const matched=(await Promise.all(sources.map(async file=>
  (await readFile(file,"utf8")).includes(declared)))).some(Boolean);
if(!matched)throw Error("Exact checkout SHA is missing from built JavaScript.");
console.log("Verified exact shipped buildCommit "+actual);
