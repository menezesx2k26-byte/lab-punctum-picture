import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "hostinger-encrypt-d1-stage.mjs");
const databaseId = "22697f13-7484-41e3-9441-f7b902c6577a";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "punctum-d1-stage-"));
  const sql = join(root, "source.sql");
  const cert = join(root, "recipient.crt");
  const key = join(root, "recipient.key");
  const output = join(root, "encrypted");
  mkdirSync(output, { mode: 0o700 });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:3072", "-noenc",
    "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=Punctum synthetic test"],
    { stdio: "ignore", timeout: 30000 });
  const plaintext = Buffer.from("-- Synthetic fixture, not production data\nCREATE TABLE fixtures (id INTEGER, message TEXT);\nINSERT INTO fixtures VALUES (1, 'synthetic-secret-fixture');\n");
  writeFileSync(sql, plaintext, { mode: 0o600 });
  chmodSync(sql, 0o600);
  const fingerprint = execFileSync("openssl", ["x509", "-noout", "-fingerprint", "-sha256", "-in", cert],
    { encoding: "utf8" }).trim().split("=").at(-1).replace(/:/g, "").toLowerCase();
  const env = { ...process.env, PUNCTUM_D1_STAGE_INPUT_SQL: sql,
    PUNCTUM_D1_STAGE_RECIPIENT_CERT: cert, PUNCTUM_D1_STAGE_CERT_SHA256: fingerprint,
    PUNCTUM_D1_STAGE_OUTPUT_DIR: output, PUNCTUM_D1_STAGE_DATABASE_ID: databaseId };
  return { root, cert, key, output, fingerprint, env, plaintext };
}

test("synthetic D1 export is AEAD encrypted; valid decrypt and tamper rejection", () => {
  const f = fixture();
  try {
    const run = spawnSync(process.execPath, [script], { env: f.env, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const cms = join(f.output, "punctum-d1-stage.cms");
    const blob = readFileSync(cms);
    const receipt = JSON.parse(readFileSync(join(f.output, "punctum-d1-stage-manifest.json"), "utf8"));
    assert.equal(receipt.schema, "punctum-encrypted-d1-stage-v1");
    assert.equal(receipt.certificateFingerprintSha256, f.fingerprint);
    assert.equal(receipt.productionDataImported, false);
    assert.equal(receipt.dnsTouched, false);
    assert.equal(blob.includes(Buffer.from("synthetic-secret-fixture")), false);
    assert.equal(run.stdout.includes("synthetic-secret-fixture"), false);
    const decrypted = join(f.root, "decrypted.sql");
    execFileSync("openssl", ["cms", "-decrypt", "-binary", "-inform", "DER", "-in", cms,
      "-recip", f.cert, "-inkey", f.key, "-out", decrypted], { stdio: "ignore" });
    assert.deepEqual(readFileSync(decrypted), f.plaintext);
    blob[blob.length - 4] ^= 1;
    const tampered = join(f.root, "tampered.cms");
    writeFileSync(tampered, blob);
    const bad = spawnSync("openssl", ["cms", "-decrypt", "-binary", "-inform", "DER",
      "-in", tampered, "-recip", f.cert, "-inkey", f.key, "-out", join(f.root, "tampered.sql")]);
    assert.notEqual(bad.status, 0);
    assert.notEqual(spawnSync(process.execPath, [script], { env: f.env }).status, 0);
    assert.deepEqual(readdirSync(f.output).sort(),
      ["punctum-d1-stage-manifest.json", "punctum-d1-stage.cms"].sort());
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("wrong certificate fingerprint creates no artifact", () => {
  const f = fixture();
  try {
    const run = spawnSync(process.execPath, [script], { env: {
      ...f.env, PUNCTUM_D1_STAGE_CERT_SHA256: "0".repeat(64) } });
    assert.notEqual(run.status, 0);
    assert.deepEqual(readdirSync(f.output), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
