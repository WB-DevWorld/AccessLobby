import 'reflect-metadata';
import { Controller, Get, Inject, Module, Post, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { discovery, tokenVerifier, type VerifyToken } from './auth.js';
import { PostgresIdentityStore, type IdentityStore } from './identity.js';
import { logoutVerifier, SessionRevocations } from './logout.js';

const settings = config();
const pool = new Pool({ connectionString: settings.databaseUrl, max: 10 });
const jwksUri = await discovery(settings.issuer);
const verify = tokenVerifier(settings, jwksUri);
const verifyLogout = logoutVerifier(settings.issuer, jwksUri, 'accesslobby-web');
const store = new PostgresIdentityStore(pool);
const revocations = new SessionRevocations(pool);

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
    const requestId = typeof req.headers['x-request-id'] === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(req.headers['x-request-id'])
      ? req.headers['x-request-id'] : randomUUID();
    res.setHeader('x-request-id', requestId);
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
    if (!match) return res.status(401).json({ error: 'unauthorized', requestId });
    let actor;
    try { actor = await this.verifyToken(match[1]!); }
    catch (error) {
      console.warn(JSON.stringify({ event: 'identity.rejected', requestId, kind: error instanceof Error ? error.name : 'Error' }));
      return res.status(401).json({ error: 'unauthorized', requestId });
    }
    try {
      if (actor.client === 'accesslobby-web' && !actor.sid) return res.status(401).json({ error: 'missing_session', requestId });
      if (actor.sid && await revocations.isRevoked(actor.issuer, actor.sid)) {
        return res.status(401).json({ error: 'session_ended', requestId });
      }
      const person = await this.identities.resolve(actor);
      if (person.status !== 'active') return res.status(403).json({ error: 'identity_suspended', requestId });
      console.info(JSON.stringify({ event: 'identity.resolved', requestId, client: actor.client }));
      return res.json({ contract: 'accesslobby.identity.v0.1', person: { id: person.id, status: person.status }, requestId });
    } catch {
      console.error(JSON.stringify({ event: 'identity.unavailable', requestId }));
      return res.status(503).json({ error: 'identity_unavailable', requestId });
    }
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
