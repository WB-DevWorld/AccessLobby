import Link from 'next/link';
import { SurfaceCard } from '@/components/ui';
import { getAdminContext } from '@/lib/admin';
import { AdminAccessState, AdminFrame, adminMetadata } from './_components';

export const dynamic = 'force-dynamic';
export const metadata = adminMetadata;

export default async function AdminOverview() {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  return <AdminFrame active="overview" title="Operator console" description="Manage people and connected apps.">
    <section aria-label="Operator permissions"><p>
      {context.access.capabilities.reviewApplications && 'You can review application requests. '}
      {context.access.capabilities.managePeople && 'You can manage person status. '}
      {context.access.capabilities.activateApplications && 'You can request and retry reviewed activations.'}
      {!context.access.capabilities.reviewApplications && !context.access.capabilities.managePeople && !context.access.capabilities.activateApplications && 'Read-only access.'}
    </p></section>
    <section className="context-grid" aria-label="Operator tasks">
      <SurfaceCard title="People and organizations"><p>Find people and view organization records.</p>
        <div className="context-actions"><Link className="button button-secondary" href="/admin/people">Find a person</Link><Link className="text-link" href="/admin/organizations">Browse organizations</Link></div>
      </SurfaceCard>
      <SurfaceCard title="Application review"><p>Check requests and record first-party decisions.</p>
        <Link className="button button-primary" href="/admin/applications">Review applications</Link></SurfaceCard>
      <SurfaceCard title="Operator history"><p>View operator changes and review decisions.</p><Link className="button button-secondary" href="/admin/audit">View operator history</Link></SurfaceCard>
      <SurfaceCard title="Activation progress"><p>Track application activation requests.</p>
        <Link className="button button-secondary" href="/admin/activations">View activation progress</Link></SurfaceCard>
    </section>
    <SurfaceCard title="Realms and sign-in settings">
      <p>Use private Keycloak administration for realm and sign-in settings. Its browser access has not been verified.</p>
      <details className="information-details"><summary>Realm details</summary>
        <p>This environment uses <code>accesslobby-first-party</code>. Connected apps receive clients within it; organizations do not create realms.</p>
        <p>Realm creation, credentials, authentication policy and email settings require private administration. Additional trust domains need separate setup.</p>
      </details>
    </SurfaceCard>
  </AdminFrame>;
}
