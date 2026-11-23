import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import {
  PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS,
  buildAllowedImageWidths,
} from "../../shared/punctum-image-widths.mjs";
import {
  installCandidateImageWidthCompatibility,
  normalizeCandidateImageRequestUrl,
} from "./image-width-compat.mjs";

test("normalizes allowed Punctum intrinsic image widths while preserving security checks", () => {
  const allowedWidths = buildAllowedImageWidths(
    DEFAULT_DEVICE_SIZES,
    DEFAULT_IMAGE_SIZES,
  );

  for (const width of [1254, 1024, 360, 1440, 280, 300, 600, 720, 800, 900, 1600, 1800]) {
    assert.ok(PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS.includes(width));
    const normalized = normalizeCandidateImageRequestUrl(
      `/_vinext/image?url=%2Flogo-punctum-transparent.png&w=${width}&q=75`,
      allowedWidths,
    );
    assert.equal(
      normalized,
      "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=0&q=75",
    );
  }

  for (const unchanged of [
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=1200&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=640&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=0&q=75",
    "/portfolio?w=1254",
  ]) {
    assert.equal(
      normalizeCandidateImageRequestUrl(unchanged, allowedWidths),
      unchanged,
    );
  }

  for (const rejected of [
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=777&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=9999&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=-1&q=75",
    "/_vinext/image?url=https%3A%2F%2Fevil.example%2Fa.png&w=1254&q=75",
    "/_vinext/image?url=%2F%2Fevil.example%2Fa.png&w=1254&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=1254&w=777&q=75",
    "/_vinext/image?w=1254&q=75",
  ]) {
    assert.equal(
      normalizeCandidateImageRequestUrl(rejected, allowedWidths),
      rejected,
    );
  }
});

test("installCandidateImageWidthCompatibility wraps http.Server request listener cleanly", async (t) => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  installCandidateImageWidthCompatibility(server);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const resLogo = await fetch(
    `http://127.0.0.1:${port}/_vinext/image?url=%2Flogo-punctum-transparent.png&w=1254&q=75`,
  );
  assert.equal(resLogo.status, 200);

  const resUnknown = await fetch(
    `http://127.0.0.1:${port}/_vinext/image?url=%2Flogo-punctum-transparent.png&w=777&q=75`,
  );
  assert.equal(resUnknown.status, 200);

  assert.deepEqual(seen, [
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=0&q=75",
    "/_vinext/image?url=%2Flogo-punctum-transparent.png&w=777&q=75",
  ]);
});
