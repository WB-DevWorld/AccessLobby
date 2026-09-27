import Link from 'next/link';
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <><h1>AccessLobby</h1><p>Your common sign-in foundation.</p>
    {error === 'shared_logout_unavailable' && <p role="alert">This app signed out, but AccessLobby could not complete sign-out from connected apps. Please try again when the identity service is available.</p>}
    <p><Link className="button" href="/auth/login">Sign in</Link>{' '}
      <Link href="/auth/login?intent=register">Create an account</Link></p>
    <p><Link href="/account">View account status</Link></p></>;
}
