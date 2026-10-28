type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const identifier = (value: unknown): value is string => text(value) && value.length > 0;

function image(value: unknown): boolean {
  return object(value) && identifier(value.id) && text(value.originalFilename) &&
    text(value.altText) && Number.isInteger(value.position) && (value.position as number) >= 0 &&
    value.status === "ready" && typeof value.favorite === "boolean";
}

function gallery(value: unknown, details = false): value is ObjectValue {
  return object(value) && identifier(value.id) && identifier(value.clientId) &&
    text(value.title) && text(value.introduction) &&
    ["noir", "ivory", "warm"].includes(value.theme as string) &&
    (value.coverImageId === null || identifier(value.coverImageId)) &&
    typeof value.allowDownloads === "boolean" && value.status === "published" &&
    (value.images === undefined && !details || Array.isArray(value.images) && value.images.every(image));
}

/** Validate the fields consumed by client components before changing UI state. */
export function validClientResponse(path: string, method: string, data: ObjectValue): boolean {
  if (path === "/api/client/galleries" && method === "GET")
    return Array.isArray(data.galleries) && data.galleries.every((value) => gallery(value));
  const detail = path.match(/^\/api\/client\/galleries\/([^/]+)$/);
  if (detail && method === "GET") {
    try { return gallery(data.gallery, true) && data.gallery.id === decodeURIComponent(detail[1]); }
    catch { return false; }
  }
  if (/^\/api\/client\/galleries\/[^/]+\/favorites\/[^/]+$/.test(path) && ["PUT", "DELETE"].includes(method))
    return typeof data.favorite === "boolean";
  if (path === "/api/client/me" && method === "GET")
    return object(data.client) && identifier(data.client.id) && text(data.client.name) &&
      ["access", "password"].includes(data.authMode as string) && typeof data.mustChangePassword === "boolean";
  if (path === "/api/client/session" && method === "DELETE")
    return data.ok === true && ["/albuns/entrar", "/cdn-cgi/access/logout"].includes(data.logoutUrl as string);
  if (path === "/api/client/session" && method === "POST")
    return typeof data.mustChangePassword === "boolean";
  if (path === "/api/client/password" && method === "POST") return data.ok === true;
  return true;
}
