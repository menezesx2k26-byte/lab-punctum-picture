import { envString } from "../utils/env";
import { AppError } from "../utils/errors";

/** Never let a client application assertion act as an administrator assertion. */
export function assertSeparateAccessAudiences(env: Env): void {
  const client = envString(env, "CLIENT_ACCESS_AUD")?.trim();
  const admin = envString(env, "CLOUDFLARE_ACCESS_AUD")?.trim();
  if (client && admin && client === admin) {
    throw new AppError(503, "CLIENT_ACCESS_CONFIG_INVALID", "Configuração de acesso indisponível.");
  }
}
