import { ActionForm } from '@/components/action-form';

export function SignOutChoices() {
  return <div className="sign-out-options">
    <section className="surface-card">
      <h2>This app only</h2>
      <p>Sign out here. AccessLobby stays signed in, so returning may sign you in automatically.</p>
      <ActionForm action="/auth/logout" method="post" pendingLabel="Signing out…">
        <input type="hidden" name="scope" value="current" />
        <button className="button button-secondary" type="submit">Sign out of this app</button>
      </ActionForm>
    </section>
    <section className="surface-card">
      <h2>AccessLobby & supported apps</h2>
      <p>End shared sign-in in this browser. Connected apps may take time to sign out.</p>
      <ActionForm action="/auth/logout" method="post" pendingLabel="Signing out…">
        <input type="hidden" name="scope" value="all" />
        <button className="button button-primary" type="submit">Sign out of AccessLobby and supported apps</button>
      </ActionForm>
      <p className="hero-note">This does not sign you out on every device.</p>
    </section>
  </div>;
}
