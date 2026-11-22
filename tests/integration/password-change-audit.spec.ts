import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../../worker/test-entry";
import { createAdminSession } from "../../worker/utils/auth";
import { createClientSession } from "../../worker/client/auth";
import { hashClientPassword } from "../../worker/client/passwords";
import { bootstrapPrivateDb, seedClient } from "./client-fixture";

const origin = "https://password.example.invalid";
const adminEmail = "synthetic-admin@example.invalid";
const oldPassword = "synthetic-previous-password", newPassword = "synthetic-replacement-password";

describe("own-password credential and audit atomicity", () => {
  beforeAll(bootstrapPrivateDb);
  it.each(["admin", "client"] as const)("rolls back the complete %s credential row on audit failure and retries once", async (kind) => {
    const credential = await hashClientPassword(oldPassword);
    const client = await seedClient();
    const activeEnv = { ...env, ENVIRONMENT: "production", SITE_ORIGIN: origin,
      ADMIN_ALLOWED_EMAILS: adminEmail, ADMIN_AUTH_MODE: "legacy", CLIENT_AUTH_MODE: "password" } as unknown as Env;
    if (kind === "admin") {
      await env.DB.prepare(`INSERT INTO admin_credentials(id,password_hash,password_salt,password_iterations,updated_at,updated_by)
        VALUES (1,?,?,?,'2026-11-22','synthetic-seed') ON CONFLICT(id) DO UPDATE SET
        password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=excluded.password_iterations`)
        .bind(credential.passwordHash, credential.passwordSalt, credential.passwordIterations).run();
    } else {
      await env.DB.prepare(`UPDATE client_accounts SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=1 WHERE id=?`)
        .bind(credential.passwordHash, credential.passwordSalt, credential.passwordIterations, client).run();
    }
    const cookie = kind === "admin"
      ? "punctum_admin_session=" + await createAdminSession(adminEmail, activeEnv)
      : "punctum_client_session=" + await createClientSession({ id: client, sessionVersion: 1 }, activeEnv);
    const table = kind === "admin" ? "admin_credentials" : "client_accounts";
    const row = () => env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(kind === "admin" ? 1 : client).first();
    const before = await row(), action = `${kind}.password_changed`;
    const audits = () => env.DB.prepare("SELECT * FROM audit_log WHERE action=? ORDER BY id").bind(action).all();
    const auditBefore = await audits();
    const request = () => new Request(origin + (kind === "admin" ? "/admin/api/session" : "/api/client/password"), {
      method: kind === "admin" ? "PATCH" : "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(kind === "admin" ? { currentPassword: oldPassword, newPassword } : { password: newPassword }),
    });
    await env.DB.prepare(`CREATE TRIGGER synthetic_own_password_audit_failure BEFORE INSERT ON audit_log
      WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'synthetic own-password audit failure'); END`).run();
    try {
      expect((await worker.fetch(request(), activeEnv)).status).toBe(500);
      expect(await row()).toEqual(before);
      expect((await audits()).results).toEqual(auditBefore.results);
    } finally { await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_own_password_audit_failure").run(); }
    const retry = await worker.fetch(request(), activeEnv);
    expect(retry.status).toBe(200);
    expect(await row()).not.toEqual(before);
    const events = (await audits()).results;
    expect(events).toHaveLength(auditBefore.results.length + 1);
    expect(events.find(event => !auditBefore.results.some(previous => previous.id === event.id)))
      .toMatchObject({ actor_email: kind === "admin" ? "shared-password@punctum.invalid" : `client:${client}`,
        action, entity_type: kind === "admin" ? "admin" : "client_account", entity_id: kind === "admin" ? null : client });
    const replay = await worker.fetch(new Request(origin + (kind === "admin" ? "/admin/api/me" : "/api/client/me"), {
      headers: { Cookie: cookie },
    }), activeEnv);
    expect([401, 403]).toContain(replay.status);
  }, 60_000);

  it("does not audit a client password change that loses its session-version race", async () => {
    const client = await seedClient();
    const activeEnv = { ...env, ENVIRONMENT: "production", SITE_ORIGIN: origin, CLIENT_AUTH_MODE: "password" } as unknown as Env;
    const cookie = "punctum_client_session=" + await createClientSession({ id: client, sessionVersion: 1 }, activeEnv);
    const before = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    let interleaved = false;
    const concurrentDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") return async (statements: D1PreparedStatement[]) => {
          // Another valid operation invalidates the session after preflight.
          interleaved = true;
          await target.prepare("UPDATE client_accounts SET session_version=session_version+1 WHERE id=?").bind(client).run();
          return target.batch(statements);
        };
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await worker.fetch(new Request(origin + "/api/client/password", {
      method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    }), { ...activeEnv, DB: concurrentDb } as Env);
    expect(interleaved).toBe(true);
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first())
      .toEqual({ ...before, session_version: 2 });
    expect((await env.DB.prepare("SELECT id FROM audit_log WHERE entity_id=? AND action='client.password_changed'")
      .bind(client).all()).results).toEqual([]);
  });
});
