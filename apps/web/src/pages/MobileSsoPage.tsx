import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startSso } from '../features/sso/sso-client.js';
import { userFacingError } from '../shared/http.js';
import { SsoStatusPage } from './SsoStatusPage.js';

export function MobileSsoPage() {
  const navigate = useNavigate();
  const [parameters] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const returnUrl = parameters.get('returnUrl');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const cpi = parameters.get('cpi');
    const challengeId = parameters.get('challengeId');
    if (!cpi || !challengeId || !returnUrl) {
      queueMicrotask(() => setError('The sign-in link is incomplete.'));
      return;
    }
    let cancelled = false;
    void startSso({ cpi, challengeId, callbackUrl: returnUrl })
      .then((state) => {
        if (!cancelled) void navigate(state.challengeUrl, { replace: true });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, parameters, returnUrl]);

  return (
    <SsoStatusPage
      step={1}
      title={error ? 'Could not start sign-in' : 'Checking this device'}
      detail={error ?? 'This usually takes only a moment.'}
      busy={!error}
      action={
        error ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => (returnUrl ? window.location.assign(returnUrl) : window.history.back())}
          >
            Return to site
          </button>
        ) : undefined
      }
    />
  );
}
