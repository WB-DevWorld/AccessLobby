import 'reflect-metadata';
import { Body, Controller, Delete, Get, Inject, Module, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { discovery, tokenVerifier, type AuthenticatedSubject, type VerifyToken } from './auth.js';
import { PostgresIdentityStore, type IdentityStore } from './identity.js';
import { logoutVerifier, SessionRevocations } from './logout.js';
import { OrganizationError, OrganizationStore, validId } from './organizations.js';
import { ApplicationError, ApplicationStore, ClientRegistryUnavailable } from './applications.js';

const settings = config();
const pool = new Pool({ connectionString: settings.databaseUrl, max: 10 });
const jwksUri = await discovery(settings.issuer);
const applications = new ApplicationStore(pool, settings.allowedClients);
const verify = tokenVerifier(settings, jwksUri, clientId => applications.allowedClient(clientId));
const verifyLogout = logoutVerifier(settings.issuer, jwksUri, 'accesslobby-web');
const store = new PostgresIdentityStore(pool);
const revocations = new SessionRevocations(pool);
const organizations = new OrganizationStore(pool);

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

  @Get('v1/me')
  async me(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, async (id, requestId) =>
      ({ contract: 'accesslobby.identity.v0.1', person: { id, status: 'active' }, requestId }));
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
      const result = await work(person.id, requestId, actor);
      console.info(JSON.stringify({ event: 'identity.resolved', requestId, client: actor.client }));
      return res.json(result);
    } catch (error) {
      if (error instanceof OrganizationError) return res.status(error.status).json({ error: error.code, requestId });
      if (error instanceof ApplicationError) return res.status(error.status).json({ error: error.code, requestId });
      console.error(JSON.stringify({ event: 'identity.unavailable', requestId }));
      return res.status(503).json({ error: 'identity_unavailable', requestId });
    }
  }

  @Get('v1/contexts')
  contexts(@Req() req: any, @Res() res: any) {
    return this.withPerson(req, res, id => organizations.list(id), true);
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
app.enableShutdownHooks();
await app.listen(settings.port, '0.0.0.0');
