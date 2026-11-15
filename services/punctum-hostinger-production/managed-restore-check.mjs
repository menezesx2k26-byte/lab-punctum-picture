import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync, closeSync, constants, copyFileSync, createReadStream, existsSync, lstatSync,
  mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";
import { candidateOriginals } from "./candidate-originals.mjs";
import { privateOriginals } from "./originals.mjs";
import { candidateLocalBackups } from "./candidate-backups.mjs";
import { databaseInventory } from "./managed-import.mjs";
import { openProductionStageDatabase, validatePrivateStageDb } from "./sqlite.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tarOptions = { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000, stdio: ["ignore", "pipe", "ignore"] };

function noLinks(path) {
  if (typeof path !== "string" || !isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw Error("MANAGED_PRIVATE_PATH_REQUIRED");
  for (let part = resolve(path); ; part = dirname(part)) {
    if (lstatSync(part).isSymbolicLink()) throw Error("MANAGED_STORAGE_SYMLINK_FORBIDDEN");
    if (dirname(part) === part) break;
  }
}

function privateEntry(path, directory = false) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) || (info.mode & 0o077)) {
    throw Error("MANAGED_STORAGE_UNSAFE");
  }
  return info;
}

function originalFiles(root) {
  privateEntry(root, true);
  let count = 0;
  for (const part of readdirSync(root)) {
    if (!/^[a-f0-9]{2}$/.test(part)) throw Error("MANAGED_ORIGINAL_LAYOUT_INVALID");
    privateEntry(join(root, part), true);
    for (const name of readdirSync(join(root, part))) {
      if (!/^[a-f0-9]{64}\.(?:blob|json)$/.test(name) || !name.startsWith(part)) throw Error("MANAGED_ORIGINAL_LAYOUT_INVALID");
      privateEntry(join(root, part, name));
      count++;
    }
  }
  return count;
}

async function originalInventory(root, destination) {
  const files = originalFiles(root), store = candidateOriginals(root), objects = [];
  let cursor, bytes = 0, previous;
  for (;;) {
    const page = await store.list({ cursor, limit: 1000 });
    for (const item of page.objects) {
      if (typeof item.key !== "string" || (previous !== undefined && item.key <= previous)) throw Error("MANAGED_ORIGINAL_CURSOR_INVALID");
      const object = await store.get(item.key);
      if (!object || object.size !== item.size || object.etag !== item.etag) throw Error("MANAGED_ORIGINAL_MISMATCH");
      if (destination) {
        const id = sha(item.key), partition = join(destination, id.slice(0, 2));
        mkdirSync(partition, { recursive: true, mode: 0o700 });
        for (const suffix of [".blob", ".json"]) {
          const target = join(partition, id + suffix);
          copyFileSync(join(root, id.slice(0, 2), id + suffix), target, constants.COPYFILE_EXCL);
          chmodSync(target, 0o600);
        }
      }
      await object.body?.cancel();
      objects.push({ key: item.key, size: object.size, sha256: object.etag });
      bytes += object.size;
      previous = item.key;
    }
    if (!page.truncated) break;
    if (!page.objects.length || page.cursor !== previous || (cursor !== undefined && page.cursor <= cursor)) throw Error("MANAGED_ORIGINAL_CURSOR_INVALID");
    cursor = page.cursor;
  }
  if (files !== objects.length * 2) throw Error("MANAGED_ORIGINAL_COUNT_MISMATCH");
  return { objects, bytes };
}

function inventory(dbFile, objects) {
  openProductionStageDatabase(dbFile).close();
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw Error("MANAGED_RESTORE_INTEGRITY_FAILED");
    const keys = new Set(objects.map((item) => item.key));
    for (const [table, column] of [["images", "original_key"], ["site_media", "storage_key"], ["client_gallery_images", "storage_key"]]) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
      for (const row of db.prepare(`SELECT ${column} AS key FROM ${table} WHERE status='ready'`).iterate()) {
        if (typeof row.key !== "string" || (!row.key.startsWith("static:") && !keys.has(row.key))) throw Error("MANAGED_RESTORE_REFERENCE_MISSING");
      }
    }
    return databaseInventory(db);
  } finally { db.close(); }
}

