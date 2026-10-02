import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
export default function NotFound() {
  return <PublicShell><section className="reading-page"><p className="eyebrow">Page not found</p><h1>Let’s find your way back.</h1><p>This address may have changed or the page may no longer be available.</p><div className="hero-actions"><Link className="button button-primary" href="/account">Open your account</Link><Link className="button button-secondary" href="/">Return home</Link></div></section></PublicShell>;
}
