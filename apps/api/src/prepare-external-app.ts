/** Private preparation runner; has no IAM privileges and cannot activate an external client. */
import { Pool } from 'pg';
import { ExternalProfiles } from './external-profiles.js';

async function main() {
  const [appId, mode, reference, extra] = process.argv.slice(2);
  if (!appId || !['--plan', '--prepare', '--suspend'].includes(mode ?? '') || extra || (mode === '--plan' && reference)) {
    throw new Error('Usage: prepare-external-app <application-uuid> --plan | --prepare <review-reference> | --suspend <review-reference>');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const profiles = new ExternalProfiles(pool);
    console.info(JSON.stringify(mode === '--suspend' ? await profiles.suspend(appId, reference ?? '') :
      await profiles.prepare(appId, reference, mode === '--plan')));
  }
  finally { await pool.end(); }
}
main().catch(() => { console.error('External preparation failed; no activation performed'); process.exitCode = 1; });