async function fileSha(path) {
  privateEntry(path);
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

function ownedTemp(root, prefix) {
  const path = mkdtempSync(join(root, prefix));
  chmodSync(path, 0o700);
  const owned = lstatSync(path);
  return { path, cleanup() {
    if (!existsSync(path)) return;
    const current = lstatSync(path);
    if (dirname(path) !== root || realpathSync(path) !== path || !current.isDirectory() ||
        current.dev !== owned.dev || current.ino !== owned.ino || current.uid !== owned.uid) throw Error("MANAGED_CLEANUP_OWNERSHIP_CHANGED");
    rmSync(path, { recursive: true, force: true });
  } };
}

export async function createManagedBackup(config) {
  let snapshot, restored;
  try {
    noLinks(config.dbFile);
    noLinks(config.originals);
    const dbFile = validatePrivateStageDb(config.dbFile);
    privateOriginals(config.originals);
    for (const suffix of ["-wal", "-shm", "-journal"]) if (lstatSync(dbFile + suffix, { throwIfNoEntry: false })) privateEntry(dbFile + suffix);
    const recovery = join(dirname(dbFile), "managed-recovery");
    if (!existsSync(recovery)) mkdirSync(recovery, { mode: 0o700 });
    noLinks(recovery);
    candidateLocalBackups(recovery);
    snapshot = ownedTemp(recovery, ".snapshot-");
    const snapshotDb = join(snapshot.path, "application.sqlite");
    writeFileSync(snapshotDb, "", { mode: 0o600, flag: "wx" });
    const source = new DatabaseSync(dbFile, { readOnly: true, timeout: 5000 });
    try { await backup(source, snapshotDb); } finally { source.close(); }
    const snapshotOriginals = join(snapshot.path, "originals");
    mkdirSync(snapshotOriginals, { mode: 0o700 });
    const expected = await originalInventory(config.originals, snapshotOriginals);
    const copied = await originalInventory(snapshotOriginals);
    if (JSON.stringify(expected) !== JSON.stringify(copied)) throw Error("MANAGED_BACKUP_COPY_MISMATCH");
    const tables = inventory(snapshotDb, expected.objects);
    const archiveFile = join(recovery, randomUUID() + ".tar");
    const fd = openSync(archiveFile, "wx", 0o600);
    try {
      execFileSync("tar", ["-cf", "-", "-C", snapshot.path, "application.sqlite", "originals"], { ...tarOptions, stdio: ["ignore", fd, "ignore"] });
    } finally { closeSync(fd); }
    const archiveSha256 = await fileSha(archiveFile);
    const started = performance.now();
    const entries = execFileSync("tar", ["-tf", archiveFile], tarOptions).trim().split(/\r?\n/);
    if (new Set(entries).size !== entries.length || !entries.includes("application.sqlite") || entries.some((name) =>
      !/^(?:application\.sqlite|originals\/?|originals\/[a-f0-9]{2}\/?|originals\/[a-f0-9]{2}\/[a-f0-9]{64}\.(?:blob|json))$/.test(name))) throw Error("MANAGED_ARCHIVE_PATH_INVALID");
    const types = execFileSync("tar", ["-tvf", archiveFile], tarOptions).trim().split(/\r?\n/);
    if (types.length !== entries.length || types.some((line) => !["-", "d"].includes(line[0]))) throw Error("MANAGED_ARCHIVE_LINK_FORBIDDEN");
    restored = ownedTemp(recovery, ".restored-");
    execFileSync("tar", ["-xf", archiveFile, "--no-same-owner", "-C", restored.path], tarOptions);
    const actual = await originalInventory(join(restored.path, "originals"));
    const restoredTables = inventory(join(restored.path, "application.sqlite"), actual.objects);
    if (JSON.stringify(expected) !== JSON.stringify(actual) || JSON.stringify(tables) !== JSON.stringify(restoredTables) ||
        await fileSha(snapshotDb) !== await fileSha(join(restored.path, "application.sqlite")) ||
        archiveSha256 !== await fileSha(archiveFile)) throw Error("MANAGED_RESTORE_PARITY_FAILED");
    mkdirSync(join(restored.path, "backups"), { mode: 0o700 });
    const restoreMs = Math.round(performance.now() - started);
    snapshot.cleanup();
    return { archiveFile, archiveSha256, restoredRoot: restored.path, objects: actual.objects.length,
      bytes: actual.bytes, tables, restoreMs, cleanup: () => restored.cleanup() };
  } catch (error) {
    try { restored?.cleanup(); } finally { snapshot?.cleanup(); }
    throw Error("MANAGED_BACKUP_RESTORE_FAILED", { cause: error });
  }
}

async function responseBytes(response, type) {
  if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0] !== type) {
    await response.body?.cancel();
    throw Error("MANAGED_RESTORE_HTTP_INVALID");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || (type === "image/webp" && (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP"))) throw Error("MANAGED_RESTORE_HTTP_PAYLOAD_INVALID");
  return bytes;
}

async function httpBytes(origin, path, type) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual", headers: { accept: type, connection: "close" }, signal: AbortSignal.timeout(20_000),
  });
  return responseBytes(response, type);
}

