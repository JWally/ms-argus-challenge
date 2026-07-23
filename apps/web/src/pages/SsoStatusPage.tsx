import type { ReactNode } from 'react';

interface SsoStatusPageProps {
  step: 1 | 2 | 3;
  title: string;
  detail: string;
  busy?: boolean;
  action?: ReactNode;
}

export function SsoStatusPage({ step, title, detail, busy = false, action }: SsoStatusPageProps) {
  return (
    <main className="sso-shell">
      <div className="brand-mark">
        argus<span>.challenge</span>
      </div>
      <div className="step-track" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((value) => (
          <span key={value} className={value <= step ? 'active' : ''} />
        ))}
      </div>
      {busy && <span className="spinner large" aria-hidden="true" />}
      <h1>{title}</h1>
      <p>{detail}</p>
      {action}
    </main>
  );
}
