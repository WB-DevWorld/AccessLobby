import Link from 'next/link';
import { identityApi } from '@/lib/current-identity';

/** Navigation is a convenience; API and console routes enforce authority anew. */
export async function OperatorConsoleLink({ active }: { active: boolean }) {
  try {
    const response = await identityApi('/v1/admin/access');
    if (!response.ok) return null;
    const body = await response.json();
    if (body?.contract !== 'accesslobby.admin.v0.1' || body?.capabilities?.read !== true ||
        !Array.isArray(body.roles) || !body.roles.some((role: unknown) => ['support_reader', 'application_reviewer', 'identity_operator', 'application_operator'].includes(String(role)))) return null;
    return <Link href="/admin" aria-current={active ? 'page' : undefined}>Operator console</Link>;
  } catch { return null; }
}
