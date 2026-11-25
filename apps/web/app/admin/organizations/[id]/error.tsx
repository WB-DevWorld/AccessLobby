'use client';

export default function OrganizationInspectionError({ reset }: { reset: () => void }) {
  return <main className="state-page"><section className="state-panel" id="main-content">
    <h1>Organization view could not be loaded</h1>
    <p>No administrative change was made. Try loading the organization record again.</p>
    <button type="button" className="button button-primary" onClick={reset}>Try again</button>
  </section></main>;
}
