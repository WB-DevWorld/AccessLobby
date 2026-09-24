import { cookies } from 'next/headers';
import Link from 'next/link';
import { sessionCookie, unseal } from '@/lib/oidc';
export const dynamic = 'force-dynamic';
export default async function Account() {
  let person: { id: string; status: string } | null = null;
  try {
    const session = (await cookies()).get(sessionCookie())?.value;
    if (session) {
      const payload = await unseal(session);
      if (typeof payload.accessToken === 'string') {
        const response = await fetch(`${process.env.API_INTERNAL_URL}/v1/me`, {
          headers: { authorization: `Bearer ${payload.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000)
        });
        if (response.ok) person = (await response.json()).person;
      }
    }
  } catch { /* Display a truthful unavailable state. */ }
  return <><h1>Account</h1>{person
    ? <><p>Signed in. Identity status: {person.status}.</p><p>Person ID: <code>{person.id}</code></p>
      <form method="post" action="/auth/logout"><button type="submit">Sign out</button></form></>
    : <><p>No active identity could be resolved. The session may have expired or identity service is unavailable.</p>
      <Link href="/auth/login">Sign in again</Link></>}</>;
}
