import { describe, expect, it } from "vitest";
import {
  buildSanitizedTitularExport,
  FORBIDDEN_LGPD_EXPORT_KEYS,
} from "../../worker/client/lgpd";

describe("LGPD titular export sanitization", () => {
  it("exports only the target titular personal data and strips credentials, storage keys, secrets and foreign records", () => {
    const rawAccount = {
      id: "client-a",
      name: "Helena Prado",
      email: "helena@example.com",
      status: "active" as const,
      mustChangePassword: 0,
      sessionVersion: 4,
      passwordHash: "pbkdf2-secret-hash",
      passwordSalt: "random-salt-value",
      passwordIterations: 310000,
      disabledAt: null,
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    };

    const rawGalleries = [
      {
        id: "gallery-a",
        clientId: "client-a",
        title: "Ensaio Helena",
        introduction: "Texto de abertura",
        status: "published" as const,
        theme: "ivory" as const,
        allowDownloads: true,
        publishedAt: "2026-10-21T10:00:00.000Z",
        createdAt: "2026-10-20T10:05:00.000Z",
        updatedAt: "2026-10-21T10:00:00.000Z",
      },
      {
        id: "gallery-b-foreign",
        clientId: "client-b",
        title: "Ensaio Outro Cliente",
        introduction: "",
        status: "published" as const,
        theme: "noir" as const,
        allowDownloads: false,
        publishedAt: "2026-10-21T10:00:00.000Z",
        createdAt: "2026-10-20T10:05:00.000Z",
        updatedAt: "2026-10-21T10:00:00.000Z",
      },
    ];

    const rawImages = [
      {
        id: "img-a1",
        galleryId: "gallery-a",
        storageKey: "client-galleries/client-a/gallery-a/img-a1/original.jpg",
        originalFilename: "retrato-01.jpg",
        altText: "Retrato Helena",
        mimeType: "image/jpeg",
        sizeBytes: 204800,
        width: 1600,
        height: 1200,
        position: 1000,
        status: "ready" as const,
        createdAt: "2026-10-20T10:10:00.000Z",
        deletedAt: null,
      },
      {
        id: "img-b1-foreign",
        galleryId: "gallery-b-foreign",
        storageKey: "client-galleries/client-b/gallery-b-foreign/img-b1/original.jpg",
        originalFilename: "outro-cliente.jpg",
        altText: "Outro",
        mimeType: "image/jpeg",
        sizeBytes: 102400,
        width: 1200,
        height: 900,
        position: 1000,
        status: "ready" as const,
        createdAt: "2026-10-20T10:10:00.000Z",
        deletedAt: null,
      },
    ];

    const rawFavorites = [
      {
        galleryId: "gallery-a",
        imageId: "img-a1",
        clientId: "client-a",
        createdAt: "2026-10-22T15:00:00.000Z",
      },
      {
        galleryId: "gallery-b-foreign",
        imageId: "img-b1-foreign",
        clientId: "client-b",
        createdAt: "2026-10-22T15:00:00.000Z",
      },
    ];

    const exported = buildSanitizedTitularExport({
      account: rawAccount,
      galleries: rawGalleries,
      images: rawImages,
      favorites: rawFavorites,
      exportedAt: "2026-10-27T18:00:00.000Z",
    });

    const serialized = JSON.stringify(exported);
    for (const key of FORBIDDEN_LGPD_EXPORT_KEYS) {
      expect(serialized).not.toContain(key);
    }
    expect(serialized).not.toContain("pbkdf2-secret-hash");
    expect(serialized).not.toContain("random-salt-value");
    expect(serialized).not.toContain("310000");
    expect(serialized).not.toContain("client-galleries/");
    expect(serialized).not.toContain("client-b");
    expect(serialized).not.toContain("gallery-b-foreign");
    expect(serialized).not.toContain("img-b1-foreign");

    expect(exported.schemaVersion).toBe(1);
    expect(exported.titular).toEqual({
      id: "client-a",
      name: "Helena Prado",
      email: "helena@example.com",
      status: "active",
      disabledAt: null,
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-27T12:00:00.000Z",
    });
    expect(exported.galleries).toHaveLength(1);
    expect(exported.galleries[0].id).toBe("gallery-a");
    expect(exported.galleries[0].images).toHaveLength(1);
    expect(exported.galleries[0].images[0].id).toBe("img-a1");
    expect(exported.favorites).toEqual([
      {
        galleryId: "gallery-a",
        imageId: "img-a1",
        createdAt: "2026-10-22T15:00:00.000Z",
      },
    ]);
  });
  it("exports metadata for every retained image state, including logical deletions, without R2 keys or other clients", () => {
    const account = {
      id: "owner-a", name: "Client A", email: "a@example.test",
      disabledAt: null, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z",
    };
    const gallery = {
      id: "owned", clientId: "owner-a", title: "Private",
      introduction: "", status: "draft" as const, theme: "ivory" as const,
      allowDownloads: 0, publishedAt: null,
      createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z",
    };
    const image = (id: string, status: "pending" | "ready" | "failed", deletedAt: string | null, galleryId = "owned") => ({
      id, galleryId, originalFilename: id + "-private-name.jpg",
      altText: id + "-private-description", mimeType: "image/jpeg", sizeBytes: 11,
      width: null, height: null, position: 1, status, deletedAt,
      createdAt: "2026-10-20T00:00:00Z", storageKey: "private-secret-" + id,
      passwordHash: "must-never-export",
    });
    const exported = buildSanitizedTitularExport({
      account,
      galleries: [gallery, { ...gallery, id: "foreign", clientId: "owner-b" }],
      images: [
        image("ready", "ready", null),
        image("pending", "pending", null),
        image("failed", "failed", null),
        image("deleted", "ready", "2026-10-22T00:00:00Z"),
        image("foreign", "ready", null, "foreign"),
      ],
      favorites: [
        { galleryId: "owned", imageId: "ready", clientId: "owner-a", createdAt: "2026-10-23T00:00:00Z" },
        { galleryId: "owned", imageId: "pending", clientId: "owner-a", createdAt: "2026-10-23T00:00:00Z" },
        { galleryId: "foreign", imageId: "foreign", clientId: "owner-b", createdAt: "2026-10-23T00:00:00Z" },
      ],
      exportedAt: "2026-10-28T12:00:00Z",
    });
    // The public-gallery presentation still includes only ready, non-deleted photos.
    expect(exported.galleries[0].images.map((i) => i.id)).toEqual(["ready"]);
    const retained = (exported as unknown as { retainedImageMetadata: Array<{
      id: string; status: string; deletedAt: string | null;
    }> }).retainedImageMetadata;
    expect(retained.map((i) => [i.id, i.status, i.deletedAt])).toEqual([
      ["ready", "ready", null], ["pending", "pending", null],
      ["failed", "failed", null], ["deleted", "ready", "2026-10-22T00:00:00Z"],
    ]);
    expect(exported.favorites.map((f) => f.imageId)).toEqual(["ready", "pending"]);
    const text = JSON.stringify(exported);
    for (const forbidden of ["private-secret", "passwordHash", "must-never-export", "owner-b", "foreign-private-name"]) {
      expect(text).not.toContain(forbidden);
    }
  });

});
