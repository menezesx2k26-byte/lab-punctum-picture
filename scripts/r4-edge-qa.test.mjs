import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as qa from './lib/r4-edge-qa.mjs';
import { assertFreshQaBudget, assertFreshPerformanceBudget, isolatedQaConfig, R4_QA, assertResumeQaInventory, summarizeQaSamples } from './lib/r4-edge-qa.mjs';
const budget = { databaseCount:8, workerRequestsToday:10, r2:{ maximumStorageBytes:1_000, classARequests:10, classBRequests:100 }, subscriptions:[{id:'free'},{id:'teams_free'},{id:'r2_paid'}], namesInUse:[] };

test('read-only performance continuation accepts only the exact preserved failed fixture and initialized public state',()=>{
 const counts={accounts:1,galleries:1,images:1,intents:1,favorites:0,pointers:1};
 const rows=[{clientId:'39a03fb3-d913-4380-a30d-f983fabd22e1',galleryId:'66c091c1-8a4f-47a8-bc57-43cfbebfa0f0',imageId:'e5afb187-6384-4812-b647-eddb430dbe02',intentId:'b7bf8640-b49e-4d34-8092-9cfd3e6314e5',imageStatus:'failed',intentStatus:'failed'}];
 assert.equal(qa.assertReadOnlyPerformanceFixture({counts,rows}),true);
 for(const input of [{counts:{...counts,accounts:5},rows},{counts:{...counts,pointers:0},rows},{counts,rows:[{...rows[0],clientId:'foreign'}]},{counts,rows:[{...rows[0],imageStatus:'ready'}]},{counts,rows:[]}]) assert.throws(()=>qa.assertReadOnlyPerformanceFixture(input));
});
test('refuses unknown usage and existing QA resources before creating or modifying anything', () => {
 for (const input of [undefined, {...budget,r2:undefined}, {...budget,databaseCount:9}, {...budget,workerRequestsToday:99_000}, {...budget,namesInUse:[R4_QA.source]}, {...budget,subscriptions:[{id:'workers_paid'}]}, {...budget,r2:{...budget.r2,maximumStorageBytes:10_000_000_000}}]) assert.throws(()=>assertFreshQaBudget(input));
 assert.equal(assertFreshQaBudget(budget),true);
});
test('permits only newly allocated D1 IDs and strips production routes, jobs, access, secrets, external bridge and image billing', () => {
 const sourceId='11111111-1111-4111-8111-111111111111';
 const input={main:'index.js',compatibility_date:'2026-05-22',vars:{ADMIN_SESSION_SECRET:'forbidden',CLIENT_ACCESS_AUD:'production-aud',CLIENT_PASSWORD_BACKEND:'external',PRIVATE_GALLERIES_ENABLED:'false'},services:[{binding:'FORBIDDEN'}],images:{binding:'IMAGES'},routes:[{pattern:'punctumpicture.com'}],triggers:{crons:['0 * * * *']},assets:{directory:'../client',binding:'ASSETS'}};
 const origin=`https://${R4_QA.worker}.owner.workers.dev`;
 const result=isolatedQaConfig(input,{databaseId:sourceId,createdDatabaseIds:[sourceId],origin});
 assert.equal(result.name,R4_QA.worker);assert.deepEqual(result.routes,[]);assert.deepEqual(result.triggers.crons,[]);
 assert.equal(result.vars.CLIENT_AUTH_MODE,'access');assert.equal(result.vars.PRIVATE_GALLERIES_ENABLED,'true');
 assert.equal(result.vars.CLIENT_ACCESS_AUD,'r4-qa-access-unconfigured');assert.equal(result.vars.ADMIN_SESSION_SECRET,undefined);assert.equal(result.vars.CLIENT_PASSWORD_BACKEND,undefined);assert.equal(result.images,undefined);assert.equal(result.services,undefined);
 for(const databaseId of ['0801d4f1-7c85-4db4-8643-7b7c9e34862c','b5087ae7-8c28-40eb-b541-8a58755131d3','22697f13-7484-41e3-9441-f7b902c6577a','4e959036-a3f0-4faf-bda2-fca9b4c5e984']) assert.throws(()=>isolatedQaConfig(input,{databaseId,createdDatabaseIds:[databaseId],origin}));
 assert.throws(()=>isolatedQaConfig(input,{databaseId:sourceId,createdDatabaseIds:[],origin}));
 assert.throws(()=>isolatedQaConfig(input,{databaseId:sourceId,createdDatabaseIds:[sourceId],origin:'https://punctumpicture.com'}));
});

test('performance-only QA does not require R2 access and never permits an existing or paid target', () => {
 const { r2, ...performanceBudget } = budget; void r2;
 assert.equal(assertFreshPerformanceBudget(performanceBudget), true);
 assert.throws(()=>assertFreshPerformanceBudget({...performanceBudget,databaseCount:10}));
 assert.throws(()=>assertFreshPerformanceBudget({...performanceBudget,namesInUse:[R4_QA.worker]}));
});

test('performance QA has no object bindings or private routes even if private flag requested',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const config=isolatedQaConfig({main:'index.js',vars:{}},{databaseId:id,createdDatabaseIds:[id],origin:`https://${R4_QA.worker}.owner.workers.dev`,performanceOnly:true});
 assert.equal(config.vars.PRIVATE_GALLERIES_ENABLED,'false');assert.deepEqual(config.r2_buckets,[]);
});

test('network failures remain errors without falsely claiming that another version answered', () => {
 const version='qa-version';
 assert.deepEqual(summarizeQaSamples([{status:200,actualVersionId:version},{status:'NETWORK_ERROR'}],version),{errors:1,versionMismatches:0});
 assert.deepEqual(summarizeQaSamples([{status:200,actualVersionId:null},{status:200,actualVersionId:'other'}],version),{errors:0,versionMismatches:2});
 assert.deepEqual(summarizeQaSamples([{status:503,actualVersionId:'other'}],version),{errors:1,versionMismatches:1});
});

test('resume accepts only the exact dedicated resource IDs from interrupted run 40756797747', () => {
 const databases=[{name:R4_QA.source,uuid:'2e7710f3-dc92-4aeb-976a-5f15d8c5262c'},{name:R4_QA.restore,uuid:'0141b8f9-3074-4aa4-a184-92a4f7379ecc'}];
 const buckets=[R4_QA.originals,R4_QA.restored,R4_QA.backups].map(name=>({name}));
 const workers=[{name:R4_QA.worker}];
 assert.equal(assertResumeQaInventory({databases,buckets,workers}),true);
 assert.throws(()=>assertResumeQaInventory({databases:[{...databases[0],uuid:'0801d4f1-7c85-4db4-8643-7b7c9e34862c'},databases[1]],buckets,workers}));
 assert.throws(()=>assertResumeQaInventory({databases,buckets:[],workers}));
 assert.throws(()=>assertResumeQaInventory({databases,buckets,workers:[]}));
});
