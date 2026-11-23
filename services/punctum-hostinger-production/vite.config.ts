import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

const service = new URL("./", import.meta.url);
const project = new URL("../../", service);
const output = new URL("dist/hostinger-production/", project);
const publicDir = fileURLToPath(new URL("public/", project));
const publicPaths = readdirSync(publicDir, {recursive:true,withFileTypes:true})
  .filter(entry => entry.isFile())
  .map(entry => "/" + [relative(publicDir,entry.parentPath),entry.name]
    .filter(Boolean).join(sep).split(sep).join("/"));

export default defineConfig({
  root: fileURLToPath(service),
  publicDir,
  define: {__PUNCTUM_QA_PUBLIC_PATHS__:JSON.stringify(publicPaths)},
  resolve: {
    alias: [
      {find:"cloudflare:workers",replacement:fileURLToPath(new URL("bindings.ts",service))},
      {find:"./admin-session-crypto.mjs",replacement:
        fileURLToPath(new URL("../punctum-hostinger-node/admin-session-crypto.mjs",service))},
    ],
  },
  plugins: [
    vinext({
      appDir:fileURLToPath(project),
      nextConfig:{},
      rscOutDir:fileURLToPath(new URL("server/",output)),
      ssrOutDir:fileURLToPath(new URL("server/ssr/",output)),
    }),
    {
      name:"punctum-hostinger-real-staging-entry",
      enforce:"post",
      config:()=>({
        environments:{
          client:{build:{outDir:fileURLToPath(new URL("client/",output))}},
          rsc:{
            resolve:{external:["sharp"]},
            build:{rolldownOptions:{
              input:{index:fileURLToPath(new URL("rsc-entry.ts",service))},
            }},
          },
        },
      }),
    },
  ],
});
