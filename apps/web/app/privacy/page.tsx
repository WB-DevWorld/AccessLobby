import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
export const metadata = { title: 'Privacy information' };
export default function Privacy() {
  return <PublicShell><article className="reading-page"><p className="eyebrow">Your information</p><h1>Understand what belongs where.</h1><p className="reading-lede">Current data-handling information for AccessLobby’s pilot. This is not a comprehensive legal privacy policy.</p>
    <section><h2>Your AccessLobby identity</h2><p>AccessLobby maintains a lasting person ID, its lifecycle status and the link to the sign-in provider. Email addresses and provider identifiers do not replace that person ID.</p></section>
    <section><h2>Sign-in and sessions</h2><p>The identity provider manages credentials and sign-in challenges. AccessLobby uses protected, time-limited session cookies and a separate cookie for your selected organization view. Account pages do not display tokens or session secrets.</p></section>
    <section><h2>Organizations and applications</h2><p>AccessLobby records organization memberships, invitations, application requests, domain verification and broad app-entry grants, along with relevant audit events. Each connected app keeps its own account information and resource permissions.</p></section>
    <section><h2>Browser storage and offline use</h2><p>Your theme preference is stored in your browser. The installed app may cache approved public assets and an offline information page. Account pages, sign-in responses and private identity or permission data are not stored in its service-worker cache.</p></section>
    <section><h2>Questions or account changes</h2><p>Contact the administrator who invited you for pilot-account assistance. For information held inside another app, contact that app’s administrator. Self-service data export, deletion and fine-grained consent controls are not available here yet.</p><Link className="text-link" href="/help#support">Account help →</Link></section>
  </article></PublicShell>;
}
