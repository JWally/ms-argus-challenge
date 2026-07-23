import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestJson, userFacingError } from '../shared/http.js';
import { SsoStatusPage } from './SsoStatusPage.js';

export function MerchantPage() {
  const [parameters] = useSearchParams();
  const started = useRef(false);
  const [outcome, setOutcome] = useState<'approved' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sessionId = parameters.get('session');
    const cpi = parameters.get('cpi');
    if (started.current || parameters.get('complete') !== '1' || !sessionId || !cpi) return;
    started.current = true;
    void requestJson('/api/sso/approval/redeem', {
      method: 'POST',
      body: JSON.stringify({ sessionId, cpi }),
    })
      .then(() => setOutcome('approved'))
      .catch((cause: unknown) => {
        setOutcome('failed');
        setError(userFacingError(cause));
      });
  }, [parameters]);
  return (
    <SsoStatusPage
      step={3}
      title={
        outcome === 'approved'
          ? 'Signed in'
          : outcome === 'failed'
            ? 'Sign-in failed'
            : 'Completing sign-in'
      }
      detail={error ?? (outcome === 'approved' ? 'This device is verified.' : 'One moment…')}
      busy={outcome === null}
    />
  );
}