export function homepageEvidence(html) {
  if (typeof html !== "string" || html.length > 8 * 1024 * 1024) throw Error("MANAGED_RESTORE_HTML_INVALID");
  const markup = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // shortcut: compares SSR text without CSS visibility; use a DOM parser if future markup requires it.
  const text = (value) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ").replace(/\s+/g, " ").trim();
  const title = text(markup.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  const headings = [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map((match) => text(match[1])).filter(Boolean);
  const body = text(markup.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "");
  if (!title || !headings.length || !body) throw Error("MANAGED_RESTORE_HTML_EVIDENCE_MISSING");
  return { titleSha256: sha(title), h1Sha256: sha(headings.join("\n")), bodyTextSha256: sha(body) };
}

async function stopChildGroup(child) {
  if (!child?.pid) return;
  const signal = (value) => {
    try { process.kill(-child.pid, value); return true; }
    catch (error) { if (error.code === "ESRCH") return false; throw error; }
  };
  for (const value of ["SIGTERM", "SIGKILL"]) {
    if (!signal(value)) return;
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (!signal(0)) return;
      await delay(50);
    }
  }
  throw Error("MANAGED_RESTORE_CHILD_CLEANUP_FAILED");
}

export async function proveManagedRestore(config, onBackup = () => {}) {
  if (process.platform !== "linux") throw Error("MANAGED_RESTORE_LINUX_REQUIRED");
  let saved, child;
  try {
    saved = await createManagedBackup(config);
    onBackup({ objects: saved.objects, bytes: saved.bytes, archiveSha256: saved.archiveSha256, restoreMs: saved.restoreMs });
    const httpStarted = performance.now();
    const db = new DatabaseSync(join(saved.restoredRoot, "application.sqlite"), { readOnly: true });
    let image;
    try {
      image = db.prepare("SELECT i.id FROM images i JOIN albums a ON i.album_id=a.id WHERE i.status='ready' AND a.status='published' AND i.deleted_at IS NULL AND a.deleted_at IS NULL AND i.original_key NOT LIKE 'static:%' ORDER BY i.id LIMIT 1").get();
    } finally { db.close(); }
    if (!image || typeof image.id !== "string") throw Error("MANAGED_RESTORE_PUBLIC_IMAGE_REQUIRED");
    const env = { ...process.env, NODE_ENV: "production",
      PUNCTUM_CANDIDATE_DB_FILE: join(saved.restoredRoot, "application.sqlite"),
      PUNCTUM_CANDIDATE_ORIGINALS: join(saved.restoredRoot, "originals"), PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(saved.restoredRoot, "backups") };
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), "probe", image.id], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), env, detached: true,
      stdio: ["ignore", "pipe", "ignore"], signal: AbortSignal.timeout(90_000), killSignal: "SIGKILL",
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text) => {
      if (stdout.length < 16_384) stdout += text.slice(0, 16_384 - stdout.length);
    });
    const [exit] = await once(child, "close");
    const prefix = "PUNCTUM_RESTORED_ROUTES ";
    const line = stdout.split("\n").find((text) => text.startsWith(prefix));
    if (!line || exit !== 0) {
      const reason = stdout.match(/^PUNCTUM_RESTORED_FAILURE ([A-Z0-9_]+)$/m)?.[1];
      throw Error("MANAGED_RESTORE_CHILD_EXITED", reason ? { cause: Error(reason) } : undefined);
    }
    const restored = JSON.parse(line.slice(prefix.length));
    const liveOrigin = new URL(config.publicOrigin).origin;
    const liveHome = await httpBytes(liveOrigin, "/", "text/html");
    if (JSON.stringify(restored.home) !== JSON.stringify(homepageEvidence(liveHome.toString("utf8")))) throw Error("MANAGED_RESTORE_HOME_MISMATCH");
    const path = `/media/${encodeURIComponent(image.id)}/card`;
    const liveCard = await httpBytes(liveOrigin, path, "image/webp");
    if (liveCard.length !== restored.cardBytes || sha(liveCard) !== restored.cardSha256) throw Error("MANAGED_RESTORE_CARD_MISMATCH");
    const httpMs = Math.round(performance.now() - httpStarted);
    return { status: "MANAGED_RESTORE_VERIFIED", archiveFile: saved.archiveFile, archiveSha256: saved.archiveSha256,
      objects: saved.objects, bytes: saved.bytes, tables: saved.tables, restoreMs: saved.restoreMs,
      httpMs, functionalRestoreMs: saved.restoreMs + httpMs, routeProbe: "isolated-compiled-handler" };
  } catch (error) { throw Error("MANAGED_RESTORE_PROOF_FAILED", { cause: error }); }
  finally { try { await stopChildGroup(child); } finally { saved?.cleanup(); } }
}

