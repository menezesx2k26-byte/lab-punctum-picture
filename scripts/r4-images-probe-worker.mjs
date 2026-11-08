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
      const info=await env.IMAGES.info(new Response(ORIGINAL).body);
      if(info?.width!==2||info?.height!==2)throw Error("unexpected dimensions");
      const output=await env.IMAGES.input(new Response(ORIGINAL).body)
        .transform({width:1,height:1,fit:"scale-down"})
        .output({format:"image/png"});
      const processed=await output.response();
      const bytes=new Uint8Array(await processed.arrayBuffer());
      if(!processed.ok||bytes.length<4||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)
        throw Error("unexpected transformed raster");
      return Response.json({ok:true,sourceWidth:info.width,sourceHeight:info.height,
        outputFormat:"image/png",transformedByteLength:bytes.length},{headers});
    }catch{
      return Response.json({ok:false,reason:"IMAGES_RUNTIME_UNAVAILABLE"},{status:503,headers});
    }
  }
};
export default worker;
