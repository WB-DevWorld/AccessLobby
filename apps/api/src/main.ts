import 'reflect-metadata';
import { Body, Controller, Delete, Get, HttpCode, Inject, Module, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { discovery, tokenVerifier, type AuthenticatedSubject, type VerifyToken } from './auth.js';
import { PostgresIdentityStore, isCurrentPersonAuthentication, type IdentityStore } from './identity.js';
import { logoutVerifier, SessionRevocations } from './logout.js';
import { OrganizationError, OrganizationStore, validId } from './organizations.js';
import { ApplicationError, ApplicationStore, ClientRegistryUnavailable } from './applications.js';
import { PeerSessions, PeerSessionError } from './peer-sessions.js';
import { OperatorError, OperatorStore } from './operators.js';
import { ApplicationReviewStore } from './application-reviews.js';
import { PersonControlStore } from './person-controls.js';
import { ApplicationLifecycleStore } from './application-lifecycle.js';
import { ActivationJobStore } from './activation-jobs.js';

const settings = config();
const pool = new Pool({ connectionString: settings.databaseUrl, max: 10 });
const jwksUri = await discovery(settings.issuer);
const applications = new ApplicationStore(pool, settings.allowedClients);
const verify = tokenVerifier(settings, jwksUri, clientId => applications.allowedClient(clientId));
const verifyLogout = logoutVerifier(settings.issuer, jwksUri, 'accesslobby-web');
const store = new PostgresIdentityStore(pool);
const revocations = new SessionRevocations(pool);
const peerSessions = new PeerSessions(pool, settings.issuer, client => applications.allowedClient(client), async (person, client) => {
  try { await applications.entry(person, client); return true; }
  catch (error) { if (error instanceof ApplicationError && error.status === 403) return false; throw error; }
});
const organizations = new OrganizationStore(pool);
const operators = new OperatorStore(pool);
const applicationReviews = new ApplicationReviewStore(pool, operators);
const personControls = new PersonControlStore(pool, operators);
const applicationLifecycle = new ApplicationLifecycleStore(pool);
const activationJobs = new ActivationJobStore(pool, operators);

@Controller()
class ApiController {
  constructor(@Inject('VERIFY') private readonly verifyToken: VerifyToken,
    @Inject('STORE') private readonly identities: IdentityStore) {}

  @Get('health/live')
  live() { return { status: 'ok', version: settings.version }; }

  @Get('health/ready')
  async ready(@Res() res: any) {
    try { await pool.query('SELECT 1'); res.json({ status: 'ready', version: settings.version }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  }

  @Get('v1/consumer-capabilities')
  capabilities(@Res() res: any) {
    res.setHeader('cache-control', 'no-store');
    return res.json({ contract: 'accesslobby.consumer-capabilities.v0.1', peerSessions: 'accesslobby.peer-session.v0.1' });
  }

  @Get('v1/me')
  async me(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, async (id, requestId, actor) => ({
      contract: 'accesslobby.identity.v0.1', person: { id, status: 'active' }, requestId,
      ...(req.headers['x-accesslobby-session-receipt'] === '1' ? { peerSession: await peerSessions.issue(actor, id) } : {}),
    }));
  }

  @Post('v1/peer-sessions/status')
  peerSessionStatus(@Req() req: any, @Res() res: any) { return this.peerSession(req, res, false); }

  @Post('v1/peer-sessions/end')
  peerSessionEnd(@Req() req: any, @Res() res: any) { return this.peerSession(req, res, true); }

  @Post('v1/session/end')
  async endBrowserSession(@Req() req: any, @Res() res: any) {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId); res.setHeader('cache-control', 'no-store');
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
    if (!match || Object.keys(req.body ?? {}).length) return res.status(401).json({ error: 'unauthorized', requestId });
    let actor;
    try { actor = await this.verifyToken(match[1]!); }
    catch (error) {
      const unavailable = error instanceof ClientRegistryUnavailable;
      return res.status(unavailable ? 503 : 401).json({ error: unavailable ? 'session_service_unavailable' : 'unauthorized', requestId });
    }
    if (!actor.sid) return res.status(401).json({ error: 'missing_session', requestId });
    try {
      const person = await this.identities.resolve(actor);
      if (person.status !== 'active') return res.status(403).json({ error: 'identity_suspended', requestId });
      if (!isCurrentPersonAuthentication(person, actor)) return res.status(401).json({ error: 'session_ended', requestId });
      const event = 'self-end:' + createHash('sha256').update(JSON.stringify([actor.issuer, actor.client, actor.sid])).digest('hex');
      await revocations.revoke(actor.issuer, actor.sid, event);
      return res.status(200).json({ contract: 'accesslobby.browser-session.v0.1', ended: true, requestId });
    } catch { return res.status(503).json({ error: 'session_service_unavailable', requestId }); }
  }

  private async peerSession(req: any, res: any, end: boolean) {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId); res.setHeader('cache-control', 'no-store');
    const match = /^PeerSession ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    const client = req.headers['x-accesslobby-client-id'];
    if (!match || typeof client !== 'string' || Object.keys(req.body ?? {}).length) {
      return res.status(401).json({ error: 'invalid_peer_session', requestId });
    }
    try {
      const result = end ? await peerSessions.end(match[1]!, client) : await peerSessions.status(match[1]!, client);
      return res.status(200).json({ ...result, requestId });
    } catch (error) {
      const known = error instanceof PeerSessionError;
      return res.status(known ? error.status : 503).json({ error: known ? error.code : 'session_service_unavailable', requestId });
    }
  }

  private async withPerson(req: any, res: any,
    work: (id: string, requestId: string, actor: AuthenticatedSubject) => Promise<unknown>, firstParty = false) {
    const requestId = typeof req.headers['x-request-id'] === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(req.headers['x-request-id'])
      ? req.headers['x-request-id'] : randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('cache-control', 'no-store');
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
    if (!match) return res.status(401).json({ error: 'unauthorized', requestId });
    let actor;
    try { actor = await this.verifyToken(match[1]!); }
    catch (error) {
      if (error instanceof ClientRegistryUnavailable) return res.status(503).json({ error: 'identity_unavailable', requestId });
      console.warn(JSON.stringify({ event: 'identity.rejected', requestId, kind: error instanceof Error ? error.name : 'Error' }));
      return res.status(401).json({ error: 'unauthorized', requestId });
    }
    if (firstParty && actor.client !== 'accesslobby-web') return res.status(403).json({ error: 'first_party_only', requestId });
    try {
      if (actor.client === 'accesslobby-web' && !actor.sid) return res.status(401).json({ error: 'missing_session', requestId });
      if (actor.sid && await revocations.isRevoked(actor.issuer, actor.sid)) {
        return res.status(401).json({ error: 'session_ended', requestId });
      }
      const person = await this.identities.resolve(actor);
      if (person.status !== 'active') return res.status(403).json({ error: 'identity_suspended', requestId });
      if (!isCurrentPersonAuthentication(person, actor)) return res.status(401).json({ error: 'session_ended', requestId });
      const result = await work(person.id, requestId, actor);
      console.info(JSON.stringify({ event: 'identity.resolved', requestId, client: actor.client }));
      return res.json(result);
    } catch (error) {
      if (error instanceof OrganizationError) return res.status(error.status).json({ error: error.code, requestId });
      if (error instanceof ApplicationError) return res.status(error.status).json({ error: error.code, requestId });
      if (error instanceof PeerSessionError) return res.status(error.status).json({ error: error.code, requestId });
      if (error instanceof OperatorError) return res.status(error.status).json({ error: error.code, requestId });
      console.error(JSON.stringify({ event: 'identity.unavailable', requestId }));
      return res.status(503).json({ error: 'identity_unavailable', requestId });
    }
  }

  @Get('v1/contexts')
  contexts(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, id => organizations.list(id), true);
  }

  // Platform authority is separate from organizations, application ownership and
  // IAM realm roles. Reuse full bearer/person/session validation, then recheck
  // the live database role on every operator request.
  @Get('v1/admin/access')
  operatorAccess(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, id => operators.access(id), true);
  }

  @Get('v1/admin/people')
  operatorPeople(@Req() req: any, @Res() res: any, @Query('q') q?: string, @Query('after') after?: string) {
    return this.withPerson(req, res, id => operators.people(id, q, after), true);
  }

  @Get('v1/admin/people/:personId')
  operatorPerson(@Req() req: any, @Res() res: any, @Param('personId') personId: string) {
    return this.withPerson(req, res, id => personControls.detail(id, personId), true);
  }

  @Post('v1/admin/people/:personId/status')
  @HttpCode(200)
  operatorPersonStatus(@Req() req: any, @Res() res: any, @Param('personId') personId: string, @Body() body: any) {
    return this.withPerson(req, res, id => personControls.change(id, personId, body), true);
  }

  @Get('v1/admin/organizations')
  operatorOrganizations(@Req() req: any, @Res() res: any, @Query('q') q?: string, @Query('after') after?: string) {
    return this.withPerson(req, res, id => operators.organizations(id, q, after), true);
  }

  @Get('v1/admin/audit')
  operatorAudit(@Req() req: any, @Res() res: any, @Query('after') after?: string) {
    return this.withPerson(req, res, id => operators.audit(id, after), true);
  }

  @Get('v1/admin/applications')
  operatorApplications(@Req() req: any, @Res() res: any, @Query('q') q?: string, @Query('after') after?: string) {
    return this.withPerson(req, res, id => applicationReviews.list(id, q, after), true);
  }

  @Get('v1/admin/applications/:applicationId')
  operatorApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string) {
    return this.withPerson(req, res, id => applicationReviews.detail(id, appId), true);
  }

  @Post('v1/admin/applications/:applicationId/review')
  @HttpCode(200)
  operatorReview(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => applicationReviews.record(id, appId, body), true);
  }

  @Get('v1/admin/activation-jobs')
  operatorActivationJobs(@Req() req: any, @Res() res: any, @Query('after') after?: string) {
    return this.withPerson(req, res, id => activationJobs.list(id, after), true);
  }

  @Get('v1/admin/activation-jobs/:jobId')
  operatorActivationJob(@Req() req: any, @Res() res: any, @Param('jobId') jobId: string) {
    return this.withPerson(req, res, id => activationJobs.detail(id, jobId), true);
  }

  @Post('v1/admin/applications/:applicationId/activation-jobs')
  @HttpCode(202)
  operatorQueueActivation(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => activationJobs.enqueue(id, appId, body), true);
  }

  @Post('v1/admin/activation-jobs/:jobId/retry')
  @HttpCode(202)
  operatorRetryActivation(@Req() req: any, @Res() res: any, @Param('jobId') jobId: string, @Body() body: any) {
    return this.withPerson(req, res, id => activationJobs.retry(id, jobId, body), true);
  }

  @Get('v1/my-organizations')
  myOrganizations(@Req() req: any, @Res() res: any) {
    res.setHeader('cache-control', 'no-store');
    return this.withPerson(req, res, async (id, requestId) => ({
      contract: 'accesslobby.memberships.v0.1',
      person: { id },
      organizations: await organizations.activeMemberships(id),
      requestId,
    }));
  }

  @Post('v1/applications')
  requestApplication(@Req() req: any, @Res() res: any, @Body() body: any) {
    return this.withPerson(req, res, id => applications.request(id, body), true);
  }

  @Get('v1/applications/mine')
  myApplications(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, async id => ({ contract: 'accesslobby.applications.v0.1',
      applications: await applications.mine(id) }), true);
  }

  @Post('v1/applications/:applicationId/verify-origin')
  verifyApplicationOrigin(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string) {
    return this.withPerson(req, res, id => applications.verifyOrigin(id, appId), true);
  }

  @Get('v1/applications/visible')
  visibleApplications(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, async id => ({ contract: 'accesslobby.applications.v0.1',
      applications: await applications.visible(id) }), true);
  }

  @Get('v1/application-entry')
  applicationEntry(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, async (id, requestId, actor) => ({
      contract: 'accesslobby.app-entry.v0.1', ...await applications.entry(id, actor.client), requestId,
    }));
  }

  @Get('v1/applications/:applicationId')
  ownerApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string) {
    return this.withPerson(req, res, id => applicationLifecycle.detail(id, appId), true);
  }

  @Patch('v1/applications/:applicationId')
  ownerEditApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => applicationLifecycle.edit(id, appId, body), true);
  }

  @Post('v1/applications/:applicationId/cancel')
  @HttpCode(200)
  ownerCancelApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => applicationLifecycle.cancel(id, appId, body), true);
  }

  @Post('v1/applications/:applicationId/resubmit')
  @HttpCode(200)
  ownerResubmitApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => applicationLifecycle.resubmit(id, appId, body), true);
  }

  @Post('v1/applications/:applicationId/grants')
  grantApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Body() body: any) {
    return this.withPerson(req, res, id => applications.grant(id, appId, body?.personId, body?.expiresAt), true);
  }

  @Delete('v1/applications/:applicationId/grants/:personId')
  revokeApplication(@Req() req: any, @Res() res: any, @Param('applicationId') appId: string, @Param('personId') personId: string) {
    return this.withPerson(req, res, id => applications.revoke(id, appId, personId), true);
  }

  @Post('v1/organizations')
  createOrganization(@Req() req: any, @Res() res: any, @Body() body: any) {
    return this.withPerson(req, res, id => organizations.create(id, body?.name), true);
  }

  @Get('v1/organizations/:organizationId')
  organization(@Req() req: any, @Res() res: any, @Param('organizationId') orgId: string) {
    return this.withPerson(req, res, id => organizations.detail(id, this.id(orgId)), true);
  }

  @Post('v1/organizations/:organizationId/invitations')
  invite(@Req() req: any, @Res() res: any, @Param('organizationId') orgId: string, @Body() body: any) {
    return this.withPerson(req, res, id => organizations.invite(id, this.id(orgId), body?.personId, body?.role), true);
  }

  @Post('v1/invitations/:invitationId/respond')
  respond(@Req() req: any, @Res() res: any, @Param('invitationId') invitationId: string, @Body() body: any) {
    return this.withPerson(req, res, id => organizations.respond(id, this.id(invitationId), this.response(body?.decision)), true);
  }

  @Delete('v1/organizations/:organizationId/invitations/:invitationId')
  revokeInvitation(@Req() req: any, @Res() res: any, @Param('organizationId') orgId: string, @Param('invitationId') invitationId: string) {
    return this.withPerson(req, res, id => organizations.revoke(id, this.id(orgId), this.id(invitationId)), true);
  }

  @Patch('v1/organizations/:organizationId/members/:personId')
  updateMember(@Req() req: any, @Res() res: any, @Param('organizationId') orgId: string, @Param('personId') personId: string, @Body() body: any) {
    return this.withPerson(req, res, id => organizations.changeRole(id, this.id(orgId), this.id(personId), body?.role), true);
  }

  @Delete('v1/organizations/:organizationId/members/:personId')
  removeMember(@Req() req: any, @Res() res: any, @Param('organizationId') orgId: string, @Param('personId') personId: string) {
    return this.withPerson(req, res, id => organizations.leaveOrRemove(id, this.id(orgId), this.id(personId)), true);
  }

  private id(value: string) {
    if (!validId(value)) throw new OrganizationError(400, 'invalid_id');
    return value;
  }

  private response(value: unknown) {
    if (value !== 'accept' && value !== 'decline') throw new OrganizationError(400, 'invalid_decision');
    return value === 'accept';
  }

  @Post('v1/backchannel-logout')
  async backchannel(@Req() req: any, @Res() res: any) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
      return res.status(415).send('Expected form data');
    }
    const token = req.body?.logout_token;
    if (typeof token !== 'string' || token.length > 16384) return res.status(400).send('Invalid logout token');
    let logout;
    try { logout = await verifyLogout(token); }
    catch { return res.status(400).send('Invalid logout token'); }
    try {
      if (!await revocations.revoke(settings.issuer, logout.sid, logout.jti)) return res.status(400).send('Replay rejected');
      return res.status(200).send('OK');
    } catch { return res.status(503).send('Session service unavailable'); }
  }
}

@Module({ controllers: [ApiController], providers: [
  { provide: 'VERIFY', useValue: verify }, { provide: 'STORE', useValue: store }
] })
class AppModule {}

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
// Stage A has no external preview, even if a stale environment flag is supplied.
app.use('/v1/preview', (_req: any, res: any) => {
  res.setHeader('cache-control', 'no-store');
  return res.status(404).json({ error: 'not_found' });
});
app.enableShutdownHooks();
await app.listen(settings.port, '0.0.0.0');
