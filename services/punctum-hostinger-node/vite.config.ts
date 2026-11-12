import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

const service = new URL("./", import.meta.url);
const project = new URL("../../", service);
const output = new URL("dist/hostinger-qa/", project);
const publicDir = fileURLToPath(new URL("public/", project));
const publicPaths = readdirSync(publicDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => "/" + [relative(publicDir, entry.parentPath), entry.name]
    .filter(Boolean).join(sep).split(sep).join("/"));

export default defineConfig({
  // Vinext detects Wrangler from the Vite root. The Node build gets its own
  // root and uses the application's App Router and public files explicitly.
  root: fileURLToPath(service),
  publicDir,
  define: { __PUNCTUM_QA_PUBLIC_PATHS__: JSON.stringify(publicPaths) },
  resolve: {
    alias: { "cloudflare:workers": fileURLToPath(new URL("bindings.ts", service)) },
  },
  plugins: [
    vinext({
      appDir: fileURLToPath(project),
      nextConfig: {},
      rscOutDir: fileURLToPath(new URL("server/", output)),
      ssrOutDir: fileURLToPath(new URL("server/ssr/", output)),
    }),
    {
      name: "punctum-hostinger-qa-entry",
      enforce: "post",
      config: () => ({
        environments: {
          client: { build: { outDir: fileURLToPath(new URL("client/", output)) } },
          rsc: {
            resolve: { external: ["sharp"] },
            build: {
              rolldownOptions: { input: { index: fileURLToPath(new URL("rsc-entry.ts", service)) } },
            },
          },
        },
      }),
    },
  ],
});
