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

  const readyImagesByGallery = new Map<
    string,
    SanitizedTitularExport["galleries"][number]["images"]
  >();

  for (const image of input.images) {
    if (
      !ownedGalleryIds.has(image.galleryId) ||
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

  const readyImageIds = new Set(
    Array.from(readyImagesByGallery.values()).flatMap((imgs) =>
      imgs.map((img) => img.id),
    ),
  );

  const sanitizedFavorites = input.favorites
    .filter(
      (fav) =>
        (!fav.clientId || fav.clientId === clientId) &&
        ownedGalleryIds.has(fav.galleryId) &&
        readyImageIds.has(fav.imageId),
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
  };
}

export async function loadSanitizedTitularExport(
  db: D1Database,
  clientId: string,
): Promise<SanitizedTitularExport> {
  const account = await db
    .prepare(
      `SELECT
        id,
        name,
        email,
        disabled_at AS disabledAt,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM client_accounts
       WHERE id = ?`,
    )
    .bind(clientId)
    .first<RawTitularAccountRow>();

  if (!account) {
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  }

  const galleriesResult = await db
    .prepare(
      `SELECT
        id,
        client_id AS clientId,
        title,
        introduction,
        status,
        theme,
        allow_downloads AS allowDownloads,
        published_at AS publishedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM client_galleries
       WHERE client_id = ?
       ORDER BY created_at DESC, id`,
    )
    .bind(clientId)
    .all<RawTitularGalleryRow>();

  const imagesResult = await db
    .prepare(
      `SELECT
        i.id,
        i.gallery_id AS galleryId,
        i.original_filename AS originalFilename,
        i.alt_text AS altText,
        i.mime_type AS mimeType,
        i.size_bytes AS sizeBytes,
        i.width,
        i.height,
        i.position,
        i.status,
        i.created_at AS createdAt,
        i.deleted_at AS deletedAt
       FROM client_gallery_images i
       INNER JOIN client_galleries g ON g.id = i.gallery_id
       WHERE g.client_id = ? AND i.deleted_at IS NULL AND i.status = 'ready'
       ORDER BY i.position ASC, i.created_at ASC, i.id ASC`,
    )
    .bind(clientId)
    .all<RawTitularImageRow>();

  const favoritesResult = await db
    .prepare(
      `SELECT
        f.client_id AS clientId,
        f.gallery_id AS galleryId,
        f.image_id AS imageId,
        f.created_at AS createdAt
       FROM client_gallery_favorites f
       WHERE f.client_id = ?
       ORDER BY f.created_at ASC, f.image_id ASC`,
    )
    .bind(clientId)
    .all<RawTitularFavoriteRow>();

  return buildSanitizedTitularExport({
    account,
    galleries: galleriesResult.results ?? [],
    images: imagesResult.results ?? [],
    favorites: favoritesResult.results ?? [],
  });
}
