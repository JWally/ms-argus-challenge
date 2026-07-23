import { withDeadline } from './deadline.js';

const PURPOSE = 'argus-pair-v1';
const BOOTSTRAP_TIMEOUT_MS = 15_000;
const SCAN_TIMEOUT_MS = 30_000;

export const DEFAULT_CPI =
  import.meta.env.VITE_MERCHANT_CPI ?? 'argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB';

export interface ArgusAttestation {
  envelope: string;
  signature: string;
  publicKey: string;
  keyId: string;
}

interface ArgusRunResult {
  sessionId: string | null;
  argusSessionId: string;
  durationMs: number;
  attestation?: ArgusAttestation | null;
  attestError?: string | null;
}

interface ArgusClient {
  run(options: {
    cpi: string;
    timeoutMs: number;
    attest: { purpose: string; ttlSeconds: number; payload: Record<string, unknown> };
  }): Promise<ArgusRunResult>;
}

interface ArgusWindow extends Window {
  argus?: ArgusClient;
  argusBootstrapReady?: Promise<void>;
}

export interface AttestedScan {
  argusSessionId: string;
  attestation: ArgusAttestation;
}

export function baseIntegrityCpi(cpi: string): string {
  return cpi.replace(/\.(?:fastpass|stepup|forceauth)$/, '');
}

export function requireAttestedScan(result: ArgusRunResult): AttestedScan {
  if (!result.attestation) throw new Error('argus_attestation_failed');
  return { argusSessionId: result.argusSessionId, attestation: result.attestation };
}

async function client(): Promise<ArgusClient> {
  const browser = window as ArgusWindow;
  await withDeadline(
    browser.argusBootstrapReady ?? Promise.resolve(),
    BOOTSTRAP_TIMEOUT_MS,
    'argus_bootstrap'
  );
  if (!browser.argus) throw new Error('argus_sdk_unavailable');
  return browser.argus;
}

export async function runAttestedScan(input: {
  cpi: string;
  payload: Record<string, unknown>;
}): Promise<AttestedScan> {
  const sdk = await client();
  const result = await withDeadline(
    sdk.run({
      cpi: baseIntegrityCpi(input.cpi),
      timeoutMs: SCAN_TIMEOUT_MS,
      attest: { purpose: PURPOSE, ttlSeconds: 120, payload: input.payload },
    }),
    SCAN_TIMEOUT_MS + 1_000,
    'argus_scan'
  );
  return requireAttestedScan(result);
}
