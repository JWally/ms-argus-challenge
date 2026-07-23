import { useParams } from 'react-router-dom';
import { DrawingBoard } from '../features/drawing/DrawingBoard.js';
import { usePhoneChallenge } from '../features/phone/use-phone-challenge.js';
import { StatusPage } from './PairTokenPage.js';

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
    return <StatusPage title="All done" detail="Return to the original device to continue." />;
  }
  if (challenge.phase === 'error' || !challenge.session) {
    return (
      <StatusPage
        title="Could not complete"
        detail={challenge.error ?? 'Scan a new code and try again.'}
      />
    );
  }
  return (
    <main className="phone-shell">
      <div className="brand-mark">
        argus<span>.challenge</span>
      </div>
      <DrawingBoard nonce={challenge.session.binding.nonce} onComplete={challenge.finish} />
      <p className="privacy-note">Your drawing stays on this device.</p>
    </main>
  );
}
