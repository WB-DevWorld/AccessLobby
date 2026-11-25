import Link from 'next/link';
import { SurfaceCard } from '@/components/ui';
import { getAdminContext } from '@/lib/admin';
import { AdminAccessState, AdminFrame, adminMetadata } from './_components';

export const dynamic = 'force-dynamic';
export const metadata = adminMetadata;

export default async function AdminOverview() {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  return <AdminFrame active="overview" title="Operator console" description="Review platform records and first-party application requests.">
    <p>Your operator access is checked against current database grants on every request. {context.access.capabilities.reviewApplications ? 'You can read records and review application requests.' : 'You can read records. Application decisions require a reviewer grant.'}</p>
    <section className="context-grid" aria-label="Operator tasks">
      <SurfaceCard title="People and organizations"><p>Find a durable AccessLobby identity, see its status, and inspect organization records and membership counts.</p>
        <div className="context-actions"><Link className="button button-secondary" href="/admin/people">Find a person</Link><Link className="text-link" href="/admin/organizations">Browse organizations</Link></div>
        <p className="hero-note">These records are read-only here. Application roles, orders and other local information stay in each application.</p></SurfaceCard>
      <SurfaceCard title="Application review"><p>Inspect requests across owners, check exact callback and logout configuration, and record an independent first-party review.</p>
        <Link className="button button-primary" href="/admin/applications">Review applications</Link>
        <p className="hero-note">Approval records a decision. The private activation process still checks live domain proof and Keycloak configuration before entry is enabled.</p></SurfaceCard>
      <SurfaceCard title="Operator history"><p>Inspect recorded operator grants, revocations and application review decisions.</p><Link className="button button-secondary" href="/admin/audit">View operator history</Link>
        <p className="hero-note">Organization events, IAM events and each application’s own audit records remain in their respective systems.</p></SurfaceCard>
    </section>
    <SurfaceCard title="Realms and authentication administration">
      <p>The current environment uses the <code>accesslobby-first-party</code> realm. A connected application receives a client inside that realm. Creating an AccessLobby organization does not create a realm.</p>
      <p>Realm creation, credentials, authentication policy and SMTP settings belong to Keycloak’s private Admin Console or protected operator tooling. This deployment has no verified private browser-console address listed here.</p>
      <p>Use the configured private operator route for those tasks. Realm creation is not available in this AccessLobby console. A separate trust domain requires its own issuer and identity-mapping decision.</p>
    </SurfaceCard>
  </AdminFrame>;
}
