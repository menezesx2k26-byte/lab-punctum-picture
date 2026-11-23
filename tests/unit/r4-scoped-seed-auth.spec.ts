import { describe, expect, it } from "vitest";
import { handleQaRecovery } from "../../scripts/private-recovery-worker";
import { seedScopedFixture } from "../../scripts/lib/r4-scoped-seed";
import { createScopedFixtureReceipt } from "../../scripts/lib/r4-scoped-fixture.mjs";

const origin="https://punctum-picture-r4-qa-20261028.example.workers.dev";
const secret="test-only-32-byte-bearer-secret-00001";
const env={
  ENVIRONMENT:"preview",QA_RECOVERY_ENABLED:"true",QA_RECOVERY_ALLOCATION:"r4-20261028",
  QA_RECOVERY_SEED_MODE:"true",SITE_ORIGIN:origin,QA_RECOVERY_SECRET:secret,
  QA_RECOVERY_CLIENT_IDS:"11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222",
  // No DB or bucket fakes: all rejected calls must fail BEFORE touching bindings.
} as unknown as Parameters<typeof handleQaRecovery>[1];
const request=(path:string,authorization:string|null,method="POST",atOrigin=origin)=>
  new Request(origin+path,{method,headers:{
    Origin:atOrigin,...(authorization?{Authorization:authorization}:{})
  }});

describe("standalone G18 synthetic seeding route authorization",()=>{
  it("rejects absent or wrong bearer without reading any D1/R2 data",async()=>{
    for(const header of [null,"Bearer invalid"]){
      const response=await handleQaRecovery(request("/qa/seed",header),env);
      expect(response.status).toBe(403);
    }
  });
  it("rejects foreign origin, disabled seed mode and unrelated paths",async()=>{
    expect((await handleQaRecovery(request("/qa/seed","Bearer "+secret,"POST","https://punctumpicture.com"),env)).status).toBe(403);
    expect((await handleQaRecovery(request("/qa/seed","Bearer "+secret),{...env,QA_RECOVERY_SEED_MODE:"false"})).status).toBe(404);
    expect((await handleQaRecovery(request("/uploads/intents","Bearer "+secret),env)).status).toBe(404);
  });
  it("inspection requires GET; seeding must require POST",async()=>{
    expect((await handleQaRecovery(request("/qa/inspect","Bearer "+secret),env)).status).toBe(405);
    expect((await handleQaRecovery(request("/qa/seed","Bearer "+secret,"GET"),env)).status).toBe(405);
  });
});

it("refuses previously mutated source before any R2 PUT or D1 INSERT (no replay)",async()=>{
  let n=0;
  const receipt=createScopedFixtureReceipt(()=> "00000000-0000-4000-8000-"+(++n).toString(16).padStart(12,"0"));
  const old={clientId:"39a03fb3-d913-4380-a30d-f983fabd22e1",galleryId:"66c091c1-8a4f-47a8-bc57-43cfbebfa0f0",imageId:"e5afb187-6384-4812-b647-eddb430dbe02",intentId:"b7bf8640-b49e-4d34-8092-9cfd3e6314e5"};
  const key="client-galleries/"+old.galleryId+"/legacy-original.png";
  let writes=0;
  const rows:Record<string,unknown>={
    client_accounts:{id:old.clientId},
    client_galleries:{id:old.galleryId,client_id:old.clientId},
    client_gallery_images:{id:old.imageId,gallery_id:old.galleryId,status:"failed",storage_key:key,size_bytes:79},
    client_gallery_upload_intents:{id:old.intentId,gallery_id:old.galleryId,image_id:old.imageId,status:"failed",storage_key:key}
  };
  const fakeDb=(source:boolean)=>({
    prepare:(sql:string)=>({
      bind:()=>({
        first:async()=>{
          const table=sql.match(/FROM (client_[a-z_]+)/)?.[1]??"";
          return sql.startsWith("SELECT *")?rows[table]:{n:0};
        }
      }),
      first:async()=>{
        const table=sql.match(/FROM (client_[a-z_]+)/)?.[1]??"";
        if(sql.startsWith("SELECT COUNT(*)"))return {n:source?(table==="client_accounts"?2:table==="client_gallery_favorites"?0:1):0};
        if(sql.startsWith("SELECT *"))return rows[table];
        throw Error("Unexpected inspection query");
      }
    }),
    batch:()=>{writes++;throw Error("No SQL batch permitted");}
  });
  const bucket=(source:boolean)=>({
    get:async()=>source?{arrayBuffer:async()=>new Uint8Array(79).buffer}:null,
    list:async()=>({objects:source?[{key}]:[],truncated:false}),
    put:()=>{writes++;throw Error("No PUT permitted");},
    head:()=>{writes++;throw Error("No HEAD on invalid fixture");}
  });
  const fakeEnv={
    SOURCE_DB:fakeDb(true),RESTORE_DB:fakeDb(false),
    SOURCE_ORIGINALS:bucket(true),RESTORE_ORIGINALS:bucket(false),BACKUPS:bucket(false),
    QA_RECOVERY_CLIENT_IDS:receipt.clients.map(c=>c.id).join(",")
  };
  await expect(seedScopedFixture(fakeEnv as never,receipt)).rejects.toThrow("QA_SEED_SCOPE_NOT_VACANT");
  expect(writes).toBe(0);
});
