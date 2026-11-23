import { readFileSync } from "node:fs";
import MagicString from "magic-string";
import type { Plugin } from "vite";

const EAGER_PRELOAD = "await clientReferencePreloader.preload();";

/**
 * vinext 0.0.50 eagerly evaluates every client module before the first SSR,
 * including the private editors on the public home. plugin-rsc 0.5.28 already
 * loads/memoizes each referenced module through its async consumer manifest.
 * Keep this compatibility fix narrow, version-pinned and covered by real SSR.
 */
export function ssrOnDemandClientReferences(): Plugin {
  return {
    name: "punctum:ssr-on-demand-client-references",
    apply: "build",
    enforce: "pre",
    buildStart() {
      const vinext = JSON.parse(readFileSync(new URL("../package.json", import.meta.resolve("vinext")), "utf8"));
      const rsc = JSON.parse(readFileSync(new URL(import.meta.resolve("@vitejs/plugin-rsc/package.json")), "utf8"));
      if (vinext.version !== "0.0.50" || rsc.version !== "0.5.28") {
        throw new Error("Review the SSR on-demand compatibility fix before upgrading vinext/plugin-rsc.");
      }
    },
    transform(source, id) {
      if (!id.split("?")[0].replaceAll("\\", "/").endsWith("/vinext/dist/server/app-ssr-entry.js")) return;
      if (source.split(EAGER_PRELOAD).length !== 2 || !source.includes('from "@vitejs/plugin-rsc/ssr"')) {
        throw new Error("Unexpected vinext SSR entry; review on-demand client loading instead of silently restoring eager imports.");
      }
      const output = new MagicString(source);
      const start = source.indexOf(EAGER_PRELOAD);
      output.overwrite(start, start + EAGER_PRELOAD.length, "// Client references load on demand through plugin-rsc's async manifest.");
      return { code: output.toString(), map: output.generateMap({ hires: true }) };
    },
  };
}
