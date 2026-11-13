import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, constants } from "node:fs";
import { join, resolve } from "node:path";

// Exported D1 SQL is sensitive. Only CMS-encrypted outputs may enter public-repo artifacts.
function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error("missing_" + name);
  return value;
}
function openssl(args) {
  return execFileSync("openssl", args, {
    encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function main() {
  const input = resolve(required("PUNCTUM_D1_STAGE_INPUT_SQL"));
  const cert = resolve(required("PUNCTUM_D1_STAGE_RECIPIENT_CERT"));
  const dir = resolve(required("PUNCTUM_D1_STAGE_OUTPUT_DIR"));
  const expected = required("PUNCTUM_D1_STAGE_CERT_SHA256").replace(/:/g, "").toLowerCase();
  const databaseId = required("PUNCTUM_D1_STAGE_DATABASE_ID");
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9-]{36}$/.test(databaseId)) {
    throw new Error("invalid_stage_identity");
  }
  const source = statSync(input);
  if (!source.isFile() || source.size < 100 || source.size > 512 * 1024 * 1024) {
    throw new Error("invalid_sql_size");
  }
  if (!lstatSync(cert).isFile()) throw new Error("invalid_certificate_path");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(dir).isDirectory()) throw new Error("invalid_destination");
  const output = join(dir, "punctum-d1-stage.cms");
  const metadata = join(dir, "punctum-d1-stage-manifest.json");
  if (existsSync(output) || existsSync(metadata)) throw new Error("output_already_exists");
  openssl(["x509", "-checkend", "3600", "-noout", "-in", cert]);
  const actual = openssl(["x509", "-noout", "-fingerprint", "-sha256", "-in", cert])
    .trim().split("=").at(-1).replace(/:/g, "").toLowerCase();
  if (actual !== expected) throw new Error("certificate_fingerprint_mismatch");
  const temp = mkdtempSync(join(dir, ".pending-stage-"));
  chmodSync(temp, 0o700);
  try {
    const cipher = join(temp, "encrypted.cms");
    const manifest = join(temp, "manifest.json");
    openssl(["cms", "-encrypt", "-binary", "-aes-256-gcm", "-outform", "DER",
      "-in", input, "-out", cipher, "-recip", cert,
      "-keyopt", "rsa_padding_mode:oaep"]);
    const structure = openssl(["cms", "-cmsout", "-print", "-inform", "DER", "-in", cipher]);
    if (!structure.includes("aes-256-gcm") || !structure.includes("rsaesOaep")) {
      throw new Error("unexpected_algorithm");
    }
    const encrypted = statSync(cipher);
    if (!encrypted.isFile() || encrypted.size < 200) throw new Error("invalid_ciphertext");
    chmodSync(cipher, 0o600);
    const receipt = {
      schema: "punctum-encrypted-d1-stage-v1",
      database: "punctum-picture", databaseId,
      encryptedAt: new Date().toISOString(),
      cipher: "CMS-AES-256-GCM-RSA-OAEP-SHA256",
      certificateFingerprintSha256: actual,
      sqlBytes: source.size, sqlSha256: hashFile(input),
      cmsBytes: encrypted.size, cmsSha256: hashFile(cipher),
      sourceReadOnly: true, productionDataImported: false, dnsTouched: false,
    };
    writeFileSync(manifest, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    copyFileSync(cipher, output, constants.COPYFILE_EXCL);
    copyFileSync(manifest, metadata, constants.COPYFILE_EXCL);
    chmodSync(output, 0o600);
    chmodSync(metadata, 0o600);
    console.log(JSON.stringify({ status: "ENCRYPTED_ONLY", ...receipt }));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
try { main(); } catch {
  // Never log SQL, paths, credentials or OpenSSL diagnostics.
  console.error("PUNCTUM_D1_STAGE_FAILED");
  process.exitCode = 1;
}
