import {validateGalleryRaster} from "../worker/client/gallery-raster.mjs";
// An isolated synthetic-only Images probe. Never import the Punctum application or D1/R2.
const ORIGINAL=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),c=>c.charCodeAt(0));
const headers={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const worker = {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method!=="GET"||url.pathname!=="/probe"||
       !env?.R4_QA_PROBE_TOKEN||request.headers.get("X-R4-QA-Probe-Token")!==env.R4_QA_PROBE_TOKEN)
      return new Response(null,{status:404,headers});
    if(!env.IMAGES)return Response.json({ok:false,reason:"IMAGES_BINDING_MISSING"},{status:503,headers});
    try{
      const raster=await validateGalleryRaster(env.IMAGES,new Response(ORIGINAL).body);
      if(raster.width!==2||raster.height!==2)throw Error("unexpected dimensions");
      return Response.json({ok:true,sourceWidth:raster.width,sourceHeight:raster.height,
        outputFormat:"image/png",transformedByteLength:raster.transformedByteLength},{headers});
    }catch{
      return Response.json({ok:false,reason:"IMAGES_RUNTIME_UNAVAILABLE"},{status:503,headers});
    }
  }
};
export default worker;
