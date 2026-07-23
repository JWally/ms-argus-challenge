export interface GoogleProof {
  provider: 'google';
  token: string;
}

export interface GoogleProofError {
  provider: 'google';
  error: string;
}

export type GoogleProofOutcome = GoogleProof | GoogleProofError;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID ?? '';
const PROMPT_TIMEOUT_MS = 60_000;

export const isGoogleConfigured = GOOGLE_CLIENT_ID.length > 0;

interface GoogleIdentity {
  initialize(config: {
    client_id: string;
    nonce: string;
    callback(response: { credential?: string }): void;
    auto_select: boolean;
    use_fedcm_for_prompt: boolean;
    context: 'signin';
  }): void;
  prompt(
    callback: (notification: {
      isNotDisplayed?(): boolean;
      getNotDisplayedReason?(): string;
      isSkippedMoment?(): boolean;
      getSkippedReason?(): string;
    }) => void
  ): void;
  cancel(): void;
}

interface GoogleWindow extends Window {
  google?: { accounts?: { id?: GoogleIdentity } };
}

async function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const browser = window as GoogleWindow;
  if (!browser.google) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('gsi_load_failed')), { once: true });
      document.head.appendChild(script);
    });
  }
  const identity = browser.google?.accounts?.id;
  if (!identity) throw new Error('gsi_namespace_missing');
  return identity;
}

export async function runGoogleProof(nonce: string): Promise<GoogleProofOutcome> {
  if (!isGoogleConfigured) return { provider: 'google', error: 'google_not_configured' };
  let identity: GoogleIdentity;
  try {
    identity = await loadGoogleIdentity();
  } catch (error) {
    return {
      provider: 'google',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: GoogleProofOutcome): void => {
      if (settled) return;
      settled = true;
      try {
        identity.cancel();
      } catch {
        // GIS may already have closed the prompt.
      }
      resolve(outcome);
    };
    const timer = window.setTimeout(
      () => finish({ provider: 'google', error: 'prompt_timeout' }),
      PROMPT_TIMEOUT_MS
    );
    identity.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce,
      auto_select: false,
      use_fedcm_for_prompt: true,
      context: 'signin',
      callback(response) {
        window.clearTimeout(timer);
        finish(
          response.credential
            ? { provider: 'google', token: response.credential }
            : { provider: 'google', error: 'no_credential' }
        );
      },
    });
    identity.prompt((notification) => {
      if (notification.isNotDisplayed?.()) {
        window.clearTimeout(timer);
        finish({
          provider: 'google',
          error: `prompt_not_displayed:${notification.getNotDisplayedReason?.() ?? 'unknown'}`,
        });
      } else if (notification.isSkippedMoment?.()) {
        window.clearTimeout(timer);
        finish({
          provider: 'google',
          error: `prompt_skipped:${notification.getSkippedReason?.() ?? 'unknown'}`,
        });
      }
    });
  });
}
