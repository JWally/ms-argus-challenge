import type { ReactNode } from 'react';
import { Wordmark } from '../components/Brand.js';

interface SsoStatusPageProps {
  step: 1 | 2 | 3;
  title: string;
  detail: string;
  busy?: boolean;
  action?: ReactNode;
}

const STAGES = [1, 2, 3] as const;

export function SsoStatusPage({ step, title, detail, busy = false, action }: SsoStatusPageProps) {
  return (
    <div className="argus-page">
      <div className="argus-layout">
        <header className="argus-header">
          <Wordmark product="Pair" />
          <span className="pill">Secure check</span>
        </header>
        <main className="argus-main">
          <section className="sso-status-shell" aria-live="polite">
            <div className="sso-stage-counter" aria-label={`Step ${step} of 3`}>
              <span className="sso-stage-value">{4 - step}</span>
            </div>
            <ol className="sso-progress" aria-hidden="true">
              {STAGES.map((stage) => (
                <li
                  className={`sso-progress-step${stage < step ? ' is-complete' : ''}${stage === step ? ' is-current' : ''}`}
                  key={stage}
                >
                  <span />
                </li>
              ))}
            </ol>
            <div className="sso-label">Argus</div>
            <h1>Secure session check</h1>
            <div className="sso-status-line">
              {busy && <span className="spinner" aria-hidden="true" />}
              <h2>{title}</h2>
            </div>
            <p className="sso-status-detail">{detail}</p>
            {action}
          </section>
        </main>
      </div>
    </div>
  );
}
