"use client";
import { validClientResponse } from "./responses";
export class PrivateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function privateApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PrivateApiError("Não foi possível conectar. Tente novamente.", 0);
  }
  const input: unknown = await response.json().catch(() => null);
  const data = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
  const error = data?.error !== null && typeof data?.error === "object"
    ? data.error as Record<string, unknown> : null;
  const message = typeof error?.message === "string" ? error.message : undefined;
  const code = typeof error?.code === "string" ? error.code : undefined;
  if (!response.ok) {
    if (path.startsWith("/api/client/") && path !== "/api/client/session") {
      if (response.status === 401) window.location.replace("/albuns/entrar");
      if (code === "PASSWORD_CHANGE_REQUIRED")
        window.location.replace("/albuns/trocar-senha");
    }
    throw new PrivateApiError(
      message ?? "Não foi possível concluir. Tente novamente.",
      response.status,
      code,
    );
  }
  if (!data || !validClientResponse(path, method, data))
    throw new PrivateApiError("Não foi possível concluir. Tente novamente.", 502);
  return data as T;
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível conectar. Tente novamente.";
}
