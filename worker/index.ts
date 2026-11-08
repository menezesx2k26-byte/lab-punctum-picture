import { WorkerEntrypoint } from "cloudflare:workers";
import { isPublicHomeCacheRequest, isPublicHomeMutationRequest, publicHomeCacheResponse, shouldPurgePublicHome, PUBLIC_HOME_CACHE_TAG } from "./public-home-cache";
import { invalidatePublicHomeSnapshot, readPublicHomeSnapshot } from "./public-home-snapshot";
import { envString } from "./utils/env";
import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handlePrivateGalleryRoutes, isPrivateGalleryPath } from "./client/router";
import { privateResponse } from "./client/response";
import { handleAdminApi } from "./api/admin";
import { handleAdminAuth } from "./api/admin-auth";
import { handlePublicApi } from "./api/public";
import { serveMedia } from "./media/serve";
import { handleScheduled } from "./scheduled";
import { robots, sitemap } from "./seo";
import { handleSiteMediaApi } from "./site-media";
import { assertAllowedOrigin, requireAdmin } from "./utils/auth";
import { AppError } from "./utils/errors";
import { apiError, withSecurityHeaders } from "./utils/response";

async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.hostname === "www.punctumpicture.com") {
    const redirect = Response.redirect(
      `https://punctumpicture.com${url.pathname}${url.search}`,
      308,
    );
    return isPrivateGalleryPath(url.pathname) ? privateResponse(redirect) : redirect;
  }
  const privateResult = await handlePrivateGalleryRoutes(request, url, env);
  if (privateResult) return privateResult;

  if (url.pathname === "/_vinext/image") {
    if (!env.IMAGES) {
      const source = url.searchParams.get("url");
      if (!source || !source.startsWith("/") || source.startsWith("//")) {
        throw new AppError(400, "INVALID_IMAGE_SOURCE", "A origem da imagem Ã© invÃ¡lida.");
      }

      const sourceUrl = new URL(source, request.url);
      const mediaMatch = sourceUrl.pathname.match(/^\/media\/([^/]+)\/([^/]+)$/);
      if (mediaMatch) {
        return serveMedia(
          request,
          env,
          decodeURIComponent(mediaMatch[1]),
          decodeURIComponent(mediaMatch[2]),
        );
      }

      return withSecurityHeaders(
        await env.ASSETS.fetch(new Request(sourceUrl)),
      );
    }
    const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
    return handleImageOptimization(
      request,
      {
        fetchAsset: (path) =>
          env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const imageFormat = format as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif"
            | "image/avif";
          const result = await env.IMAGES.input(body)
            .transform(width > 0 ? { width } : {})
            .output({ format: imageFormat, quality });
          return result.response();
        },
      },
      allowedWidths,
    );
  }

  const publicResponse = await handlePublicApi(request, url, env);
  if (publicResponse) {
    return publicResponse;
  }

  const adminAuthResponse = await handleAdminAuth(request, url, env);
  if (adminAuthResponse) {
    return adminAuthResponse;
  }

  const siteMediaResponse = await handleSiteMediaApi(request, url, env);
  if (siteMediaResponse) {
    return siteMediaResponse;
  }

  const adminResponse = await handleAdminApi(request, url, env);
  if (adminResponse) {
    return adminResponse;
  }

  const adminMediaMatch = url.pathname.match(
    /^\/admin\/media\/([^/]+)\/([^/]+)$/,
  );
  if (request.method === "GET" && adminMediaMatch) {
    await requireAdmin(request, env);
    return serveMedia(
      request,
      env,
      decodeURIComponent(adminMediaMatch[1]),
      decodeURIComponent(adminMediaMatch[2]),
      { audience: "admin" },
    );
  }

  const mediaMatch = url.pathname.match(/^\/media\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && mediaMatch) {
    return serveMedia(
      request,
      env,
      decodeURIComponent(mediaMatch[1]),
      decodeURIComponent(mediaMatch[2]),
    );
  }

  if (request.method === "GET" && url.pathname === "/sitemap.xml") {
    return sitemap(env);
  }
  if (request.method === "GET" && url.pathname === "/robots.txt") {
    return robots(env);
  }

  if (
    url.pathname === "/studio-preview-internal" ||
    url.pathname.startsWith("/studio-preview-internal/")
  ) {
    throw new AppError(404, "NOT_FOUND", "PÃ¡gina nÃ£o encontrada.");
  }

  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    try {
      await requireAdmin(request, env);
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.status === 401 || error.status === 403) &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const loginUrl = new URL("/acesso", request.url);
        loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
        const redirect=Response.redirect(loginUrl,303);
        return isPrivateGalleryPath(url.pathname) ? privateResponse(redirect) : redirect;
      }
      throw error;
    }
  }

  if (request.method === "GET" && url.pathname === "/admin/studio/preview") {
    const internalUrl = new URL(request.url);
    internalUrl.pathname = "/studio-preview-internal";
    const previewResponse = await handler.fetch(
      new Request(internalUrl, request),
      env,
      ctx,
    );
    return withSecurityHeaders(previewResponse, { studioPreview: true });
  }

  if (envString(env, "PUBLIC_HOME_SNAPSHOT_ENABLED") === "true" && isPublicHomeCacheRequest(request) && env.DB) {
    const snapshot = await readPublicHomeSnapshot(env.DB, envString(env, "PUBLIC_HOME_SNAPSHOT_BUILD_ID") ?? "");
    if (snapshot) return withSecurityHeaders(snapshot);
  }
  const response = await handler.fetch(request, env, ctx);
  return isPrivateGalleryPath(url.pathname) ? privateResponse(response) : withSecurityHeaders(response);
}

