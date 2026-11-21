// Synthetic local-only candidate proof. Never points at a deployed Hostinger origin.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { crc32 } from "node:zlib";
import { fixturePng } from "../services/punctum-hostinger-production/acceptance-fixture.mjs";
import { withProofDatabase } from "./hostinger-clerk-production-proof.mjs";

const requiredBytes = 26_214_400;
const publicOrigin = "https://punctumpicture.com";
const port = 3025;
const localOrigin = `http://127.0.0.1:${port}`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const publicReleaseOnly = process.argv.includes("--public-release-check");

function exactSizePng() {
  const chunks = [fixturePng.subarray(0, -12)];
  let remainder = requiredBytes - fixturePng.length;
  while (remainder) {
    const payload = Buffer.alloc(Math.min(256 * 1024, remainder - 12));
    const type = Buffer.from("vpAg"); // Private, safe-to-copy ancillary chunk.
    const chunk = Buffer.alloc(12 + payload.length);
    chunk.writeUInt32BE(payload.length, 0);
    type.copy(chunk, 4);
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    chunks.push(chunk);
    remainder -= chunk.length;
  }
  chunks.push(fixturePng.subarray(-12));
  const png = Buffer.concat(chunks);
  assert.equal(png.length, requiredBytes);
  return png;
}

function cookie(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("punctum_"));
  assert(header && ["Secure", "HttpOnly", "SameSite=Strict"].every((part) => header.includes(part)));
  return header.split(";", 1)[0];
}

