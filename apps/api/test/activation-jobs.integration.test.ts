import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationStore } from '../src/applications.js';
import { ApplicationReviewStore } from '../src/application-reviews.js';
import { OperatorStore } from '../src/operators.js';
import { ActivationJobStore, claimActivationJob } from '../src/activation-jobs.js';
import { activationFailure, readActivationToken, runActivationJob } from '../src/activation-worker.js';
import { provisionApp, representation } from '../src/provision-app.js';

const enabled={skip:!process.env.TEST_DATABASE_URL};
async function fixture(){
  const database=await openIsolatedDatabase(),{pool}=database;
  const owner=randomUUID(),reviewer=randomUUID(),operator=randomUUID(),reader=randomUUID();
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'",[[owner,reviewer,operator,reader]]);
  await pool.query(`INSERT INTO platform_operator_roles(person_id,role,grant_reference) VALUES
    ($1,'application_reviewer','activation-reviewer'),($2,'application_operator','activation-operator'),($3,'support_reader','activation-reader')`,[reviewer,operator,reader]);
  let dns=true, mismatch=false, failReadback=false;
  const proofs=new Map<string,string[][]>();
  const lookupTxt=async(host:string)=>dns?(proofs.get(host)??[]):[];
  const apps=new ApplicationStore(pool,[],lookupTxt),operators=new OperatorStore(pool),reviews=new ApplicationReviewStore(pool,operators),jobs=new ActivationJobStore(pool,operators);
  const requested=await apps.request(owner,{clientId:`activation-${randomUUID()}`,name:'Activation fixture',redirectUri:'https://activation.example.test/callback',
    logoutUri:'https://activation.example.test/',visibility:'hidden',admission:'grant_required'});
  proofs.set(requested.originVerificationHost,[[requested.originVerificationValue]]);
  await apps.verifyOrigin(owner,requested.id);
  const detail=await reviews.detail(reviewer,requested.id);
  const reviewReference='activation-independent-review';
  await reviews.record(reviewer,requested.id,{decision:'approved',reference:reviewReference,configurationHash:detail.application.configurationHash});
  const input={configurationHash:detail.application.configurationHash,reviewReference};
  let client:ReturnType<typeof representation>|undefined, creates=0, calls=0;
  const methods:string[]=[];
  const fetcher=(async(url:string|URL|Request,init?:RequestInit)=>{
    calls++;methods.push(init?.method??'GET');assert.equal(init?.redirect,'error');
    const path=String(url);
    if(path.includes('?clientId='))return Response.json(client?[{id:'fixture-client',clientId:client.clientId}]:[]);
    if(init?.method==='POST'){creates++;client=JSON.parse(String(init.body));return new Response(null,{status:201});}
    if(failReadback)throw new Error('sensitive-private-failure-canary');
    if(path.endsWith('/protocol-mappers/models'))return Response.json(client?.protocolMappers);
    return Response.json({...client,id:'fixture-client',...(mismatch?{enabled:false}:{})});
  })as typeof fetch;
  const options={issuer:'https://iam.example.test/realms/accesslobby-first-party',token:'synthetic-private-scoped-token',lookupTxt,fetcher};
  return{...database,owner,reviewer,operator,reader,apps,reviews,jobs,requested,input,options,
    dns:(value:boolean)=>{dns=value;},mismatch:(value:boolean)=>{mismatch=value;},readbackFailure:(value:boolean)=>{failReadback=value;},
    state:()=>({client,creates,calls,methods:[...methods]}),setClient:(value:ReturnType<typeof representation>|undefined)=>{client=value;}};
}

test('queue permission, snapshot and concurrent duplicate requests cannot activate or leak private claims',enabled,async()=>{
  const f=await fixture();try{
    await assert.rejects(f.jobs.enqueue(f.reader,f.requested.id,f.input),/operator_access_denied/);
    await assert.rejects(f.jobs.enqueue(f.reviewer,f.requested.id,f.input),/operator_access_denied/);
    await assert.rejects(f.jobs.enqueue(f.operator,f.requested.id,{...f.input,token:'forged'}),/invalid_activation_request/);
    await assert.rejects(f.jobs.enqueue(f.operator,f.requested.id,{...f.input,configurationHash:'0'.repeat(64)}),/activation_configuration_changed/);
    const results=await Promise.all(Array.from({length:8},()=>f.jobs.enqueue(f.operator,f.requested.id,f.input)));
    assert.equal(new Set(results.map(r=>r.job.id)).size,1);
    assert.equal(results[0].job.status,'queued');assert.equal(results[0].job.applicationStatus,'requested');
    assert.equal((await f.pool.query('SELECT count(*) FROM application_activation_jobs')).rows[0].count,'1');
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.activation_job.queued'")).rows[0].count,'1');
    const value=JSON.stringify(await f.jobs.detail(f.reader,results[0].job.id));
    for(const hidden of ['lease_token','claimToken','synthetic-private-scoped-token','reviewer_grant_version'])assert(!value.includes(hidden));
    assert.equal(f.state().calls,0);assert.equal(await f.apps.allowedClient(f.requested.clientId),false);
  }finally{await f.close();}
});

