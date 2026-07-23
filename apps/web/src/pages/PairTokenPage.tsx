import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wordmark } from '../components/Brand.js';
import { pairBlobToFragment, type PairBlob } from '../features/phone/phone-binding.js';
import { requestJson, userFacingError } from '../shared/http.js';

export function PairTokenPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void requestJson<PairBlob>('/api/pair-token/redeem', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((blob) => {
        if (!cancelled)
          void navigate(`/pair/${blob.sessionId}#${pairBlobToFragment(blob)}`, { replace: true });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, token]);
  return (
    <StatusPage
      title={error ? 'Link unavailable' : 'Opening challenge'}
      detail={error ?? 'One moment…'}
      busy={!error}
    />
  );
}

interface StatusPageProps {
  title: string;
  detail: string;
  busy?: boolean;
}

export function StatusPage({ title, detail, busy = false }: StatusPageProps) {
  const failed = /could not|unavailable|failed/i.test(title);
  const complete = /all done|verified/i.test(title);
  return (
    <div className="phone-panel-page">
      <div className="phone-panel-layout">
        <header className="phone-panel-header">
          <Wordmark product="Pair" />
          <span className="pill">Phone</span>
        </header>
        <main className="phone-panel-main" aria-live="polite">
          <span
            className={`phone-panel-icon${busy ? ' busy' : ''}${failed ? ' error' : ''}${complete ? ' success' : ''}`}
            aria-hidden="true"
          >
            {complete ? '✓' : failed ? '×' : '◆'}
          </span>
          <h1>{title}</h1>
          <p>{detail}</p>
          {busy && (
            <span className="phone-panel-status">
              <span className="spinner" aria-hidden="true" /> Working securely
            </span>
          )}
        </main>
      </div>
    </div>
  );
}
