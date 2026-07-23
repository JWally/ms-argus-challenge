import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MerchantWordmark } from '../components/Brand.js';
import { CheckIcon, CloseIcon, ShieldIcon } from '../components/Icons.js';
import { defaultSsoCpi, redeemSsoApproval, startSso } from '../features/sso/sso-client.js';
import { userFacingError } from '../shared/http.js';

type MerchantStatus = 'idle' | 'profiling' | 'redeeming' | 'approved' | 'error';
type DemoAssurance = 'fastpass' | 'stepup' | 'forceauth';

function merchantSessionId(): string {
  const existing = sessionStorage.getItem('argus-challenge:merchant-session');
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem('argus-challenge:merchant-session', created);
  return created;
}

function demoCpi(requested: string | null): string {
  const assurance: DemoAssurance =
    requested === 'fastpass' || requested === 'forceauth' ? requested : 'stepup';
  return defaultSsoCpi().replace(/\.stepup$/, `.${assurance}`);
}

function MerchantOutcome({ status, error }: { status: MerchantStatus; error: string | null }) {
  const approved = status === 'approved';
  const failed = status === 'error';
  return (
    <div className="merchant-result" aria-live="polite">
      <span
        className={`merchant-result-icon${approved ? ' is-approved' : ''}${failed ? ' is-failed' : ''}`}
      >
        {approved ? <CheckIcon /> : failed ? <CloseIcon /> : <span className="spinner" />}
      </span>
      <p className="merchant-eyebrow">Site response</p>
      <h1>
        {approved
          ? 'Session is Valid'
          : failed
            ? 'Session could not be confirmed'
            : 'Confirming session'}
      </h1>
      <p className={approved ? 'merchant-approved' : 'merchant-copy'}>
        {approved ? 'approved' : (error ?? 'redeeming approval')}
      </p>
      {(approved || failed) && (
        <a className="merchant-done" href="/">
          DONE
        </a>
      )}
    </div>
  );
}

interface MerchantDemo {
  status: MerchantStatus;
  error: string | null;
  showOutcome: boolean;
  begin(): Promise<void>;
}

function merchantReturn(parameters: URLSearchParams) {
  const failed = parameters.get('status') === 'failed';
  return {
    failed,
    returning: parameters.get('complete') === '1' || failed,
    sessionId: parameters.get('session'),
    cpi: parameters.get('cpi'),
  };
}

function useMerchantDemo(): MerchantDemo {
  const navigate = useNavigate();
  const [parameters] = useSearchParams();
  const returned = merchantReturn(parameters);
  const cpi = demoCpi(parameters.get('assurance'));
  const challengeId = useMemo(merchantSessionId, []);
  const [status, setStatus] = useState<MerchantStatus>(
    returned.failed ? 'error' : returned.returning ? 'redeeming' : 'idle'
  );
  const [error, setError] = useState<string | null>(
    returned.failed ? 'This phone did not pass the secure check.' : null
  );

  useEffect(() => {
    if (!returned.returning || returned.failed) return;
    if (!returned.sessionId || !returned.cpi) {
      queueMicrotask(() => {
        setStatus('error');
        setError('The secure approval binding is missing.');
      });
      return;
    }
    let cancelled = false;
    void redeemSsoApproval(returned.sessionId, returned.cpi)
      .then(() => {
        if (cancelled) return;
        sessionStorage.removeItem('argus-challenge:merchant-session');
        setStatus('approved');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(userFacingError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [returned.cpi, returned.failed, returned.returning, returned.sessionId]);

  const begin = async (): Promise<void> => {
    setStatus('profiling');
    setError(null);
    try {
      const session = await startSso({ cpi, challengeId });
      void navigate(session.challengeUrl);
    } catch (cause) {
      setStatus('error');
      setError(userFacingError(cause));
    }
  };

  return {
    status,
    error,
    showOutcome: returned.returning || status === 'approved' || status === 'error',
    begin,
  };
}

function MerchantIntro({ status, begin }: Pick<MerchantDemo, 'status' | 'begin'>) {
  return (
    <>
      <p className="merchant-eyebrow">Single sign-on</p>
      <h1>Try the SSO demo</h1>
      <p className="merchant-copy">
        No account or sign-in is required. Argus will check this phone, then return you here
        automatically.
      </p>
      <button
        type="button"
        className="merchant-primary"
        disabled={status === 'profiling'}
        onClick={() => void begin()}
      >
        {status === 'profiling' ? 'Opening Argus...' : 'Run demo'}
      </button>
    </>
  );
}

export function MerchantPage() {
  const demo = useMerchantDemo();
  return (
    <div className="merchant-page">
      <div className="merchant-layout">
        <header className="merchant-header">
          <MerchantWordmark />
          <span className="merchant-secured">
            <ShieldIcon /> Secured by Argus
          </span>
        </header>
        <main className="merchant-main">
          <section className="merchant-card">
            {demo.showOutcome ? (
              <MerchantOutcome status={demo.status} error={demo.error} />
            ) : (
              <MerchantIntro status={demo.status} begin={demo.begin} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
