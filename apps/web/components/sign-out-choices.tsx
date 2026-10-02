import { ActionForm } from '@/components/action-form';

export function SignOutChoices() {
  return <div className="sign-out-options">
    <section className="surface-card">
      <h2>This app only</h2>
      <p>End your session here. Your shared AccessLobby sign-in stays active, so returning may sign you in without asking for your password.</p>
      <ActionForm action="/auth/logout" method="post" pendingLabel="Signing out…">
        <input type="hidden" name="scope" value="current" />
        <button className="button button-secondary" type="submit">Sign out of this app</button>
      </ActionForm>
    </section>
    <section className="surface-card">
      <h2>AccessLobby & supported apps</h2>
      <p>End the shared sign-in session in this browser. Some apps may keep a separate local session until they receive or process the shared sign-out.</p>
      <ActionForm action="/auth/logout" method="post" pendingLabel="Signing out…">
        <input type="hidden" name="scope" value="all" />
        <button className="button button-primary" type="submit">Sign out of AccessLobby and supported apps</button>
      </ActionForm>
      <p className="hero-note">This does not sign you out on every device.</p>
    </section>
  </div>;
}
