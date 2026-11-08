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
  const info = await images.info(metadata);
  const width = info?.width;
  const height = info?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 100000 || height > 100000)
    throw new Error('Invalid raster dimensions');
  const validation = await images.input(decode)
    .transform({width:1,height:1,fit:'scale-down'})
    .output({format:'image/png'});
  const response = await validation.response();
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().startsWith('image/png'))
    throw new Error('Image transformation failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if(bytes.length < 8 || [137,80,78,71,13,10,26,10].some((value,i)=>bytes[i]!==value))
    throw new Error('Image transformer did not produce PNG');
  return {width,height,transformedByteLength:bytes.length};
}
