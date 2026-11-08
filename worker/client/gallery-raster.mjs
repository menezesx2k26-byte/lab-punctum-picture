export class GalleryRasterTransientError extends Error {
  constructor(cause) {
    super('Image validation service temporarily unavailable', {cause});
    this.name = 'GalleryRasterTransientError';
  }
}

export const isGalleryRasterTransientError = error => error instanceof GalleryRasterTransientError;

/**
 * Same raster decode/transform contract in the private product completion route
 * and the ephemeral Cloudflare Images QA Worker. No D1, R2, auth or external URL.
 *
 * @param {ImagesBinding} images
 * @param {ReadableStream<Uint8Array>} input
 * @returns {Promise<{width:number,height:number,transformedByteLength:number}>}
 */
export async function validateGalleryRaster(images,input) {
  if (!images || !input || typeof input.tee !== 'function')
    throw new Error('Image decoder or raster stream unavailable');
  const [metadata,decode] = input.tee();
  let info;
  try { info = await images.info(metadata); }
  catch (error) {
    // A decoder's explicit invalid-format diagnosis is a permanent rejection.
    // Transport errors and opaque binding failures remain retriable.
    if (/unsupported image format|invalid image data|decode failed|corrupt image|libpng read error|vips2png/i.test(String(error)))
      throw new Error('Invalid raster encoding', {cause:error});
    throw new GalleryRasterTransientError(error);
  }
  const width = info?.width;
  const height = info?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 12000 || height > 12000 ||
      width * height > 100_000_000)
    throw new Error('Invalid raster dimensions');
  let response;
  try {
    const validation = await images.input(decode)
      .transform({width:1,height:1,fit:'scale-down'})
      .output({format:'image/png'});
    response = await validation.response();
  } catch (error) {
    if (/unsupported image format|invalid image data|decode failed|corrupt image|libpng read error|vips2png/i.test(String(error)))
      throw new Error('Invalid raster encoding', {cause:error});
    throw new GalleryRasterTransientError(error);
  }
  if (response.status >= 500)
    throw new GalleryRasterTransientError(new Error(`Images response ${response.status}`));
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().startsWith('image/png'))
    throw new Error('Image transformation failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if(bytes.length < 8 || [137,80,78,71,13,10,26,10].some((value,i)=>bytes[i]!==value))
    throw new Error('Image transformer did not produce PNG');
  return {width,height,transformedByteLength:bytes.length};
}
