export type CpiScope = 'integrity' | 'fastpass' | 'stepup' | 'forceauth';

export interface ScopedCpi {
  cpi: string;
  scope: CpiScope;
  proofRequired: boolean;
  freshProofRequired: boolean;
}

const SCOPED_CPI_PATTERN =
  /^(argus_cpi_(?:test|live)_[A-Za-z0-9]{10,40})(?:\.(fastpass|stepup|forceauth))?$/;

function scopeFromSuffix(suffix: string | undefined): CpiScope {
  if (suffix === 'stepup') return 'stepup';
  if (suffix === 'forceauth') return 'forceauth';
  if (suffix === 'fastpass') return 'fastpass';
  return 'integrity';
}

export function parseScopedCpi(value: unknown): ScopedCpi | null {
  if (typeof value !== 'string') return null;
  const match = SCOPED_CPI_PATTERN.exec(value);
  if (!match) return null;
  const scope = scopeFromSuffix(match[2]);
  return {
    cpi: value,
    scope,
    proofRequired: scope === 'stepup' || scope === 'forceauth',
    freshProofRequired: scope === 'forceauth',
  };
}

export function requiresProofOfLife(
  scopedCpi: ScopedCpi | null,
  globalRequirement: boolean
): boolean {
  return globalRequirement || scopedCpi?.proofRequired === true;
}
