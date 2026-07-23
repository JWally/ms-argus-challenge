const CPI = /^argus_cpi_(?:test|live)_[A-Za-z0-9]{10,40}(?:\.(?:fastpass|stepup|forceauth))?$/;
const CHALLENGE = /^[A-Za-z0-9_-]{16,128}$/;

export interface EmbedConfig {
  cpi: string;
  challengeId: string;
  hostOrigin: string | null;
}

function exactOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === value && ['http:', 'https:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function readEmbedConfig(search: string): EmbedConfig | null {
  const parameters = new URLSearchParams(search);
  const cpi = parameters.get('cpi') ?? '';
  const challengeId = parameters.get('challengeId') ?? '';
  const rawOrigin = parameters.get('origin');
  const hostOrigin = exactOrigin(rawOrigin);
  if (!CPI.test(cpi) || !CHALLENGE.test(challengeId) || (rawOrigin && !hostOrigin)) return null;
  return { cpi, challengeId, hostOrigin };
}
