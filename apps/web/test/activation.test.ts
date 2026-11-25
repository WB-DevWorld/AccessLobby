import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AdminAccess } from '../lib/admin-model';
import { activationContract, parseActivationJob, parseActivationJobs } from '../lib/activation-model';
import { handleActivationAction } from '../lib/activation-action';

const origin='https://accesslobby.example.test';
const id='11111111-1111-4111-8111-111111111111',appId='22222222-2222-4222-8222-222222222222';
const person='33333333-3333-4333-8333-333333333333';
const access:AdminAccess={contract:'accesslobby.admin.v0.1',roles:['application_operator'],capabilities:{read:true,reviewApplications:false,managePeople:false,activateApplications:true}};
const job={id,applicationId:appId,applicationName:'Reviewed app',clientId:'reviewed-app',applicationStatus:'requested',status:'queued',attempt:0,maxAttempts:5,
  configurationHash:'a'.repeat(64),reviewReference:'review-1234',requestedBy:person,createdAt:'2026-11-25T19:00:00.000Z',updatedAt:'2026-11-25T19:00:00.000Z',lastError:null,retryable:false,leaseExpiresAt:null};
const fields={intent:'queue',applicationId:appId,configurationHash:job.configurationHash,reviewReference:job.reviewReference};
const request=(body:URLSearchParams|string=new URLSearchParams(fields),from=origin,type='application/x-www-form-urlencoded')=>new Request(origin+'/admin/activations/action',{method:'POST',headers:{origin:from,'content-type':type},body});
const result=()=>Response.json({contract:activationContract,job},{status:202});
const dependencies=()=>({getAccess:async()=>({state:'ready' as const,access}),api:async()=>result()});

test('activation response parsing is bounded, contract-specific and omits private lease capabilities',()=>{
  const parsed=parseActivationJob({contract:activationContract,job:{...job,lease_token:'private-claim-canary',password:'private-secret'}});
  assert(parsed);assert(!JSON.stringify(parsed).includes('private-'));
  assert.equal(parseActivationJob({contract:'wrong',job}),null);
  assert.equal(parseActivationJob({contract:activationContract,job:{...job,status:'active'}}),null);
  assert.equal(parseActivationJob({contract:activationContract,job:{...job,attempt:6}}),null);
  assert.equal(parseActivationJobs({contract:activationContract,jobs:Array(26).fill(job),nextCursor:null}),null);
  assert.equal(parseActivationJobs({contract:activationContract,jobs:[job],nextCursor:'../../outside'}),null);
  assert.equal(parseActivationJobs({contract:activationContract,jobs:[job],nextCursor:null})?.jobs.length,1);
});

test('activation actions reject cross-origin and non-operator authority before reading or writing',async()=>{
  let reads=0,writes=0;
  const deps={getAccess:async()=>{reads++;return{state:'ready' as const,access};},api:async()=>{writes++;return result();}};
  assert.equal((await handleActivationAction(request(undefined,'https://unrelated.example'),origin,deps)).status,403);
  assert.equal(reads,0);assert.equal(writes,0);
  const reader:AdminAccess={...access,roles:['support_reader'],capabilities:{...access.capabilities,activateApplications:false}};
  assert.equal((await handleActivationAction(request(),origin,{...deps,getAccess:async()=>({state:'ready',access:reader})})).status,403);
  assert.equal(writes,0);
  assert.equal((await handleActivationAction(request(),origin,{...deps,getAccess:async()=>({state:'forbidden'})})).status,403);
  const signedOut=await handleActivationAction(request(),origin,{...deps,getAccess:async()=>({state:'signed-out'})});
  assert.equal(signedOut.headers.get('location'),origin+'/auth/login');
});

