# Browser homologation in isolated local workerd

`punctum-browser.mjs` launches a **new headless Chromium profile** and the production
Vinext bundle under workerd/Miniflare. It creates fresh local D1/R2 resources in a
unique temporary directory. It never uses remote bindings, an authenticated user
browser, production data or a real Cloudflare account. Temporary storage is removed
in `finally`, including on failure. Screenshots and a sanitized JSON report remain
under ignored `outputs/browser-e2e/`.

After installing dependencies and building:

```sh
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright is pinned to `1.58.2` in the development dependencies. To use a system
Chromium instead, set `CHROMIUM_EXECUTABLE` to its executable path (for example
`/usr/bin/chromium`). If Playwright is installed outside this checkout, set
`PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. For example, without modifying
the repository package files:

```sh
npm install --prefix /tmp/punctum-browser-deps --ignore-scripts --no-audit --no-fund playwright@1.58.2
PLAYWRIGHT_MODULE=/tmp/punctum-browser-deps/node_modules/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node scripts/e2e/punctum-browser.mjs
```

`PUNCTUM_E2E_DIST` can select a preserved `dist` snapshot while another process
builds a variant. In that case **also set `PUNCTUM_E2E_BUILD_SHA` to the actual
source revision used to build that snapshot**. The report records the SHA-256 of
`server/index.js` independently. `PUNCTUM_E2E_OUTPUT` selects the evidence directory.
The default SHA is the checkout HEAD; do not run it against stale build output.

Coverage:

- Anonymous denial and password endpoint rejection in Access mode.
- Two synthetic clients with two private galleries and ten generated PNG originals;
  an additional local gallery/original exercises client-side route changes.
- Real hydrated browser libraries and client isolation.
- Favorites, reload, original download compared byte-for-byte.
- Lightbox keyboard navigation, Escape and focus restoration.
- Responsive widths 320, 390 and 768px for private galleries.
- Public media and image optimizer denial for private photographs.
- Same-component gallery navigation clears previous data while the next request
  is pending and after an intentional 404.
- A malformed HTTP 200 library response displays a safe error, without a render
  exception.
- Public home, administrative authorization and hydrated Studio controls.
- Local Studio publication of Colagem Autoral and public responsive rendering.
- Runtime restart with persisted local D1/R2 and consistent-storage rollback.
- Logout revocation with the other client remaining authorized.
- Unhandled browser exceptions, console warnings/errors and HTTP 5xx checks.

The session cookies are synthesized from **new local test secrets** for exercising
the application downstream of Access. This does **not** validate OTP delivery,
real Access policies, edge CPU, devices other than Chromium, or remote recovery.
The rollback test stops workerd before copying local storage; it verifies only the
available local environment, not a Cloudflare D1 disaster-recovery procedure.
Browser home navigation duration is a local diagnostic, not Worker CPU telemetry.
The intentional missing-gallery 404 is separately recorded as `expectedDenials`;
all other browser console errors and warnings fail the run. Live pages are closed
before the injected runtime restarts to avoid test-generated connection resets.
