import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {resolveBuildCommit} from "./src/ui/buildProvenance";
// Vite runs under Node; avoid broadening browser TypeScript types with Node globals.
declare const process:{env:Record<string,string|undefined>};

/** GitHub Actions supplies GITHUB_SHA for the exact checked-out build commit.
 * A local build, untrusted environment, or invalid SHA embeds JSON null.
 * A build made at one SHA always retains that SHA in shipped JavaScript.
 */
const commit=process.env.GITHUB_ACTIONS==="true"?resolveBuildCommit(process.env.GITHUB_SHA):null;
export default defineConfig({
  plugins: [react()],
  define: {__SEKTOR9_BUILD_COMMIT__:JSON.stringify(commit)},
  test: { environment: "node", include: ["tests/**/*.test.ts"] }
});
