import Link from 'next/link';
export default function Home() {
  return <><h1>AccessLobby</h1><p>Your common sign-in foundation.</p>
    <p><Link className="button" href="/auth/login">Sign in</Link></p>
    <p><Link href="/account">View account status</Link></p></>;
}
