import { resolveTxt } from 'node:dns/promises';

export const proofHost = (redirectUri: string) => `_accesslobby-verify.${new URL(redirectUri).hostname}`;
export const proofValue = (challenge: string) => `accesslobby-verify=${challenge}`;

export async function originProofPresent(host: string, challenge: string,
  lookup: (host: string) => Promise<string[][]> = resolveTxt): Promise<boolean> {
  // TXT strings can be split into chunks within one DNS answer; never combine separate answers.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answers = await Promise.race([lookup(host), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('DNS timeout')), 5000);
    })]);
    return answers.length <= 100 && answers.some(chunks => chunks.join('') === proofValue(challenge));
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'NXDOMAIN'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}
