import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { completeSsoChallenge } from '../features/sso/sso-client.js';
import { loadSsoState } from '../features/sso/sso-state.js';
import { userFacingError } from '../shared/http.js';
import { SsoStatusPage } from './SsoStatusPage.js';

export function SsoChallengePage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const state = useMemo(() => loadSsoState(sessionId), [sessionId]);

  useEffect(() => {
    if (started.current || !state) return;
    started.current = true;
    let cancelled = false;
    void completeSsoChallenge(state)
      .then((result) => {
        if (!cancelled) void navigate(result.returnUrl, { replace: true });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, state]);

  const message = state ? error : 'This sign-in no longer has local session state.';
  return (
    <SsoStatusPage
      step={2}
      title={message ? 'Could not confirm session' : 'Confirming this session'}
      detail={message ?? 'You will return automatically.'}
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