/**
 * A separately cached WorkerEntrypoint for anonymous public home HTML only.
 * Default/admin/client entrypoints remain uncached; no client data reaches here.
 */
export class PublicHome extends WorkerEntrypoint<Env> {
  async purgeCache(): Promise<boolean> {
    // Purge must execute from the entrypoint that owns the cached HTML.
    if (!this.ctx.cache) return false;
    const result = await this.ctx.cache.purge({ tags: [PUBLIC_HOME_CACHE_TAG] });
    return result.success === true;
  }

  async fetch(request: Request): Promise<Response> {
    if (!isPublicHomeCacheRequest(request))
      return publicHomeCacheResponse(request, new Response(null, { status: 404 }));
    try {
      const response = await routeRequest(request, this.env, this.ctx);
      return publicHomeCacheResponse(request, response);
    } catch (error) {
      return publicHomeCacheResponse(request, apiError(error));
    }
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    let snapshotInvalidated = false;
    try {
      if (envString(env, "PUBLIC_HOME_CACHE_ENABLED") === "true" && isPublicHomeCacheRequest(request)) {
        const entrypoint = (ctx as ExecutionContext & { exports?: { PublicHome?: { fetch(req: Request): Promise<Response> } } }).exports?.PublicHome;
        if (!entrypoint) throw new AppError(503, "PUBLIC_HOME_CACHE_UNAVAILABLE", "Cache de páginas públicas indisponível.");
        return await entrypoint.fetch(request);
      }
      if (envString(env, "PUBLIC_HOME_SNAPSHOT_ENABLED") === "true" && isPublicHomeMutationRequest(request)) {
        // If publication wins a race with snapshot staging, the epoch prevents
        // an older render from being reintroduced. Verify the same security
        // boundaries as the admin router before touching the epoch.
        await requireAdmin(request, env);
        assertAllowedOrigin(request, env);
        if (!env.DB) throw new AppError(503, "PUBLIC_HOME_SNAPSHOT_UNAVAILABLE", "Snapshot público indisponível.");
        await invalidatePublicHomeSnapshot(env.DB);
        snapshotInvalidated = true;
      }
      const response = await routeRequest(request, env, ctx);
      if (envString(env, "PUBLIC_HOME_CACHE_ENABLED") === "true" && shouldPurgePublicHome(request, response)) {
        const entrypoint = (ctx as ExecutionContext & {
          exports?: { PublicHome?: { purgeCache(): Promise<boolean> } }
        }).exports?.PublicHome;
        // An already-committed write must not be retried or disguised as a failed
        // request just because a best-effort cache purge is unavailable.
        try {
          if (!entrypoint || !(await entrypoint.purgeCache()))
            console.warn("Punctum public home purge unconfirmed after a successful admin change");
        } catch {
          console.warn("Punctum public home purge unavailable after a successful admin change");
        }
      }
      return response;
    } catch (error) {
      if (snapshotInvalidated && envString(env, "PUBLIC_HOME_CACHE_ENABLED") === "true") {
        // Even a failed mutation might have partially committed a public edit.
        // Do not leave the previous public HTML at the edge in that case.
        try {
          const entrypoint = (ctx as ExecutionContext & {
            exports?: { PublicHome?: { purgeCache(): Promise<boolean> } }
          }).exports?.PublicHome;
          if (!entrypoint || !(await entrypoint.purgeCache()))
            console.warn("Punctum public home purge unconfirmed after failed admin change");
        } catch {
          console.warn("Punctum public home purge unavailable after failed admin change");
        }
      }
      if (isPrivateGalleryPath(new URL(request.url).pathname)) return privateResponse(apiError(error,requestId));
      if (error instanceof AppError && error.status === 404 && !new URL(request.url).pathname.startsWith("/api/")) {
        return new Response("PÃ¡gina nÃ£o encontrada.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return apiError(error, requestId);
    }
  },
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
