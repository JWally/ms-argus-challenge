import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateSso, validationDestination } from '../features/sso/sso-client.js';
import { loadSsoState } from '../features/sso/sso-state.js';
import { userFacingError } from '../shared/http.js';
import { SsoStatusPage } from './SsoStatusPage.js';

export function SsoValidatePage() {
  const [parameters] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = parameters.get('session') ?? '';
  const returnCode = parameters.get('code') ?? '';
  const state = useMemo(() => loadSsoState(sessionId), [sessionId]);

  useEffect(() => {
    if (started.current || !state || !returnCode) return;
    started.current = true;
    let cancelled = false;
    void validateSso(state, returnCode)
      .then((result) => {
        if (!cancelled) window.location.replace(validationDestination(state, result));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [returnCode, state]);

  const message = state && returnCode ? error : 'The secure return material is missing.';
  return (
    <SsoStatusPage
      step={3}
      title={message ? 'Sign-in needs attention' : 'Finishing sign-in'}
      detail={message ?? 'Confirm your device if prompted.'}
      busy={!message}
      action={
        message && state ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => window.location.assign(state.failureReturnUrl)}
          >
            Return to site
          </button>
        ) : undefined
      }
    />
  );
}
