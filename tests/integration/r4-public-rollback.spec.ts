import {env,exports} from 'cloudflare:workers';
import {beforeAll,describe,expect,it} from 'vitest';
import {
  bootstrapPrivateDb,seedClient,seedGallery,seedReadyImage,privateRequest
} from './client-fixture';
import {handlePrivateGalleryRoutes} from '../../worker/client/router';
import type {SiteConfig} from '../../shared/config';

const PNG=Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=='),
  c=>c.charCodeAt(0)
);
const jsonRequest=(path:string,method:string,body:unknown)=>
  privateRequest(path,method,body);
type Studio={
  siteConfig:SiteConfig,revision:number,hasUnpublishedChanges:boolean,
  history:Array<{id:string,isCurrent:boolean,restoredFromVersionId?:string}>
};
const studio=async():Promise<Studio>=>{
  const response=await exports.default.fetch('http://localhost:8787/admin/api/studio');
  expect(response.status).toBe(200);
  return response.json() as Promise<Studio>;
};
const publicConfig=async():Promise<SiteConfig>=>{
  const response=await exports.default.fetch('http://localhost:8787/api/public/site');
  expect(response.status).toBe(200);
  const body=await response.json() as {siteConfig:SiteConfig};
  return body.siteConfig;
};
const digest=async(bytes:Uint8Array)=>{
  const buffer=new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
};

describe('R4 rollback de Studio, Colagem e isolamento de dados privados (somente Miniflare)',()=>{
  beforeAll(bootstrapPrivateDb);
  it('reverte duas publicações sem alterar R2, D1 privado ou expor imagens',async()=>{
    const owner=await seedClient();
    const gallery=await seedGallery(owner,'draft');
    const image=await seedReadyImage(gallery);
    const key=(await env.DB.prepare('SELECT storage_key AS key FROM client_gallery_images WHERE id=?')
      .bind(image).first<{key:string}>())!.key;
    await env.ORIGINALS.put(key,PNG,{httpMetadata:{contentType:'image/png'}});
    const originalHash=await digest(PNG);
    const privateRowBefore=await env.DB.prepare(
      'SELECT id,gallery_id AS galleryId,status,storage_key AS storageKey FROM client_gallery_images WHERE id=?'
    ).bind(image).first();
    const initial=await studio();
    const baseline=await publicConfig();
    const baselineVersion=initial.history.find(x=>x.isCurrent)?.id;
    expect(baselineVersion).toBeTruthy();

    // First make a normal editorial publication. This changes the public state.
    const edited=structuredClone(initial.siteConfig);
    edited.editorial.home.hero.title='Publicação temporária para rollback R4';
    const save=await exports.default.fetch(jsonRequest('/admin/api/studio','PATCH',{
      siteConfig:edited,revision:initial.revision
    }));
    expect(save.status).toBe(200);
    const saved=await save.json() as Studio;
    const publish=await exports.default.fetch(jsonRequest('/admin/api/studio/publish','POST',{
      revision:saved.revision
    }));
    expect(publish.status).toBe(200);
    const afterPublication=await publicConfig();
    expect(afterPublication.editorial.home.hero.title).toBe(edited.editorial.home.hero.title);

    // Preserve an unpublished private Studio draft during a visual-only release.
    const draft=await studio();
    const pending=structuredClone(draft.siteConfig);
    pending.editorial.home.hero.title='DRAFT R4 MUST NEVER LEAK';
    const savePending=await exports.default.fetch(jsonRequest('/admin/api/studio','PATCH',{
      siteConfig:pending,revision:draft.revision
    }));
    expect(savePending.status).toBe(200);
    const pendingState=await savePending.json() as Studio;
    const versionBeforeVisual=pendingState.history.find(x=>x.isCurrent)?.id;
    const collage=await exports.default.fetch(jsonRequest('/admin/api/studio/publish-visual','POST',{
      presetId:'colagem-autoral',expectedPublishedVersionId:versionBeforeVisual,
      expectedDraftRevision:pendingState.revision
    }));
    expect(collage.status).toBe(200);
    const postVisual=await publicConfig();
    expect(postVisual.identity.sourcePresetId).toBe('colagem-autoral');
    expect(postVisual.editorial.home.hero.title).toBe(edited.editorial.home.hero.title);
    expect(postVisual.editorial.home.hero.title).not.toBe(pending.editorial.home.hero.title);
    const draftAfterVisual=await studio();
    expect(draftAfterVisual.siteConfig).toEqual(pending);
    expect(draftAfterVisual.hasUnpublishedChanges).toBe(true);

    // Restore the exact original publication; never execute destructive reverse migrations.
    const restore=await exports.default.fetch(jsonRequest('/admin/api/studio/restore','POST',{
      revision:draftAfterVisual.revision,versionId:baselineVersion
    }));
    expect(restore.status).toBe(200);
    const afterRestore=await restore.json() as Studio;
    expect(afterRestore.history.find(x=>x.isCurrent)?.restoredFromVersionId)
      .toBe(baselineVersion);
    const restored=await publicConfig();
    expect(restored).toEqual(baseline);
    const preserved=await env.DB.prepare(
      'SELECT id,gallery_id AS galleryId,status,storage_key AS storageKey FROM client_gallery_images WHERE id=?'
    ).bind(image).first();
    expect(preserved).toEqual(privateRowBefore);
    const existingObject=await env.ORIGINALS.get(key);
    expect(existingObject).toBeTruthy();
    expect(await digest(new Uint8Array(await existingObject!.arrayBuffer()))).toBe(originalHash);
    const noPublicImage=await exports.default.fetch('http://localhost:8787/media/'+image+'/thumb');
    expect(noPublicImage.status).toBe(404);
    const disabled={...env,PRIVATE_GALLERIES_ENABLED:'false'} as Env;
    const request=privateRequest('/api/client/galleries/'+gallery);
    const denied=await handlePrivateGalleryRoutes(request,new URL(request.url),disabled);
    expect(denied?.status).toBe(404);
    const mediaRequest=privateRequest('/api/client/galleries/'+gallery+'/images/'+image+'/download');
    const deniedMedia=await handlePrivateGalleryRoutes(mediaRequest,new URL(mediaRequest.url),disabled);
    expect(deniedMedia?.status).toBe(404);
    expect((await deniedMedia?.arrayBuffer())?.byteLength).toBe(0);
  });
});
