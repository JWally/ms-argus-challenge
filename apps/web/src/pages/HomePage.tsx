import { DEFAULT_CPI } from '../shared/argus.js';

export function HomePage() {
  const openDemo = (): void => {
    const query = new URLSearchParams({
      cpi: `${DEFAULT_CPI}.fastpass`,
      challengeId: crypto.randomUUID(),
    });
    window.location.assign(`/embed?${query.toString()}`);
  };
  return (
    <main className="home-shell">
      <div className="brand-mark">
        argus<span>.challenge</span>
      </div>
      <p className="eyebrow">Device co-attestation</p>
      <h1>
        One human.
        <br />
        Two devices.
      </h1>
      <p>Secure optical pairing with signed browser integrity and a handwriting challenge.</p>
      <button type="button" className="button primary" onClick={openDemo}>
        Run a demo
      </button>
    </main>
  );
}