async function probeRestoredRoutes(imageId) {
  process.umask(0o077);
  const { candidateConfig } = await import("./candidate-runtime.mjs");
  const { installNodeR4StreamCompatibility } = await import("../punctum-hostinger-node/node-r4-stream-compat.mjs");
  const config = candidateConfig();
  installNodeR4StreamCompatibility();
  const dist = new URL("../../dist/hostinger-candidate/", import.meta.url);
  process.env.PUNCTUM_QA_CLIENT_DIRECTORY = fileURLToPath(new URL("client/", dist));
  process.env.PUNCTUM_QA_SHARP_WORKER = fileURLToPath(new URL("../punctum-hostinger-node/sharp-worker.mjs", import.meta.url));
  const { default: handler } = await import(new URL("server/index.js", dist));
  const get = async (path, type) => responseBytes(await handler(new Request(new URL(path, config.publicOrigin), { headers: { accept: type } })), type);
  const health = JSON.parse((await get("/api/health", "application/json")).toString("utf8"));
  if (health.ok !== true || health.service !== "punctum-picture") throw Error("MANAGED_RESTORE_HEALTH_INVALID");
  const home = homepageEvidence((await get("/", "text/html")).toString("utf8"));
  const card = await get(`/media/${encodeURIComponent(imageId)}/card`, "image/webp");
  console.log("PUNCTUM_RESTORED_ROUTES " + JSON.stringify({ home, cardBytes: card.length, cardSha256: sha(card) }));
}

if (import.meta.main && process.argv[2] === "probe") {
  try { await probeRestoredRoutes(process.argv[3]); }
  catch (error) {
    const code = [error.message, error.code].find((value) => /^(?:MANAGED|CANDIDATE|ERR)_[A-Z0-9_]+$/.test(value ?? ""));
    console.log("PUNCTUM_RESTORED_FAILURE " + (code ?? "MANAGED_RESTORE_HANDLER_FAILED"));
    process.exitCode = 1;
  }
}
