import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pairBlobToFragment, type PairBlob } from '../features/phone/phone-binding.js';
import { requestJson, userFacingError } from '../shared/http.js';

export function PairTokenPage() {
  const { token = '' } = useParams();
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
          window.location.replace(`/pair/${blob.sessionId}#${pairBlobToFragment(blob)}`);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
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
  return (
    <main className="phone-shell status-page">
      <div className="brand-mark">
        argus<span>.challenge</span>
      </div>
      {busy && <span className="spinner large" aria-hidden="true" />}
      <h1>{title}</h1>
      <p>{detail}</p>
    </main>
  );
}
