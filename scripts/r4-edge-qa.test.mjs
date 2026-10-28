import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFreshQaBudget, isolatedQaConfig, R4_QA } from './lib/r4-edge-qa.mjs';
const budget = { databaseCount:8, workerRequestsToday:10, r2:{ maximumStorageBytes:1_000, classARequests:10, classBRequests:100 }, subscriptions:[{id:'free'},{id:'teams_free'},{id:'r2_paid'}], namesInUse:[] };
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
