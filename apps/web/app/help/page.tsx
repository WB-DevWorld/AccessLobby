import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
export const metadata = { title: 'Help & support' };
export default function Help() {
  return <PublicShell><article className="reading-page"><p className="eyebrow">AccessLobby help</p><h1>How can we help?</h1><p className="reading-lede">Choose a topic.</p>
    <div className="faq-list">
      <details><summary>Signing in</summary><p>Choose AccessLobby sign-in in your app to return there after signing in. Or <Link href="/auth/login">sign in here</Link> to open your AccessLobby account.</p></details>
      <details><summary>Personal and organization accounts</summary><p>Your personal identity can belong to several organizations. Choose your account view in <Link href="/contexts">Personal & organizations</Link>. Membership does not automatically grant app access; each app manages its own permissions.</p><p>To use a different person’s account, choose “Sign in as another person” in the account menu.</p></details>
      <details id="accounts"><summary>Connecting an existing app account</summary><p>Each app keeps its own local account, data and permissions. Where linking is supported, prove control of both accounts. Matching email addresses alone cannot link or merge them.</p></details>
      <details id="support"><summary>Recovery and support</summary><p>Use “Forgot your password?” if offered, or contact the administrator who invited you. For access inside an app, contact that app’s administrator.</p><p>Trusted contacts, passkeys, backup codes and device recovery are not available as account controls here yet.</p></details>
      <details><summary>Signing out</summary><p>“This app only” leaves AccessLobby signed in, so returning may sign you in automatically. Shared sign-out ends sign-in in this browser; connected apps may take time to sign out. Other devices stay signed in.</p><Link className="text-link" href="/sign-out">Choose how to sign out →</Link></details>
      <details id="access"><summary>Pilot access</summary><p>Use an invitation or registration where enabled. App connections require domain verification and review before activation. Public service terms have not been published here.</p></details>
      <details id="operator-console"><summary>Operator console and realm administration</summary><p>The <Link href="/admin">operator console</Link> provides people, organization, application and audit controls according to your operator permissions. Organization ownership does not grant operator access.</p><p>Applications join the existing first-party realm as clients. Realm creation, credentials and sign-in email settings use the private Keycloak console. Its browser access has not yet been verified on this deployment.</p></details>
      <details><summary>Installing and updating AccessLobby</summary><p>Use your browser’s install option. Sign-in and account checks need a connection. Offline mode shows a connection-required page. Finish your account steps and return home to install an available update.</p></details>
    </div>
  </article></PublicShell>;
}
