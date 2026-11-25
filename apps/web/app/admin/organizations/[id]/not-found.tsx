import Link from 'next/link';

export default function OrganizationNotFound() {
  return <main className="state-page"><section className="state-panel" id="main-content">
    <h1>Organization not found</h1><p>No organization record was found at this address.</p>
    <Link className="button button-secondary" href="/admin/organizations">Back to organizations</Link>
  </section></main>;
}
