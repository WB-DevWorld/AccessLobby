/** Private one-job worker. No HTTP endpoint, daemon credential or browser token. */
import { Pool } from 'pg';
import { validId } from './organizations.js';
import { OperatorError } from './operators.js';
import { activationContract, claimActivationJob, failActivationJob } from './activation-jobs.js';
import { provisionApp, type ProvisionOptions } from './provision-app.js';

export function activationFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof OperatorError) {
    const safe=new Set(['activation_lease_lost','activation_configuration_changed','activation_review_required',
      'activation_authority_changed','activation_requester_unavailable','activation_application_unavailable']);
    if (safe.has(error.code)) return { code: error.code, retryable: error.code === 'activation_lease_lost' };
    return { code: 'activation_authority_changed', retryable: false };
  }
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Current independent approved')) return { code: 'activation_review_required', retryable: false };
  if (message.startsWith('Current DNS origin proof')) return { code: 'activation_dns_unavailable', retryable: true };
  if (message.includes('differs from approved')) return { code: 'activation_iam_configuration_mismatch', retryable: false };
  if (message.startsWith('Only requested')) return { code: 'activation_application_unavailable', retryable: false };
  if (message.includes('required on the private')) return { code: 'activation_credential_unavailable', retryable: true };
  return { code: 'activation_private_service_unavailable', retryable: true };
}

export async function runActivationJob(pool: Pool, options: ProvisionOptions, jobId?: string) {
  const lease = await claimActivationJob(pool, jobId);
  if (!lease) return { contract: activationContract, state: 'idle' as const };
  try {
    const result = await pool.query<{ application_id: string; review_reference: string }>(
      'SELECT application_id,review_reference FROM application_activation_jobs WHERE id=$1', [lease.jobId]);
    const row = result.rows[0];
    if (!row) throw new Error('Claimed activation job disappeared');
    await provisionApp(pool, row.application_id, '--activate-first-party', row.review_reference, { ...options, activationLease: lease });
    return { contract: activationContract, state: 'succeeded' as const, jobId: lease.jobId };
  } catch (error) {
    const failure = activationFailure(error);
    await failActivationJob(pool, lease, failure.code, failure.retryable);
    return { contract: activationContract, state: 'failed' as const, jobId: lease.jobId, error: failure.code };
  }
}

/** Stdin-only credential, bounded and never echoed, retained only for this run. */
export async function readActivationToken(input: AsyncIterable<Uint8Array | string>, tty = false): Promise<string> {
  if (tty) throw new Error('A private noninteractive token pipe is required');
  let content = '', size = 0;
  for await (const chunk of input) {
    const value = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    size += Buffer.byteLength(value);
    if (size > 16384) throw new Error('Private token pipe exceeds limit');
    content += value;
  }
  // Permit the producer's one final newline, never an embedded header delimiter.
  const token = content.replace(/\r?\n$/, '');
  if (token.length < 20 || !/^[A-Za-z0-9._~-]+$/.test(token)) throw new Error('Invalid private token pipe');
  return token;
}

async function main() {
  const args = process.argv.slice(2);
  const next = args.length === 2 && args[0] === '--next' && args[1] === '--token-stdin';
  const selected = args.length === 3 && args[0] === '--job' && validId(args[1]) && args[2] === '--token-stdin';
  if (!next && !selected) throw new Error('Usage: activation-worker --next --token-stdin | --job JOB_UUID --token-stdin');
  if (!process.env.DATABASE_URL || !process.env.OIDC_ISSUER) throw new Error('Protected worker configuration is required');
  const token = await readActivationToken(process.stdin, !!process.stdin.isTTY);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  try {
    const result = await runActivationJob(pool, { issuer: process.env.OIDC_ISSUER, token, base: process.env.IAM_INTERNAL_URL }, selected ? args[1] : undefined);
    console.info(JSON.stringify(result));
    if (result.state === 'failed') process.exitCode = 1;
  } finally { await pool.end(); }
}

if (process.argv[1]?.endsWith('/activation-worker.js') || process.argv[1]?.endsWith('/activation-worker.ts')) {
  main().catch(() => { console.error('Private activation worker failed; inspect protected configuration'); process.exitCode = 1; });
}
