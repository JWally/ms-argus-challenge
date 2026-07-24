import type { SsoProofChoice } from './sso-validation.js';

interface SsoProofActionsProps {
  busy: boolean;
  googleConfigured: boolean;
  onChoose(choice: SsoProofChoice): void;
}

export function SsoProofActions({ busy, googleConfigured, onChoose }: SsoProofActionsProps) {
  return (
    <div className="sso-proof-actions">
      <button
        type="button"
        className="merchant-primary"
        disabled={busy}
        onClick={() => onChoose('passkey-auth')}
      >
        Use passkey
      </button>
      <button
        type="button"
        className="merchant-secondary"
        disabled={busy}
        onClick={() => onChoose('passkey-create')}
      >
        Create passkey
      </button>
      {googleConfigured && (
        <button
          type="button"
          className="merchant-secondary"
          disabled={busy}
          onClick={() => onChoose('google')}
        >
          Continue with Google
        </button>
      )}
    </div>
  );
}