test('private claims are exclusive, expire with fencing and exhaust into an audited terminal state',enabled,async()=>{
  const f=await fixture();try{
    const queued=await f.jobs.enqueue(f.operator,f.requested.id,f.input);
    const claims=await Promise.all(Array.from({length:6},()=>claimActivationJob(f.pool,queued.job.id)));
    assert.equal(claims.filter(Boolean).length,1);const stale=claims.find(Boolean)!;
    await f.pool.query("UPDATE application_activation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[queued.job.id]);
    const current=await claimActivationJob(f.pool,queued.job.id);assert(current);assert.notEqual(current.claimToken,stale.claimToken);
    let providers=0;
    await assert.rejects(provisionApp(f.pool,f.requested.id,'--activate-first-party',f.input.reviewReference,{...f.options,activationLease:stale,tokenProvider:async()=>{providers++;return 'private-token';}}),/activation_lease_lost/);
    assert.equal(providers,0);assert.equal(f.state().calls,0);
    await f.pool.query("UPDATE application_activation_jobs SET attempt=max_attempts,lease_expires_at=now()-interval '1 second' WHERE id=$1",[queued.job.id]);
    assert.equal(await claimActivationJob(f.pool,queued.job.id),null);
    const job=(await f.jobs.detail(f.reader,queued.job.id)).job;assert.equal(job.status,'failed');assert.equal(job.retryable,false);assert.equal(job.lastError,'activation_attempts_exhausted');
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.activation_job.exhausted'")).rows[0].count,'1');
  }finally{await f.close();}
});

test('activation and success commit together after exact IAM readback and later runs do not duplicate work',enabled,async()=>{
  const f=await fixture();try{
    const queued=await f.jobs.enqueue(f.operator,f.requested.id,f.input);
    assert.equal((await runActivationJob(f.pool,f.options,queued.job.id)).state,'succeeded');
    const job=(await f.jobs.detail(f.reader,queued.job.id)).job;assert.equal(job.status,'succeeded');assert.equal(job.applicationStatus,'active');
    assert.equal(job.attempt,1);assert.equal(f.state().creates,1);assert.equal(await f.apps.allowedClient(f.requested.clientId),true);
    assert.equal((await f.pool.query('SELECT activation_job_id FROM applications WHERE id=$1',[f.requested.id])).rows[0].activation_job_id,job.id);
    const calls=f.state().calls;assert.equal((await runActivationJob(f.pool,f.options,job.id)).state,'idle');assert.equal(f.state().calls,calls);
    await assert.rejects(f.jobs.retry(f.operator,job.id,{expectedAttempt:1}),/activation_retry_unavailable/);
  }finally{await f.close();}
});

test('failed current DNS proof is sanitized and retryable only through a fresh bounded action',enabled,async()=>{
  const f=await fixture();try{
    const queued=await f.jobs.enqueue(f.operator,f.requested.id,f.input);f.dns(false);
    const failed=await runActivationJob(f.pool,f.options,queued.job.id);assert.equal(failed.state,'failed');
    let job=(await f.jobs.detail(f.reader,queued.job.id)).job;assert.equal(job.lastError,'activation_dns_unavailable');assert.equal(job.retryable,true);assert.equal(job.applicationStatus,'requested');
    assert.equal(f.state().calls,0);
    await assert.rejects(f.jobs.retry(f.operator,job.id,{expectedAttempt:0}),/invalid_activation_retry/);
    await assert.rejects(f.jobs.retry(f.operator,job.id,{expectedAttempt:2}),/activation_attempt_changed/);
    f.dns(true);await f.jobs.retry(f.operator,job.id,{expectedAttempt:1});
    assert.equal((await runActivationJob(f.pool,f.options,job.id)).state,'succeeded');
    job=(await f.jobs.detail(f.reader,job.id)).job;assert.equal(job.attempt,2);
  }finally{await f.close();}
});

test('IAM mismatch never activates and a failed success audit rolls back app and job together',enabled,async()=>{
  const f=await fixture();try{
    const queued=await f.jobs.enqueue(f.operator,f.requested.id,f.input);f.mismatch(true);
    assert.equal((await runActivationJob(f.pool,f.options,queued.job.id)).state,'failed');
    let job=(await f.jobs.detail(f.reader,queued.job.id)).job;assert.equal(job.lastError,'activation_iam_configuration_mismatch');assert.equal(job.retryable,false);
    assert.equal(await f.apps.allowedClient(f.requested.clientId),false);
    await assert.rejects(f.jobs.retry(f.operator,job.id,{expectedAttempt:1}),/activation_retry_unavailable/);
    // A private repair permits an explicit new current request; this fixture
    // resets only its disposable failed job to exercise atomic success/audit.
    f.mismatch(false);
    await f.pool.query("UPDATE application_activation_jobs SET status='queued',last_error=NULL WHERE id=$1",[job.id]);
    await f.pool.query(`CREATE FUNCTION reject_activation_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='application.activation_job.succeeded' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER activation_audit_failure BEFORE INSERT ON operator_audit_events FOR EACH ROW EXECUTE FUNCTION reject_activation_success()`);
    assert.equal((await runActivationJob(f.pool,f.options,job.id)).state,'failed');
    job=(await f.jobs.detail(f.reader,job.id)).job;assert.equal(job.applicationStatus,'requested');assert.equal(job.status,'failed');
    assert.equal((await f.pool.query("SELECT count(*) FROM application_events WHERE action='application.activated'")).rows[0].count,'0');
    assert(!JSON.stringify(job).includes('fixture audit unavailable'));
  }finally{await f.close();}
});

test('interrupted creation retries reuse an existing client and bound active recovery uses GET only',enabled,async()=>{
  const f=await fixture();try{
    const queued=await f.jobs.enqueue(f.operator,f.requested.id,f.input);const lease=await claimActivationJob(f.pool,queued.job.id);assert(lease);
    f.readbackFailure(true);
    await assert.rejects(provisionApp(f.pool,f.requested.id,'--activate-first-party',f.input.reviewReference,{...f.options,activationLease:lease}),/sensitive-private-failure-canary/);
    assert.equal(f.state().creates,1);assert.equal((await f.jobs.detail(f.reader,queued.job.id)).job.applicationStatus,'requested');
    f.readbackFailure(false);await f.pool.query("UPDATE application_activation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[queued.job.id]);
    assert.equal((await runActivationJob(f.pool,f.options,queued.job.id)).state,'succeeded');assert.equal(f.state().creates,1);
    // Atomic commits prevent this normal window, but a previously observed
    // active/running record still requires a read-only, exact bound recovery.
    await f.pool.query("UPDATE application_activation_jobs SET status='running',lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE id=$1",[queued.job.id,randomUUID()]);
    const before=f.state().methods.length;assert.equal((await runActivationJob(f.pool,f.options,queued.job.id)).state,'succeeded');
    assert(f.state().methods.slice(before).every(method=>method==='GET'));assert.equal(f.state().creates,1);
    await f.pool.query("UPDATE application_activation_jobs SET status='running',lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE id=$1",[queued.job.id,randomUUID()]);
    f.setClient(undefined);const creates=f.state().creates;
    assert.equal((await runActivationJob(f.pool,f.options,queued.job.id)).state,'failed');assert.equal(f.state().creates,creates);
    assert.equal((await f.jobs.detail(f.reader,queued.job.id)).job.applicationStatus,'active');
  }finally{await f.close();}
});

test('private credential input rejects interactive, oversized and header-injected values without echoes',async()=>{
  async function* input(value:string){yield value;}
  const secret='synthetic-private-credential-canary';
  assert.equal(await readActivationToken(input(secret+'\n')),secret);
  await assert.rejects(readActivationToken(input(secret),true),/noninteractive/);
  await assert.rejects(readActivationToken(input('x'.repeat(16385))),/exceeds limit/);
  await assert.rejects(readActivationToken(input(secret+'\r\nx-evil: injected')),/Invalid private token/);
  const value=activationFailure(new Error('sensitive-private-failure-canary'));
  assert.deepEqual(value,{code:'activation_private_service_unavailable',retryable:true});
  assert(!JSON.stringify(value).includes('sensitive-private'));
});