test('activation forms reject duplicates, claimed credentials/roles/return paths and oversized bodies',async()=>{
  let writes=0;const deps={...dependencies(),api:async()=>{writes++;return result();}};
  const duplicate=new URLSearchParams(fields);duplicate.append('applicationId',appId);
  for(const body of [duplicate,new URLSearchParams({...fields,role:'application_operator'}),new URLSearchParams({...fields,token:'credential'}),
    new URLSearchParams({...fields,returnTo:'https://unrelated.example'}),new URLSearchParams({...fields,applicationId:'../../admin'}),
    new URLSearchParams({...fields,reviewReference:'unsafe\nreference'}),'x'.repeat(4097)]){
    assert.equal((await handleActivationAction(request(body),origin,deps)).status,400);
  }
  assert.equal((await handleActivationAction(request(JSON.stringify(fields),origin,'application/json'),origin,deps)).status,400);
  assert.equal(writes,0);
});

test('native queue actions accept async202 and redirect only to the validated matching job',async()=>{
  const calls:unknown[]=[];
  const response=await handleActivationAction(request(),origin,{...dependencies(),api:async(path,init)=>{calls.push({path,...init});return result();}});
  assert.deepEqual(calls,[{path:`/v1/admin/applications/${appId}/activation-jobs`,method:'POST',body:{configurationHash:job.configurationHash,reviewReference:'review-1234'}}]);
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+`/admin/activations/${id}?notice=queued`);
  assert.match(response.headers.get('cache-control')!,/no-store/);
  const wrong=await handleActivationAction(request(),origin,{...dependencies(),api:async()=>Response.json({contract:activationContract,job:{...job,applicationId:person}},{status:202})});
  assert.equal(wrong.headers.get('location'),origin+`/admin/applications/${appId}?notice=unavailable`);
});

test('idempotent queue responses never relabel existing running or failed work as newly queued',async()=>{
  for(const status of ['running','failed']){
    const existing={...job,status,attempt:1,lastError:status==='failed'?'activation_iam_configuration_mismatch':null,
      leaseExpiresAt:status==='running'?'2026-11-25T19:05:00.000Z':null};
    const response=await handleActivationAction(request(),origin,{...dependencies(),api:async()=>Response.json({contract:activationContract,job:existing},{status:202})});
    assert.equal(response.headers.get('location'),origin+`/admin/activations/${id}?notice=existing`);
  }
});

test('retry actions pin current attempt and reject stale or forged job destinations',async()=>{
  const retry={intent:'retry',jobId:id,expectedAttempt:'1'};
  const calls:unknown[]=[];
  const response=await handleActivationAction(request(new URLSearchParams(retry)),origin,{...dependencies(),api:async(path,init)=>{calls.push({path,...init});return result();}});
  assert.deepEqual(calls,[{path:`/v1/admin/activation-jobs/${id}/retry`,method:'POST',body:{expectedAttempt:1}}]);
  assert.equal(response.headers.get('location'),origin+`/admin/activations/${id}?notice=retried`);
  for(const expectedAttempt of ['0','6','-1','1.2','x'])assert.equal((await handleActivationAction(request(new URLSearchParams({...retry,expectedAttempt})),origin,dependencies())).status,400);
  const stale=await handleActivationAction(request(new URLSearchParams(retry)),origin,{...dependencies(),api:async()=>Response.json({error:'activation_attempt_changed'},{status:409})});
  assert.equal(stale.headers.get('location'),origin+`/admin/activations/${id}?notice=activation_attempt_changed`);
});

test('uncertain activation and revoked permissions cannot produce a success notice or leak private errors',async()=>{
  const uncertain=await handleActivationAction(request(),origin,{...dependencies(),api:async()=>{throw new Error('sensitive-private-secret');}});
  assert.equal(uncertain.headers.get('location'),origin+`/admin/applications/${appId}?notice=unavailable`);
  assert(!JSON.stringify([...uncertain.headers]).includes('sensitive-private-secret'));
  const revoked=await handleActivationAction(request(),origin,{...dependencies(),api:async()=>Response.json({error:'activation_requester_unavailable'},{status:403})});
  assert.equal(revoked.status,403);assert(!revoked.headers.has('location'));
  const unavailable=await handleActivationAction(request(),origin,{...dependencies(),getAccess:async()=>({state:'unavailable'})});
  assert.equal(unavailable.status,503);
});
