import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { SsoProofActions } from '../features/sso/SsoProofActions.js';
import { validationDestination, type SsoValidateResponse } from '../features/sso/sso-client.js';
import { loadSsoState, type SsoBrowserState } from '../features/sso/sso-state.js';
import {
  browserSsoValidation,
  isGoogleConfigured,
  type SsoProofChoice,
} from '../features/sso/sso-validation.js';
import { userFacingError } from '../shared/http.js';
import { SsoStatusPage } from './SsoStatusPage.js';

interface ValidationView {
  error: string | null;
  needsProof: boolean;
  validating: boolean;
  passkeySeen: boolean;
}

type SetValidationView = Dispatch<SetStateAction<ValidationView>>;

function useInitialValidation(
  state: SsoBrowserState | null,
  returnCode: string,
  finish: (result: SsoValidateResponse) => void,
  setView: SetValidationView
): void {
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !state || !returnCode) return;
    started.current = true;
    let cancelled = false;
    void browserSsoValidation
      .validateInitial(state, returnCode)
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.kind === 'validated') finish(outcome.result);
        else
          setView({
            error: null,
            needsProof: true,
            validating: false,
            passkeySeen: outcome.passkeySeen,
          });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setView((current) => ({
          ...current,
          error: userFacingError(cause),
          validating: false,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [finish, returnCode, setView, state]);
}

async function runProof(
  state: SsoBrowserState,
  returnCode: string,
  choice: SsoProofChoice,
  finish: (result: SsoValidateResponse) => void,
  setView: SetValidationView
): Promise<void> {
  setView((current) => ({ ...current, validating: true, error: null }));
  const outcome = await browserSsoValidation.validateProof(state, returnCode, choice);
  if (outcome.kind === 'validated') finish(outcome.result);
  else
    setView({
      error: 'That verification did not complete. Try another option.',
      needsProof: true,
      validating: false,
      passkeySeen: outcome.passkeySeen,
    });
}

function validationCopy(view: ValidationView, missing: boolean) {
  const title = missing
    ? 'Sign-in needs attention'
    : view.needsProof
      ? 'Confirm your identity'
      : view.error
        ? 'Automatic return unavailable'
        : 'Completing secure check';
  const detail = missing
    ? 'The secure return material is missing.'
    : view.needsProof
      ? view.error
        ? 'That verification did not complete. Try another option.'
        : 'Choose a verification method to continue.'
      : view.error
        ? 'Use the button below to continue back.'
        : 'This usually takes only a moment.';
  return { title, detail };
}

function useValidationController() {
  const [parameters] = useSearchParams();
  const sessionId = parameters.get('session') ?? '';
  const returnCode = parameters.get('code') ?? '';
  const state = useMemo(() => loadSsoState(sessionId), [sessionId]);
  const [view, setView] = useState<ValidationView>({
    error: null,
    needsProof: false,
    validating: Boolean(state && returnCode),
    passkeySeen: false,
  });
  const finish = useCallback(
    (result: SsoValidateResponse) => {
      if (state) window.location.replace(validationDestination(state, result));
    },
    [state]
  );
  useInitialValidation(state, returnCode, finish, setView);
  const prove = useCallback(
    (choice: SsoProofChoice) => {
      if (state && !view.validating) void runProof(state, returnCode, choice, finish, setView);
    },
    [finish, returnCode, state, view.validating]
  );
  return { state, view, prove, missing: !state || !returnCode };
}

function ValidationAction({
  controller,
}: {
  controller: ReturnType<typeof useValidationController>;
}) {
  const { state, view, prove } = controller;
  if (view.needsProof) {
    return (
      <SsoProofActions
        busy={view.validating}
        passkeySeen={view.passkeySeen}
        googleConfigured={isGoogleConfigured}
        onChoose={prove}
      />
    );
  }
  if (!view.error || !state) return null;
  return (
    <button
      type="button"
      className="merchant-done sso-return-action"
      onClick={() => window.location.assign(state.failureReturnUrl)}
    >
      RETURN
    </button>
  );
}

export function SsoValidatePage() {
  const controller = useValidationController();
  const copy = validationCopy(controller.view, controller.missing);
  return (
    <SsoStatusPage
      step={3}
      title={copy.title}
      detail={copy.detail}
      busy={controller.view.validating}
      action={<ValidationAction controller={controller} />}
    />
  );
}
