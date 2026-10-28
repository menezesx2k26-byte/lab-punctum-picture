import vinext from "vinext";
import { defineConfig } from "vite";
import { localPhotographyFixtures } from "./build/local-photography-fixtures";
import { sites } from "./build/sites-vite-plugin";
import { ssrOnDemandClientReferences } from "./build/ssr-on-demand";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  vars: {
    ENVIRONMENT: "local",
    SITE_ORIGIN: "http://localhost:3000",
    PUBLIC_SITE_URL: "http://localhost:3000",
    PUBLIC_WHATSAPP_E164: "5511999999999",
    PUBLIC_INSTAGRAM_URL: "https://instagram.com/punctumpicture",
    MAX_UPLOAD_BYTES: "26214400",
    ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/webp",
    PRESIGNED_URL_TTL_SECONDS: "900",
    CONTACT_RATE_LIMIT_WINDOW_SECONDS: "3600",
    CONTACT_RATE_LIMIT_MAX: "5",
    ADMIN_RATE_LIMIT_WINDOW_SECONDS: "60",
    ADMIN_RATE_LIMIT_MAX: "60",
    ADMIN_ALLOWED_EMAILS: "maria.helena.ifc@gmail.com,menezesx2k26@gmail.com",
    ADMIN_PASSWORD_HASH: "c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265",
    ADMIN_SESSION_SECRET: "local-only-session-secret-with-enough-entropy",
    CLIENT_SESSION_SECRET:
      process.env.CLIENT_SESSION_SECRET ??
      "local-only-independent-client-session-secret",
    PRIVATE_GALLERIES_ENABLED:
      process.env.PRIVATE_GALLERIES_ENABLED ?? "false",
    CLIENT_AUTH_MODE: process.env.CLIENT_AUTH_MODE ?? "password",
    ADMIN_LOGIN_RATE_LIMIT_MAX: "10",
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
    BACKUP_PREFIX: "backups/d1",
    BACKUP_RETENTION_DAYS: "180",
    CLEANUP_ORPHAN_UPLOAD_AGE_HOURS: "24",
  },
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      ssrOnDemandClientReferences(),
      localPhotographyFixtures(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: command === "serve" ? localBindingConfig : undefined,
      }),
    ],
  };
});
