import { Wordmark } from '../components/Brand.js';
import { DEFAULT_CPI } from '../shared/argus.js';

export function HomePage() {
  const openPairing = (): void => {
    const query = new URLSearchParams({
      cpi: `${DEFAULT_CPI}.fastpass`,
      challengeId: crypto.randomUUID(),
    });
    window.location.assign(`/embed?${query.toString()}`);
  };
  const openSso = (): void => {
    window.location.assign('/merchant');
  };
  return (
    <div className="home-page">
      <header className="home-header">
        <Wordmark />
        <span className="pill">Secure challenge</span>
      </header>
      <main className="home-shell">
        <p className="eyebrow">Device co-attestation</p>
        <h1 className="desktop-home-copy">
          One human.
          <br />
          Two devices.
        </h1>
        <h1 className="mobile-home-copy">
          Secure sign-in.
          <br />
          This phone.
        </h1>
        <p>
          Secure optical pairing and mobile sign-in with signed browser integrity and a handwriting
          challenge.
        </p>
        <button type="button" className="button primary pairing-action" onClick={openPairing}>
          Run pairing demo
        </button>
        <button type="button" className="button primary sso-action" onClick={openSso}>
          Use mobile SSO
        </button>
      </main>
    </div>
  );
}
