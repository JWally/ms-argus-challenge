import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DrawingBoard } from '../features/drawing/DrawingBoard.js';
import { dismissCompletedPhonePage } from '../features/phone/phone-page-exit.js';
import { usePhoneChallenge } from '../features/phone/use-phone-challenge.js';
import { StatusPage } from './PairTokenPage.js';

function CompletedPhonePage() {
  useEffect(() => dismissCompletedPhonePage(window), []);
  return <StatusPage title="All done" detail="Closing this page…" />;
}

export function PhonePage() {
  const { sessionId = '' } = useParams();
  const challenge = usePhoneChallenge(sessionId);

  if (challenge.phase === 'connecting') {
    return <StatusPage title="Connecting securely" detail="Keep this page open." busy />;
  }
  if (challenge.phase === 'submitting') {
    return <StatusPage title="Verifying" detail="Confirm your device if prompted." busy />;
  }
  if (challenge.phase === 'complete') {
    return <CompletedPhonePage />;
  }
  if (challenge.phase === 'error' || !challenge.session) {
    return (
      <StatusPage
        title="Could not complete"
        detail={challenge.error ?? 'Scan a new code and try again.'}
      />
    );
  }
  return <DrawingBoard nonce={challenge.session.binding.nonce} onComplete={challenge.finish} />;
}
