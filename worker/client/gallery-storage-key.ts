// R2 paths are not authority: derive the only admissible original key from
// the owning gallery, immutable image identity and the persisted MIME.
export function privateGalleryStorageKey(
  galleryId: string,
  imageId: string,
  mimeType: string,
): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(galleryId) ||
      !/^[A-Za-z0-9_-]+$/.test(imageId)) return null;
  const extension = mimeType === "image/png" ? "png" :
    mimeType === "image/webp" ? "webp" :
    mimeType === "image/jpeg" ? "jpg" : null;
  return extension ? `client-galleries/${galleryId}/${imageId}.${extension}` : null;
}
