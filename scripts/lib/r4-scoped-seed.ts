import { validateScopedFixtureReceipt, R4_SCOPED_PNG_BYTES } from "./r4-scoped-fixture.mjs";
import { R4_FAILED_OWNER } from "./r4-recovery-qa.mjs";

/** Privileged standalone QA seed/inspection. Not imported by product worker. */
type ScopedEnv = {
  SOURCE_DB: D1Database; RESTORE_DB: D1Database;
  SOURCE_ORIGINALS: R2Bucket; RESTORE_ORIGINALS: R2Bucket; BACKUPS: R2Bucket;
  QA_RECOVERY_CLIENT_IDS?: string;
};
const tables = [
  "client_accounts", "client_galleries", "client_gallery_images",
  "client_gallery_upload_intents", "client_gallery_favorites",
] as const;
type Table = (typeof tables)[number];
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
async function sha(bytes: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
  return Array.from(hash, v => v.toString(16).padStart(2, "0")).join("");
}
async function counts(db: D1Database) {
  return Object.fromEntries(await Promise.all(tables.map(async table =>
    [table, Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{n:number}>())?.n ?? -1)]
  ))) as Record<Table,number>;
}
async function objectCount(bucket:R2Bucket) {
  const listing = await bucket.list({limit:100});
  if (listing.truncated) throw Error("QA_R2_LIST_TRUNCATED");
  return { count:listing.objects.length, keys:listing.objects.map(o=>o.key) };
}
export async function inspectScopedFixture(env: ScopedEnv) {
  const ids = R4_FAILED_OWNER;
  // Full, column-complete source hashes—not merely row counts or selected fields.
  const specs: [Table,string][]=[
    ["client_accounts",ids.clientId],["client_galleries",ids.galleryId],
    ["client_gallery_images",ids.imageId],["client_gallery_upload_intents",ids.intentId]
  ];
  const oldRows:Record<string,Record<string,unknown>>={};
  for(const [table,id] of specs) {
    const row=await env.SOURCE_DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Record<string,unknown>>();
    if(!row)throw Error("QA_LEGACY_ROW_MISSING");
    oldRows[table]=row;
  }
  if(oldRows.client_galleries.client_id!==ids.clientId ||
     oldRows.client_gallery_images.gallery_id!==ids.galleryId ||
     oldRows.client_gallery_upload_intents.gallery_id!==ids.galleryId ||
     oldRows.client_gallery_upload_intents.image_id!==ids.imageId ||
     oldRows.client_gallery_upload_intents.storage_key!==oldRows.client_gallery_images.storage_key ||
     oldRows.client_gallery_images.status!=="failed" ||
     oldRows.client_gallery_upload_intents.status!=="failed") throw Error("QA_LEGACY_CASE_CHANGED");
  const key=String(oldRows.client_gallery_images.storage_key);
  if(!key.startsWith(`client-galleries/${ids.galleryId}/`))throw Error("QA_LEGACY_OBJECT_SCOPE");
  const oldObject=await env.SOURCE_ORIGINALS.get(key);
  if(!oldObject)throw Error("QA_LEGACY_OBJECT_MISSING");
  const oldBytes=new Uint8Array(await oldObject.arrayBuffer());
  if(oldBytes.byteLength!==Number(oldRows.client_gallery_images.size_bytes))throw Error("QA_LEGACY_OBJECT_SIZE_CHANGED");
  const legacyRowsSha256=await sha(new TextEncoder().encode(JSON.stringify(oldRows)));
  const legacyObjectSha256=await sha(oldBytes);
  return {
    legacyRowsSha256,legacyObjectSha256,legacyObjectKey:key,
    legacyObjectBytes:oldBytes.byteLength,
    source:await counts(env.SOURCE_DB),restore:await counts(env.RESTORE_DB),
    sourceObjects:await objectCount(env.SOURCE_ORIGINALS),
    restoredObjects:await objectCount(env.RESTORE_ORIGINALS),
    backupObjects:await objectCount(env.BACKUPS)
  };
}
function assertInitial(state:Awaited<ReturnType<typeof inspectScopedFixture>>) {
  const old={client_accounts:1,client_galleries:1,client_gallery_images:1,client_gallery_upload_intents:1,client_gallery_favorites:0};
  const empty=Object.fromEntries(tables.map(k=>[k,0]));
  if(JSON.stringify(state.source)!==JSON.stringify(old) ||
     JSON.stringify(state.restore)!==JSON.stringify(empty) ||
     state.sourceObjects.count!==1 || state.sourceObjects.keys[0]!==state.legacyObjectKey ||
     state.restoredObjects.count!==0 || state.backupObjects.count!==0)
     throw Error("QA_SEED_SCOPE_NOT_VACANT");
}
export async function seedScopedFixture(env:ScopedEnv, receipt:unknown) {
  validateScopedFixtureReceipt(receipt);
  const fixture=receipt as {
    clients:{id:string;email:string;name:string}[];
    galleries:{id:string;clientId:string;title:string}[];
    images:{id:string;galleryId:string;storageKey:string;position:number;sizeBytes:number}[];
    intents:{id:string;galleryId:string;imageId:string;storageKey:string}[];
    favorites:{clientId:string;galleryId:string;imageId:string}[];
  };
  const authorizedIds=env.QA_RECOVERY_CLIENT_IDS?.split(",")??[];
  if(authorizedIds.length!==2 || authorizedIds.some(id=>!fixture.clients.some(c=>c.id===id)))
    throw Error("QA_SYNTHETIC_IDS_NOT_AUTHORIZED");
  const before=await inspectScopedFixture(env);
  assertInitial(before);
  if(png.length!==R4_SCOPED_PNG_BYTES)throw Error("QA_LITERAL_PNG_LENGTH");
  const now=new Date().toISOString();
  const expectedSha=await sha(png);
  // Before the first write, all 24 identities and every destination key are checked.
  for(const table of tables){
    const rows:Record<string,unknown>[]=table==="client_accounts"?fixture.clients:
      table==="client_galleries"?fixture.galleries:
      table==="client_gallery_images"?fixture.images:
      table==="client_gallery_upload_intents"?fixture.intents:fixture.favorites;
    for(const row of rows){
      if(table==="client_gallery_favorites")continue;
      if(await env.SOURCE_DB.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(row.id).first())
        throw Error("QA_SEED_ID_CONFLICT");
    }
  }
  for(const image of fixture.images) if(await env.SOURCE_ORIGINALS.head(image.storageKey))
    throw Error("QA_SEED_OBJECT_CONFLICT");
  const statements:D1PreparedStatement[]=[];
  const add=(sql:string, values:(string|number|null)[])=>statements.push(env.SOURCE_DB.prepare(sql).bind(...values));
  for(const c of fixture.clients)
    // Access-only QA identity: password challenge is NOT part of G18 and must
    // not block an already signed synthetic session (worker/client/auth.ts).
    add("INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,disabled_at,created_at,updated_at) VALUES(?,?,?,?,?,310000,0,1,NULL,?,?)",
      [c.id,c.name,c.email,"qa-backup-fixture-not-password-auth","qa-synthetic-no-login",now,now]);
  for(const g of fixture.galleries){
    const first=fixture.images.find(i=>i.galleryId===g.id);
    if(!first)throw Error("QA_MISSING_COVER");
    add("INSERT INTO client_galleries(id,client_id,title,introduction,theme,cover_image_id,allow_downloads,status,created_at,updated_at,published_at) VALUES(?,?,?,'','ivory',?,1,'published',?,?,?)",
      [g.id,g.clientId,g.title,first.id,now,now,now]);
  }
  for(const img of fixture.images)
    add("INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,width,height,alt_text,position,status,created_at,updated_at,deleted_at) VALUES(?,?,?,'qa-backup-fixture.png','image/png',79,2,2,'QA only',?,'ready',?,?,NULL)",
      [img.id,img.galleryId,img.storageKey,img.position,now,now]);
  for(const intent of fixture.intents)
    add("INSERT INTO client_gallery_upload_intents(id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,completed_at) VALUES(?,?,?,'image/png',79,?,'completed',?,?,?)",
      [intent.id,intent.galleryId,intent.imageId,intent.storageKey,now,now,now]);
  for(const favorite of fixture.favorites)
    add("INSERT INTO client_gallery_favorites(client_id,gallery_id,image_id,created_at) VALUES(?,?,?,?)",
      [favorite.clientId,favorite.galleryId,favorite.imageId,now]);
  if(statements.length!==26)throw Error("QA_SEED_SQL_COUNT");
  // An ambiguous response is terminal. No retry, delete, overwrite or UPSERT.
  // Objects first: a partial failure leaves explicit evidence, and a fresh seed fails closed.
  for(const image of fixture.images) {
    const written=await env.SOURCE_ORIGINALS.put(image.storageKey,png,{
      onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"image/png"}
    });
    if(!written)throw Error("QA_SEED_CONDITIONAL_PUT_FAILED");
    const current=await env.SOURCE_ORIGINALS.get(image.storageKey);
    if(!current || await sha(new Uint8Array(await current.arrayBuffer()))!==expectedSha)
      throw Error("QA_SEED_OBJECT_VERIFY_FAILED");
  }
  await env.SOURCE_DB.batch(statements);
  const after=await inspectScopedFixture(env);
  if(after.legacyRowsSha256!==before.legacyRowsSha256 ||
     after.legacyObjectSha256!==before.legacyObjectSha256 ||
     after.legacyObjectKey!==before.legacyObjectKey ||
     JSON.stringify(after.source)!==JSON.stringify({client_accounts:3,client_galleries:3,client_gallery_images:11,client_gallery_upload_intents:11,client_gallery_favorites:2}) ||
     after.sourceObjects.count!==11 ||
     after.restore.client_accounts!==0 || after.restoredObjects.count!==0 || after.backupObjects.count!==0)
    throw Error("QA_SEED_POSTCONDITION_FAILED");
  return {stage:"QA_BACKUP_FIXTURE_SEEDED_NOT_UPLOAD_E2E",createdRows:26,createdObjects:10,sha256:expectedSha,before,after};
}
