/** Only exact, lowercase 40-character Git SHAs are usable as build provenance. */
export function resolveBuildCommit(value:unknown):string|null {
  return typeof value==="string" && /^[0-9a-f]{40}$/.test(value)?value:null;
}
/** Only GitHub Actions checkout provenance is accepted; local env guesses are null. */
export function trustedCiBuildCommit(actions:unknown,sha:unknown):string|null {
  return actions==="true"?resolveBuildCommit(sha):null;
}
/** Vite substitutes this literal at build time. Undefined in unit tests: local fallback. */
declare const __SEKTOR9_BUILD_COMMIT__:string|null;
export const BUILD_COMMIT: string|null =
  resolveBuildCommit(typeof __SEKTOR9_BUILD_COMMIT__==="undefined"?null:__SEKTOR9_BUILD_COMMIT__);
