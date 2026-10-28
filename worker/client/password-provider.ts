import {
  hashClientPassword,
  verifyClientPassword,
  base64Url,
  type ClientCredential,
} from "./passwords";
import { envString } from "../utils/env";
import { AppError } from "../utils/errors";

const PATH = "/internal/punctum-password/v1";
type BridgeFetch = typeof fetch;
const circuits = new WeakMap<Env, { failures: number; until: number; probing: boolean; generation: number }>();
const unavailable = () => new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");

// Best-effort containment per Worker isolate/binding object, never auth state.
// Only one half-open probe is admitted; stale in-flight successes cannot close it.
async function withCircuit<T>(env: Env, operation: () => Promise<T>): Promise<T> {
  let state = circuits.get(env);
  if (!state) {
    state = { failures: 0, until: 0, probing: false, generation: 0 };
    circuits.set(env, state);
  }
  if (state.until > Date.now() || state.probing) throw unavailable();
  const probe = state.until !== 0;
  const generation = state.generation;
  if (probe) state.probing = true;
  try {
    const result = await operation();
    if (state.generation === generation) { state.failures = 0; state.until = 0; }
    return result;
  } catch {
    if (state.generation === generation && (probe || ++state.failures >= 3)) {
      state.until = Date.now() + 30_000;
      state.generation++;
    }
    throw unavailable();
  } finally {
    if (probe) state.probing = false;
  }
}
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const DUMMY_CREDENTIAL: ClientCredential = {
  passwordHash: "A".repeat(43), passwordSalt: "A".repeat(22), passwordIterations: 310_000,
};

function providerConfig(env: Env) {
  const mode = envString(env, "CLIENT_PASSWORD_BACKEND") ?? "local";
  if (mode === "local") return null;
  if (mode !== "hostinger")
    throw new AppError(503, "PASSWORD_BACKEND_INVALID", "Configuração de senha indisponível.");
  const text = envString(env, "CLIENT_PASSWORD_SERVICE_URL");
  const secret = envString(env, "CLIENT_PASSWORD_SERVICE_SECRET");
  if (!text || !secret || new TextEncoder().encode(secret).length < 32)
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  if (["CLIENT_SESSION_SECRET", "ADMIN_SESSION_SECRET"].some((name) => envString(env, name) === secret))
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  let url: URL;
  try { url = new URL(text); }
  catch { throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível."); }
  if (
    url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.search || url.hash || url.pathname !== PATH
  ) throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return { url: url.href, secret };
}
async function callBridge(
  payload: { operation: "hash" | "verify"; password: string; credential?: ClientCredential },
  env: Env,
  fetcher: BridgeFetch,
) {
  const config = providerConfig(env);
  if (!config) throw new AppError(503, "PASSWORD_BACKEND_INVALID", "Serviço de senhas indisponível.");
  return withCircuit(env, async () => {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(unavailable());
    }, 5000);
  });
  try {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const message = new TextEncoder().encode(timestamp + "\n" + nonce + "\n" + body);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = base64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, message)),
  );
  let response: Response;
  try {
    response = await Promise.race([fetcher(config.url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Punctum-Timestamp": timestamp,
        "X-Punctum-Nonce": nonce,
        "X-Punctum-Signature": signature,
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    }).then((received) => {
      // Also release a response arriving after the request budget has expired.
      if (controller.signal.aborted) { void received.body?.cancel().catch(() => undefined); throw unavailable(); }
      return received;
    }), deadline]);
  } catch {
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  }
  let data: unknown;
  try {
    if (Number(response.headers.get("content-length") ?? "0") > 2048) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("response too large");
    }
    reader = response.body?.getReader();
    if (!reader) throw new Error("empty response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        size += value.byteLength;
        if (size > 2048) throw new Error("response too large");
        chunks.push(value);
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder().decode(bytes);
    data = JSON.parse(text);
  } catch {
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  }
  if (controller.signal.aborted) throw unavailable();
  if (payload.operation === "hash") {
    if (!exactKeys(data, ["credential"]) || !isCredential(data.credential)) throw unavailable();
  } else if (!exactKeys(data, ["valid"]) || typeof data.valid !== "boolean") throw unavailable();
  return data;
  } finally {
    clearTimeout(timer);
  }
  });
}
function isCredential(value: unknown): value is ClientCredential {
  if (!exactKeys(value, ["passwordHash", "passwordSalt", "passwordIterations"])) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.passwordHash === "string" && /^[A-Za-z0-9_-]{43}$/.test(c.passwordHash) &&
    typeof c.passwordSalt === "string" && /^[A-Za-z0-9_-]{22}$/.test(c.passwordSalt) &&
    c.passwordIterations === 310_000
  );
}
export async function hashClientPasswordWithProvider(
  password: string,
  env: Env,
  fetcher: BridgeFetch = fetch,
): Promise<ClientCredential> {
  if (!providerConfig(env)) return hashClientPassword(password);
  const data = await callBridge({ operation: "hash", password }, env, fetcher);
  const credential = (data as { credential?: unknown } | null)?.credential;
  if (!isCredential(credential))
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return credential;
}
export async function verifyClientPasswordWithProvider(
  password: string,
  credential: ClientCredential,
  env: Env,
  fetcher: BridgeFetch = fetch,
): Promise<boolean> {
  if (!providerConfig(env)) return verifyClientPassword(password, credential);
  // ACCESS_ONLY markers/corrupt rows must produce the same denied login as an
  // unknown account. Still do equivalent backend work; never accept dummy success.
  const usable = isCredential(credential);
  const data = await callBridge({
    operation: "verify", password, credential: usable ? credential : DUMMY_CREDENTIAL,
  }, env, fetcher);
  const valid = (data as { valid?: unknown } | null)?.valid;
  if (typeof valid !== "boolean")
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return usable && valid;
}
