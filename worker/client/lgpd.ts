import { AppError } from "../utils/errors";

export const FORBIDDEN_LGPD_EXPORT_KEYS = [
  "passwordHash",
  "password_hash",
  "passwordSalt",
  "password_salt",
  "passwordIterations",
  "password_iterations",
  "sessionVersion",
  "session_version",
  "mustChangePassword",
  "must_change_password",
  "storageKey",
  "storage_key",
  "temporaryPassword",
  "temporary_password",
] as const;

export type RawTitularAccountRow = {
  id: string;
  name: string;
  email: string;
  status?: "active" | "suspended";
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type RawTitularGalleryRow = {
  id: string;
  clientId: string;
  title: string;
  introduction: string;
  status: "draft" | "published" | "archived";
  theme: "ivory" | "noir" | "warm";
  allowDownloads: boolean | number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type RawTitularImageRow = {
  id: string;
  galleryId: string;
  originalFilename: string;
  altText: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  position: number;
  status: "pending" | "ready" | "failed";
  createdAt: string;
  deletedAt: string | null;
  [key: string]: unknown;
};

export type RawTitularFavoriteRow = {
  galleryId: string;
  imageId: string;
  clientId?: string;
  createdAt: string;
  [key: string]: unknown;
};

export type SanitizedTitularExport = {
  schemaVersion: 1;
  exportedAt: string;
  controller: "Punctum Picture";
  purpose: "Portabilidade e acesso aos dados pessoais do titular (LGPD Art. 18)";
  titular: {
    id: string;
    name: string;
    email: string;
    status: "active" | "suspended";
    disabledAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  galleries: Array<{
    id: string;
    title: string;
    introduction: string;
    status: "draft" | "published" | "archived";
    theme: "ivory" | "noir" | "warm";
    allowDownloads: boolean;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    images: Array<{
      id: string;
      originalFilename: string;
      altText: string;
      mimeType: string;
      sizeBytes: number;
      width: number | null;
      height: number | null;
      position: number;
      createdAt: string;
    }>;
  }>;
  favorites: Array<{
    galleryId: string;
    imageId: string;
    createdAt: string;
  }>;
  /** All retained photo metadata, including pending/failed and soft-deleted records.
   * No R2 keys, binary content or authentication data are exposed. */
  retainedImageMetadata: Array<{
    id: string;
    galleryId: string;
    originalFilename: string;
    altText: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    position: number;
    status: "pending" | "ready" | "failed";
    createdAt: string;
    deletedAt: string | null;
  }>;
};

export function buildSanitizedTitularExport(input: {
  account: RawTitularAccountRow;
  galleries: RawTitularGalleryRow[];
  images: RawTitularImageRow[];
  favorites: RawTitularFavoriteRow[];
  exportedAt?: string;
}): SanitizedTitularExport {
  const clientId = input.account.id;
  const ownedGalleries = input.galleries.filter(
    (gallery) => gallery.clientId === clientId,
  );
  const ownedGalleryIds = new Set(ownedGalleries.map((g) => g.id));
  const ownedImages = input.images.filter((image) => ownedGalleryIds.has(image.galleryId));
  const retainedImageMetadata = ownedImages.map((image) => ({
    id: image.id,
    galleryId: image.galleryId,
    originalFilename: image.originalFilename,
    altText: image.altText,
    mimeType: image.mimeType,
    sizeBytes: Number(image.sizeBytes),
    width: image.width === null ? null : Number(image.width),
    height: image.height === null ? null : Number(image.height),
    position: Number(image.position),
    status: image.status,
    createdAt: image.createdAt,
    deletedAt: image.deletedAt,
  }));

  const readyImagesByGallery = new Map<
    string,
    SanitizedTitularExport["galleries"][number]["images"]
  >();

  for (const image of ownedImages) {
    if (
      image.deletedAt ||
      image.status !== "ready"
    ) {
      continue;
    }
    const list = readyImagesByGallery.get(image.galleryId) ?? [];
    list.push({
      id: image.id,
      originalFilename: image.originalFilename,
      altText: image.altText,
      mimeType: image.mimeType,
      sizeBytes: Number(image.sizeBytes),
      width: image.width === null ? null : Number(image.width),
      height: image.height === null ? null : Number(image.height),
      position: Number(image.position),
      createdAt: image.createdAt,
    });
    readyImagesByGallery.set(image.galleryId, list);
  }

  const ownedImagePairs = new Set(
    ownedImages.map((image) => image.galleryId + ":" + image.id),
  );

  const sanitizedFavorites = input.favorites
    .filter(
      (fav) =>
        (!fav.clientId || fav.clientId === clientId) &&
        ownedGalleryIds.has(fav.galleryId) &&
        ownedImagePairs.has(fav.galleryId + ":" + fav.imageId),
    )
    .map((fav) => ({
      galleryId: fav.galleryId,
      imageId: fav.imageId,
      createdAt: fav.createdAt,
    }));

  const status: "active" | "suspended" = input.account.disabledAt
    ? "suspended"
    : input.account.status === "suspended"
      ? "suspended"
      : "active";

  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    controller: "Punctum Picture",
    purpose:
      "Portabilidade e acesso aos dados pessoais do titular (LGPD Art. 18)",
    titular: {
      id: clientId,
      name: input.account.name,
      email: input.account.email,
      status,
      disabledAt: input.account.disabledAt ?? null,
      createdAt: input.account.createdAt,
      updatedAt: input.account.updatedAt,
    },
    galleries: ownedGalleries.map((gallery) => ({
      id: gallery.id,
      title: gallery.title,
      introduction: gallery.introduction ?? "",
      status: gallery.status,
      theme: gallery.theme,
      allowDownloads: Boolean(gallery.allowDownloads),
      publishedAt: gallery.publishedAt ?? null,
      createdAt: gallery.createdAt,
      updatedAt: gallery.updatedAt,
      images: readyImagesByGallery.get(gallery.id) ?? [],
    })),
    favorites: sanitizedFavorites,
    retainedImageMetadata,
  };
}

export async function loadSanitizedTitularExport(
  db: D1Database,
  clientId: string,
): Promise<SanitizedTitularExport> {
  // One D1 transaction gives account, galleries, photo metadata and favorites
  // the same snapshot, instead of four independently changing read windows.
  const results = await db.batch([
    db.prepare(
      `SELECT id,name,email,disabled_at AS disabledAt,
        created_at AS createdAt,updated_at AS updatedAt
       FROM client_accounts WHERE id = ?`,
    ).bind(clientId),
    db.prepare(
      `SELECT id,client_id AS clientId,title,introduction,status,theme,
        allow_downloads AS allowDownloads,published_at AS publishedAt,
        created_at AS createdAt,updated_at AS updatedAt
       FROM client_galleries WHERE client_id = ?
       ORDER BY created_at DESC,id`,
    ).bind(clientId),
    db.prepare(
      `SELECT i.id,i.gallery_id AS galleryId,
        i.original_filename AS originalFilename,i.alt_text AS altText,
        i.mime_type AS mimeType,i.size_bytes AS sizeBytes,
        i.width,i.height,i.position,i.status,
        i.created_at AS createdAt,i.deleted_at AS deletedAt
       FROM client_gallery_images i
       INNER JOIN client_galleries g ON g.id = i.gallery_id
       WHERE g.client_id = ?
       ORDER BY i.position ASC,i.created_at ASC,i.id ASC`,
    ).bind(clientId),
    db.prepare(
      `SELECT f.client_id AS clientId,f.gallery_id AS galleryId,
        f.image_id AS imageId,f.created_at AS createdAt
       FROM client_gallery_favorites f
       WHERE f.client_id = ?
       ORDER BY f.created_at ASC,f.image_id ASC`,
    ).bind(clientId),
  ]);

  if (results.length !== 4 || results.some((entry) => !entry.success || !Array.isArray(entry.results))) {
    throw new AppError(503, "LGPD_EXPORT_UNAVAILABLE", "Exportação temporariamente indisponível.");
  }

  const account = (results[0].results[0] ?? null) as RawTitularAccountRow | null;
  if (!account) {
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  }

  return buildSanitizedTitularExport({
    account,
    galleries: results[1].results as RawTitularGalleryRow[],
    images: results[2].results as RawTitularImageRow[],
    favorites: results[3].results as RawTitularFavoriteRow[],
  });
}
