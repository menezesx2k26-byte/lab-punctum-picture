import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { runIsolatedSharp } from "../punctum-hostinger-node/isolated-sharp.mjs";

const worker=fileURLToPath(new URL("../punctum-hostinger-node/sharp-worker.mjs", import.meta.url));

test("bounded staging pool transforms six images concurrently without changing QA defaults",async()=>{
  const originalPool=process.env.PUNCTUM_HOSTINGER_SHARP_POOL;
  const originalTimeout=process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS;
  try{
    process.env.PUNCTUM_HOSTINGER_SHARP_POOL="3";
    process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS="60000";
    const input=await sharp({
      create:{width:1024,height:768,channels:3,background:"#152030"},
    }).png().toBuffer();
    const options={resize:{width:400,height:300,fit:"cover",position:"attention"},
      format:"jpeg",quality:78};
    const expected=await sharp(input).autoOrient().resize(options.resize)
      .toFormat("jpeg",{quality:78}).toBuffer();
    const results=await Promise.all(Array.from({length:6},
      ()=>runIsolatedSharp(worker,"transform",input,options)));
    for(const data of results)assert.deepEqual(data,expected);
  }finally{
    if(originalPool===undefined)delete process.env.PUNCTUM_HOSTINGER_SHARP_POOL;
    else process.env.PUNCTUM_HOSTINGER_SHARP_POOL=originalPool;
    if(originalTimeout===undefined)delete process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS;
    else process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS=originalTimeout;
  }
});

test("staging image worker rejects malformed bytes and recovers its bounded slots",async()=>{
  const old=process.env.PUNCTUM_HOSTINGER_SHARP_POOL;
  try{
    process.env.PUNCTUM_HOSTINGER_SHARP_POOL="3";
    await assert.rejects(runIsolatedSharp(worker,"info",Buffer.from("not-image")),
      error=>error.code==="INVALID_IMAGE_BYTES");
    const image=await sharp({create:{width:12,height:12,channels:3,background:"black"}}).png().toBuffer();
    const metadata=await runIsolatedSharp(worker,"info",image);
    assert.equal(JSON.parse(metadata.toString()).width,12);
  }finally{
    if(old===undefined)delete process.env.PUNCTUM_HOSTINGER_SHARP_POOL;
    else process.env.PUNCTUM_HOSTINGER_SHARP_POOL=old;
  }
});
