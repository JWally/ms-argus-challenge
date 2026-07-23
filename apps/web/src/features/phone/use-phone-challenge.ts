import { useEffect, useRef, useState } from 'react';
import { userFacingError } from '../../shared/http.js';
import { startPhoneSession, type PhoneSession } from './phone-session.js';
import { submitPhoneChallenge } from './phone-submit.js';

type PhoneChallengePhase = 'connecting' | 'drawing' | 'submitting' | 'complete' | 'error';

export function usePhoneChallenge(sessionId: string) {
  const session = useRef<PhoneSession | null>(null);
  const [phase, setPhase] = useState<PhoneChallengePhase>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void startPhoneSession(sessionId)
      .then((ready) => {
        if (cancelled) {
          ready.connection.close();
          return;
        }
        session.current = ready;
        setPhase('drawing');
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(userFacingError(cause));
          setPhase('error');
        }
      });
    return () => {
      cancelled = true;
      session.current?.connection.close();
    };
  }, [sessionId]);

  const finish = (): void => {
    if (!session.current || phase !== 'drawing') return;
    setPhase('submitting');
    void submitPhoneChallenge(session.current)
      .then(() => {
        setPhase('complete');
        window.setTimeout(() => session.current?.connection.close(), 500);
      })
      .catch((cause: unknown) => {
        setError(userFacingError(cause));
        setPhase('error');
      });
  };

  return { session: session.current, phase, error, finish };
}
