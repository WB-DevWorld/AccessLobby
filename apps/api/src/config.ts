export interface Config {
  databaseUrl: string;
  issuer: string;
  audience: string;
  allowedClients: string[];
  port: number;
  version: string;
}

export function config(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };
  const issuer = required('OIDC_ISSUER');
  const url = new URL(issuer);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('OIDC_ISSUER must use HTTPS');
  }
  if (issuer.endsWith('/')) throw new Error('OIDC_ISSUER must not end with /');
  const allowedClients = required('ALLOWED_CLIENT_IDS').split(',').map(s => s.trim()).filter(Boolean);
  if (allowedClients.length === 0) throw new Error('No allowed clients');
  return {
    databaseUrl: required('DATABASE_URL'), issuer,
    audience: required('OIDC_API_AUDIENCE'), allowedClients,
    port: Number(env.PORT ?? 3001), version: env.GIT_SHA ?? 'local'
  };
}
