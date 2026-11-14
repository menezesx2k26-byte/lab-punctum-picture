# Configuration baseline

| Item | Observed value |
| --- | --- |
| Repository | `menezesx2k26-byte/lab-punctum-picture` |
| Base | `main` at `af55e1526b731be099e804335eb143d2b5cfa95e` |
| PR #13 | `agent/private-client-albums-20261022`; starting HEAD `dd8831fe16a5a14b8ab47e22bb4e05d84183e216`; open, draft, unmerged |
| PR #14 | `design/punctum-collage-mobile-20261024`; final audited SHA `bddeec3a74a341f9002d9e9bb3b3253fdb67c878`; open, draft, unmerged |
| PR #13 code correction | `87329b1ead652dc2569a8ca881abed7e745ffe0c`; atomic shared rate limit and concurrency regression |
| Workspace | Linux, `/workspace/lab-punctum-picture`; no uncommitted user changes at start |
| Node / npm | Node `v24.19.0`; npm `11.9.0` |
| Install | `npm ci --no-audit --no-fund`; 541 packages on PR #13 branch |
| Worker/test toolchain | Wrangler `4.152.0`, Vitest `4.1.12`, `@cloudflare/vitest-pool-workers` `0.23.0` (upstream rename/deprecation warning), Vite `8.3.5` |
| Runtime | Cloudflare Worker, D1 and private R2; Access is the intended primary identity provider; Password Bridge remains disabled |
| Environment touched | Local Miniflare/Worker test database and local build only; remote discovery APIs were read-only |
| Cost boundary | R$0 incremental; no plan upgrades, paid browser, production write, remote deploy, migration or billing mutation |

Commands: `git status --short --branch`, `git rev-parse HEAD`, `node --version`, `npm ci --no-audit --no-fund`. The #13 working baseline was clean and tracked `origin/agent/private-client-albums-20261022`. Do not interpret the SHA in this table as the current PR head after the corrective push; use GitHub PR metadata and `evidence-manifest.json` for the pushed result.
