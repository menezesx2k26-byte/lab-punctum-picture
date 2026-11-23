export const PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS = Object.freeze([
  280,
  300,
  360,
  600,
  720,
  800,
  900,
  1024,
  1254,
  1440,
  1600,
  1800,
]);

export function buildAllowedImageWidths(deviceSizes, imageSizes) {
  return Array.from(
    new Set([
      ...deviceSizes,
      ...imageSizes,
      ...PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS,
    ]),
  );
}
