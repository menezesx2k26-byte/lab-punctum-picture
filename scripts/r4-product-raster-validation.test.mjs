import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGalleryRaster,isGalleryRasterTransientError} from '../worker/client/gallery-raster.mjs';

const PNG=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
const stream=()=>new Response(PNG).body;
const validImages=()=>({
  async info(source) {
    assert.ok(source instanceof ReadableStream);
    assert.deepEqual(new Uint8Array(await new Response(source).arrayBuffer()),PNG);
    return {width:2,height:2};
  },
  input(source) {
    assert.ok(source instanceof ReadableStream);
    return {transform(options){
      assert.deepEqual(options,{width:1,height:1,fit:'scale-down'});
      return {output(options){
        assert.deepEqual(options,{format:'image/png'});
        return {response:async()=>new Response(source,{status:200,headers:{'Content-Type':'image/png'}})};
      }};
    }};
  }
});

test('product raster validator uses two independent stream branches and verifies transformed image',async()=>{
  const result=await validateGalleryRaster(validImages(),stream());
  assert.deepEqual(result,{width:2,height:2,transformedByteLength:PNG.byteLength});
});

test('rejects unsupported info without trying to store an image',async()=>{
  for(const info of [null,{}, {width:0,height:2},{width:2,height:NaN},{width:2.5,height:2},{width:-1,height:2},
    {width:12001,height:1},{width:10001,height:10000}]){
    const images=validImages();
    images.info=async()=>info;
    await assert.rejects(()=>validateGalleryRaster(images,stream()));
  }
});

test('rejects failed or non-PNG image transformation, not just successful decoding metadata',async()=>{
  for(const transformed of [
    new Response(PNG,{status:500,headers:{'Content-Type':'image/png'}}),
    new Response(new Uint8Array([0,1,2]),{headers:{'Content-Type':'image/png'}}),
    new Response(PNG,{headers:{'Content-Type':'text/html'}})
  ]){
    const images=validImages();
    images.input=()=>({transform:()=>({output:()=>({response:async()=>transformed})})});
    await assert.rejects(()=>validateGalleryRaster(images,stream()));
  }
});

test('distinguishes transient Images errors from invalid raster content for safe retry',async()=>{
  const temporary=validImages();
  temporary.input=()=>({transform:()=>({output:()=>({response:async()=>new Response('unavailable',{status:503})})})});
  await assert.rejects(()=>validateGalleryRaster(temporary,stream()),error=>isGalleryRasterTransientError(error));
  const invalid=validImages();
  invalid.info=async()=>({width:12001,height:1});
  await assert.rejects(()=>validateGalleryRaster(invalid,stream()),error=>!isGalleryRasterTransientError(error));
  const transport=validImages();
  transport.info=async()=>{throw new Error('binding temporarily unreachable')};
  await assert.rejects(()=>validateGalleryRaster(transport,stream()),error=>isGalleryRasterTransientError(error));
});
