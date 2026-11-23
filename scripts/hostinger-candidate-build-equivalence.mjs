import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rscBundle = "server/index.js";
const rscManifest = "server/vinext-server.json";
const ssrManifest = "server/ssr/vinext-server.json";
const uuidV4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const buildIdBindings = [
  [String.raw`\bget buildId\(\)\s*\{\s*return `, String.raw`;\s*\}`],
  [String.raw`\bfunction appIsrCacheKey\(pathname, suffix, buildId = `, String.raw`\)\s*\{`],
  [String.raw`\bdeploymentVersion: `, String.raw`,\s*rootBoundaryId\b`],
];
const prerenderManifest = /^\{"prerenderSecret":"([0-9a-f]{64})"\}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fileInventory(root) {
  const files = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) throw new Error("UNEXPECTED_BUILD_FILE_TYPE");
    files.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"));
  }
  return files.sort();
}

function maskUuid(source, before, after, name) {
  const pattern = new RegExp(`(${before}")(${uuidV4})("${after})`, "g");
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`INVALID_VINEXT_${name}_BINDING`);
  return { value: matches[0][2], masked: source.replace(pattern, `$1<${name}>$3`) };
}

function vinextValues(root) {
  const bundle = utf8.decode(readFileSync(join(root, rscBundle)));
  const draft = maskUuid(bundle,
    String.raw`\bfunction getDraftSecret\(\)\s*\{\s*return `, String.raw`;\s*\}`, "DRAFT");
  let masked = draft.masked;
  const buildIds = new Set();
  for (const [before, after] of buildIdBindings) {
    const build = maskUuid(masked, before, after, "BUILD_ID");
    buildIds.add(build.value);
    masked = build.masked;
  }
  if (buildIds.size !== 1 || buildIds.has(draft.value)) throw new Error("VINEXT_BUILD_ID_MISMATCH");

  const rsc = utf8.decode(readFileSync(join(root, rscManifest)));
  const ssr = utf8.decode(readFileSync(join(root, ssrManifest)));
  const rscSecret = rsc.match(prerenderManifest)?.[1];
  const ssrSecret = ssr.match(prerenderManifest)?.[1];
  if (!rscSecret || !ssrSecret) throw new Error("INVALID_VINEXT_SERVER_MANIFEST");
  if (rscSecret !== ssrSecret) throw new Error("VINEXT_PRERENDER_SECRET_MISMATCH");

  // Vinext 0.0.50 also inlines its build ID in request metadata, ISR keys, and the RSC graph.
  return {
    draftSecret: draft.value,
    buildId: [...buildIds][0],
    prerenderSecret: rscSecret,
    normalized: new Map([
      [rscBundle, sha256(masked)],
      [rscManifest, sha256(rsc.replace(rscSecret, "<PRERENDER_SECRET>"))],
      [ssrManifest, sha256(ssr.replace(ssrSecret, "<PRERENDER_SECRET>"))],
    ]),
  };
}

export function compareCandidateBuilds(leftRoot, rightRoot) {
  const leftFiles = fileInventory(leftRoot);
  const rightFiles = fileInventory(rightRoot);
  if (leftFiles.length !== rightFiles.length || leftFiles.some((file, index) => file !== rightFiles[index])) {
    throw new Error("BUILD_INVENTORY_MISMATCH");
  }
  if (![rscBundle, rscManifest, ssrManifest].every((file) => leftFiles.includes(file))) {
    throw new Error("MISSING_VINEXT_BUILD_FILES");
  }

  const left = vinextValues(leftRoot);
  const right = vinextValues(rightRoot);
  if (left.draftSecret === right.draftSecret || left.prerenderSecret === right.prerenderSecret) {
    throw new Error("VINEXT_SECRET_REUSED");
  }
  if (left.buildId === right.buildId) throw new Error("VINEXT_BUILD_ID_REUSED");

  const normalizedFiles = [];
  for (const file of leftFiles) {
    if (sha256(readFileSync(join(leftRoot, file))) === sha256(readFileSync(join(rightRoot, file)))) continue;
    if (!left.normalized.has(file) || left.normalized.get(file) !== right.normalized.get(file)) {
      throw new Error(`UNEXPECTED_BUILD_DRIFT ${JSON.stringify(file)}`);
    }
    normalizedFiles.push(file);
  }
  return { filesCompared: leftFiles.length, byteIdentical: leftFiles.length - normalizedFiles.length, normalizedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error("Usage: node hostinger-candidate-build-equivalence.mjs <build-a> <build-b>");
    console.log(JSON.stringify(compareCandidateBuilds(process.argv[2], process.argv[3])));
  } catch (error) {
    console.error(error.code ?? error.message);
    process.exitCode = 1;
  }
}