async function main() {
  const png = exactSizePng();
  const sharp = (await import("sharp")).default;
  assert.equal((await sharp(png).metadata()).format, "png");
  assert.equal((await sharp(png).resize(1, 1).png().toBuffer())[0], 137);
  if (process.argv.includes("--fixture-check")) {
    console.log(JSON.stringify({ fixture: "PASS", bytes: png.length, sha256: hash(png) }));
    return;
  }

  await withProofDatabase(async (db, { dbFile, directory }) => {
    const root = new URL("../", import.meta.url).pathname;
    for (const name of ["originals", "backups"]) mkdirSync(join(directory, name), { mode: 0o700 });
    const password = randomBytes(24).toString("hex");
    const child = spawn(process.execPath, [join(root, "services/punctum-hostinger-production/candidate-server.mjs")], {
      cwd: root,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: directory, NODE_ENV: "production", PORT: String(port),
        PUNCTUM_PRODUCTION_CANDIDATE_MODE: "private-candidate", PUNCTUM_CANDIDATE_ENVIRONMENT: "staging",
        PUNCTUM_CANDIDATE_PROVIDER: "hostinger-managed", PUNCTUM_CANDIDATE_PUBLIC_URL: publicOrigin,
        PUNCTUM_CANDIDATE_DB_FILE: dbFile, PUNCTUM_CANDIDATE_ORIGINALS: join(directory, "originals"),
        PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(directory, "backups"),
        PUNCTUM_CANDIDATE_ADMIN_EMAIL: "qa-admin@example.test", PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH: hash(password),
        PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET: randomBytes(48).toString("hex"),
        PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET: randomBytes(48).toString("hex"),
        PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE: "legacy", PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE: "password",
        PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED: "false",
        ...(publicReleaseOnly ? {} : { PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED: "true" }),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (data) => { errors = (errors + data.toString()).slice(-2000); });
    const checks = [];
    const req = (path, method = "GET", body, session, extraHeaders = {}) => {
      const url = new URL(path, localOrigin);
      assert.equal(url.origin, localOrigin);
      const headers = { Host: "punctumpicture.com", Origin: publicOrigin, "X-Forwarded-Proto": "https",
        ...(session ? { Cookie: session } : {}), ...extraHeaders };
      if (body && !(body instanceof Uint8Array)) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(body);
      }
      return fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(65_000) });
    };
    const expect = async (response, status, label) => {
      const error = response.status !== status ? await response.clone().text().catch(() => "") : "";
      assert.equal(response.status, status, `${label}: ${error.slice(0, 350)}`);
      checks.push(label);
      return response;
    };
    const json = async (path, method, body, session, status = 200) =>
      (await expect(await req(path, method, body, session), status, path)).json();
    try {
      let ready = false;
      for (let n = 0; n < 90; n++) {
        assert.equal(child.exitCode, null, `candidate startup: ${errors}`);
        try {
          if ((await req("/api/health")).ok) { ready = true; break; }
        } catch { /* Startup is still in progress. */ }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      assert(ready, `candidate unavailable: ${errors}`);
      const admin = cookie(await expect(await req("/admin/api/session", "POST", {
        email: "qa-admin@example.test", password,
      }), 200, "admin-login"));
      if (publicReleaseOnly) {
        await expect(await req("/"), 200, "public-home-with-R4-off");
        for (const path of ["/albuns", "/api/client/me", "/admin/api/clientes", "/admin/api/albuns-privados"]) {
          await expect(await req(path, "GET", undefined, admin), 404, "default-off:" + path);
        }
        const media = "/api/client/galleries/11111111-1111-4111-8111-111111111111/images/22222222-2222-4222-8222-222222222222/download";
        for (const method of ["GET", "HEAD"]) {
          const denied = await expect(await req(media, method), 404, "default-off-media:" + method);
          assert.match(denied.headers.get("cache-control"), /private.*no-store/);
          assert.equal((await denied.arrayBuffer()).byteLength, 0);
        }
        console.log(JSON.stringify({ status: "PUBLIC_RELEASE_R4_OFF_LOCAL_SYNTHETIC_PASS", checksPassed: checks.length }));
        return;
      }
      const clients = [];
      for (const suffix of ["a", "b"]) {
        const email = `synthetic-${suffix}@example.test`;
        const { client, temporaryPassword } = await json("/admin/api/clientes", "POST", { name: `Synthetic ${suffix}`, email }, admin, 201);
        const temp = cookie(await expect(await req("/api/client/session", "POST", { email, password: temporaryPassword }), 200, `client-${suffix}-login`));
        const rotated = cookie(await expect(await req("/api/client/password", "POST", {
          password: `Synthetic ${suffix} QA password 2026!`,
        }, temp), 200, `client-${suffix}-rotation`));
        clients.push({ id: client.id, cookie: rotated });
      }
      const { gallery } = await json("/admin/api/albuns-privados", "POST", {
        clientId: clients[0].id, title: "Exact 25 MiB local QA", theme: "warm",
      }, admin, 201);
      const galleryPath = `/admin/api/albuns-privados/${gallery.id}`;
      const details = await json(galleryPath, "GET", undefined, admin);
      assert.equal(details.uploadMaxBytes, requiredBytes, "private UI/API contract is 25 MiB");
      const intentPath = `${galleryPath}/uploads/intents`;
      const tooLarge = await expect(await req(intentPath, "POST", {
        filename: "too-big.png", mimeType: "image/png", sizeBytes: requiredBytes + 1, sha256: hash(png),
      }, admin), 400, "reject-25mib-plus-one");
      assert.equal((await tooLarge.json()).error?.code, "VALIDATION_ERROR");
      const intent = await json(intentPath, "POST", {
        filename: "exact-25mib.png", mimeType: "image/png", sizeBytes: png.length, sha256: hash(png),
      }, admin, 201);
      const signedUrl = new URL(intent.uploadUrl);
      assert.equal(signedUrl.origin, publicOrigin);
      assert.equal(signedUrl.pathname, `${galleryPath}/uploads/${intent.intentId}/direct`);
      const put = (body) => req(signedUrl.pathname + signedUrl.search, "PUT", body, admin, {
        ...intent.requiredHeaders, "Content-Length": String(body.length),
      });
      await expect(await put(Buffer.alloc(1024)), 400, "reject-short-upload");
      await expect(await put(Buffer.alloc(png.length)), 400, "reject-invalid-checksum");
      await new Promise((resolve, reject) => {
        let connected = false;
        let partialSent = false;
        const interrupted = httpRequest(new URL(signedUrl.pathname + signedUrl.search, localOrigin), {
          method: "PUT",
          headers: { Host: "punctumpicture.com", Origin: publicOrigin, "X-Forwarded-Proto": "https",
            Cookie: admin, ...intent.requiredHeaders, "Content-Length": String(png.length) },
        });
        interrupted.once("socket", (socket) => socket.once("connect", () => { connected = true; }));
        interrupted.once("response", () => reject(Error("partial upload unexpectedly completed")));
        interrupted.on("error", (error) => { if (!connected || !partialSent) reject(error); });
        interrupted.once("close", () => connected && partialSent ? resolve() : reject(Error("partial upload was not transmitted")));
        interrupted.write(png.subarray(0, 256 * 1024), () => {
          partialSent = true;
          setTimeout(() => interrupted.destroy(), 150);
        });
      });
      assert.equal((await db.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
        .bind(intent.intentId).first()).status, "pending", "aborted upload remains retryable");
      assert.deepEqual(readdirSync(join(directory, "originals"), { recursive: true }), [],
        "aborted upload must not stage any original bytes");
      checks.push("partial-network-abort-pending");
      await expect(await put(png), 200, "accept-exact-25mib");
      await expect(await put(png), 200, "idempotent-retry");
      await json(`${galleryPath}/uploads/${intent.intentId}/complete`, "POST", {}, admin);
      await json(`${galleryPath}/uploads/${intent.intentId}/complete`, "POST", {}, admin);
      await json(`${galleryPath}/cover`, "PUT", { imageId: intent.imageId }, admin);
      await json(`${galleryPath}/publish`, "POST", {}, admin);
      const photo = `/api/client/galleries/${gallery.id}/images/${intent.imageId}`;
      await json(`/api/client/galleries/${gallery.id}`, "GET", undefined, clients[0].cookie);
      await expect(await req(photo + "/download", "GET", undefined, clients[0].cookie), 403, "download-off");
      await json(galleryPath, "PATCH", { allowDownloads: true }, admin);
      const response = await expect(await req(photo + "/download", "GET", undefined, clients[0].cookie), 200, "owner-download");
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(png), "original SHA-256 after private download");
      for (const method of ["GET", "HEAD"]) {
        const denied = await expect(await req(photo + "/download", method, undefined, clients[1].cookie), 404, `B-${method}-denied`);
        assert.equal((await denied.arrayBuffer()).byteLength, 0, "no cross-client original bytes");
      }
      const clientPath = `/api/client/galleries/${gallery.id}`;
      const favoritePath = `${clientPath}/favorites/${intent.imageId}`;
      assert.equal((await json('/api/client/galleries', 'GET', undefined, clients[0].cookie)).galleries.length, 1);
      assert.equal((await json('/api/client/galleries', 'GET', undefined, clients[1].cookie)).galleries.length, 0);
      assert.equal((await json(clientPath, 'GET', undefined, clients[0].cookie)).gallery.images[0].favorite, false);
      await expect(await req(clientPath, 'GET', undefined, clients[1].cookie), 404, 'B-gallery-detail-denied');
      await expect(await req(favoritePath, 'PUT', undefined, clients[1].cookie), 404, 'B-favorite-denied');
      await json(favoritePath, 'PUT', undefined, clients[0].cookie);
      assert.equal((await json(clientPath, 'GET', undefined, clients[0].cookie)).gallery.images[0].favorite, true);
      await json(favoritePath, 'DELETE', undefined, clients[0].cookie);
      assert.equal((await json(clientPath, 'GET', undefined, clients[0].cookie)).gallery.images[0].favorite, false);
      for (const preset of ['thumb', 'gallery']) {
        const path = `${photo}/${preset}`;
        const allowed = await expect(await req(path, 'GET', undefined, clients[0].cookie,
          { Accept: 'image/webp' }), 200, `A-${preset}-derivative`);
        assert.equal(allowed.headers.get('Cache-Control'), 'private, no-store');
        assert.equal(allowed.headers.get('Vary'), 'Cookie');
        assert.equal(allowed.headers.get('Content-Type'), 'image/webp');
        const bytes = Buffer.from(await allowed.arrayBuffer());
        assert(bytes.length > 0 && bytes.length < png.length, `${preset}: transformed image is non-empty and bounded`);
        assert.equal((await sharp(bytes).metadata()).format, 'webp');
        const head = await expect(await req(path, 'HEAD', undefined, clients[0].cookie,
          { Accept: 'image/webp' }), 200, `A-${preset}-head`);
        assert.equal(head.headers.get('Cache-Control'), 'private, no-store');
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        for (const method of ['GET', 'HEAD']) {
          const denied = await expect(await req(path, method, undefined, clients[1].cookie),
            404, `B-${preset}-${method}-denied`);
          assert.equal((await denied.arrayBuffer()).byteLength, 0, `${preset}: no cross-client derivative bytes`);
          const guest = await expect(await req(path, method), 404, `guest-${preset}-${method}-denied`);
          assert.equal((await guest.arrayBuffer()).byteLength, 0, `${preset}: no anonymous derivative bytes`);
        }
      }
      for (const leak of [`/media/${intent.imageId}/gallery`,
        `/_vinext/image?url=${encodeURIComponent(`${photo}/gallery`)}&w=640&q=75`]) {
        const denied = await expect(await req(leak, 'GET', undefined, clients[0].cookie),
          leak.startsWith('/media/') ? 404 : 400, 'public-media-denied');
        const deniedBytes = Buffer.from(await denied.arrayBuffer());
        assert(deniedBytes.length < 1024, 'public denial has no media payload');
        assert(!denied.headers.get('Content-Type')?.startsWith('image/'), 'no public image content type');
        assert(!deniedBytes.subarray(0, 8).equals(png.subarray(0, 8)), 'no public PNG raster');
      }
      console.log(JSON.stringify({ result: "PASS_LOCAL_SYNTHETIC_NODE", bytes: png.length, sha256: hash(png),
        checks, environment: "isolated POSIX WSL staging; legacy synthetic auth; no remote access" }));
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        const kill = setTimeout(() => child.kill("SIGKILL"), 5_000);
        try { await exited; } finally { clearTimeout(kill); }
      }
    }
  });
}

await main();
