import test from 'node:test';
import assert from 'node:assert/strict';
import * as runtime from './r4-access-runtime.mjs';

test('current-head Access QA deploy preserves the observed historical bindings and legitimate variables without migration or new image entitlement',()=>{
 const settings={bindings:[{type:'d1',name:'DB',id:'b5087ae7-8c28-40eb-b541-8a58755131d3'},{type:'r2_bucket',name:'ORIGINALS',bucket_name:'punctum-picture-albums-qa-restored'},{type:'r2_bucket',name:'BACKUPS',bucket_name:'punctum-picture-albums-qa-backups'},{type:'images',name:'IMAGES'},{type:'plain_text',name:'CLIENT_AUTH_MODE',text:'access'},{type:'plain_text',name:'PRIVATE_GALLERIES_ENABLED',text:'true'},{type:'plain_text',name:'ADMIN_ALLOWED_EMAILS',text:'existing-qa@example.invalid'},{type:'plain_text',name:'CLIENT_ACCESS_TEAM_DOMAIN',text:'shiny-violet-50ae.cloudflareaccess.com'},{type:'plain_text',name:'CLIENT_ACCESS_AUD',text:'e97a5fc50e1fa426f2bf06af68905b76871a598ab1201dd14c0441c11b8e919c'},{type:'secret_text',name:'CLIENT_SESSION_SECRET'}]};
 settings.bindings.push({type:'plain_text',name:'ENVIRONMENT',text:'preview'},{type:'plain_text',name:'SITE_ORIGIN',text:'https://punctum-picture-albums-qa.menezesx2k26.workers.dev'});
 const base={main:'index.js',assets:{directory:'../client',binding:'ASSETS'},vars:{ADMIN_ALLOWED_EMAILS:'wrong'},routes:[{pattern:'production.invalid'}],services:[{binding:'PASSWORD_BRIDGE'}],triggers:{crons:['* * * * *']}};
 const result=runtime.accessRuntimeConfig(base,settings,'a'.repeat(40));
 assert.equal(result.name,'punctum-picture-albums-qa');
 assert.equal(result.vars.ADMIN_ALLOWED_EMAILS,'existing-qa@example.invalid');
 assert.equal(result.vars.CLIENT_SESSION_SECRET,undefined);
 assert.equal(result.d1_databases[0].database_id,settings.bindings[0].id);
 assert.deepEqual(result.routes,[]);assert.deepEqual(result.triggers.crons,[]);
 assert.equal(result.services,undefined);assert.equal(result.limits,undefined);
 for(const change of [b=>b[0].id='22697f13-7484-41e3-9441-f7b902c6577a',b=>b[1].bucket_name='production',b=>b.splice(3,1),b=>b[4].text='password']) {
   const invalid=structuredClone(settings);change(invalid.bindings);
   assert.throws(()=>runtime.accessRuntimeConfig(base,invalid,'a'.repeat(40)));
 }
 for(const [name,text] of [['ENVIRONMENT','production'],['SITE_ORIGIN','https://punctumpicture.com'],['PUBLIC_SITE_URL','https://punctumpicture.com']]) {
   const invalid=structuredClone(settings);invalid.bindings=invalid.bindings.filter(b=>b.name!==name);invalid.bindings.push({type:'plain_text',name,text});
   assert.throws(()=>runtime.accessRuntimeConfig(base,invalid,'a'.repeat(40)));
 }
});
