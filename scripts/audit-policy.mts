import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MINIMUM_SEVERITY = 2;
const SEVERITY_RANKS = new Map([
  ['info', 0],
  ['low', 1],
  ['moderate', 2],
  ['high', 3],
  ['critical', 4],
]);

interface AuditException {
  packageName: string;
  url: string;
  expiresAt: Date;
  reason: string;
  allowedNodes?: readonly string[];
}

const AUDIT_EXCEPTIONS: readonly AuditException[] = [
  {
    packageName: 'react-router',
    url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    reason: 'Challenge uses the stable browser SPA APIs, not React Server Components',
  },
  {
    packageName: 'brace-expansion',
    url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895',
    expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    reason:
      'The latest aws-cdk-lib bundles the vulnerable version for trusted infrastructure synthesis; exception expires 2026-08-22',
    allowedNodes: ['node_modules/aws-cdk-lib/node_modules/brace-expansion'],
  },
];

interface AdvisoryEvidence {
  packageName?: string;
  url?: string;
}

export interface AuditFinding {
  packageName: string;
  severity: string;
  advisoryUrls: string[];
  reason: string;
}

export interface AuditDecision {
  accepted: AuditFinding[];
  blocked: AuditFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getVulnerabilities(report: unknown): Record<string, unknown> | undefined {
  if (!isRecord(report) || !isRecord(report.vulnerabilities)) {
    return undefined;
  }

  return report.vulnerabilities;
}

function getSeverity(vulnerability: unknown): string {
  if (!isRecord(vulnerability) || typeof vulnerability.severity !== 'string') {
    return 'unknown';
  }

  return vulnerability.severity;
}

function getVia(vulnerability: unknown): readonly unknown[] {
  if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) {
    return [];
  }

  return vulnerability.via;
}

function advisoryEvidence(value: Record<string, unknown>): AdvisoryEvidence {
  return {
    ...(typeof value.name === 'string' ? { packageName: value.name } : {}),
    ...(typeof value.url === 'string' ? { url: value.url } : {}),
  };
}

function collectEvidence(
  packageName: string,
  vulnerabilities: Record<string, unknown>,
  visited: ReadonlySet<string> = new Set()
): AdvisoryEvidence[] {
  if (visited.has(packageName)) {
    return [{}];
  }

  const nextVisited = new Set(visited).add(packageName);
  const via = getVia(vulnerabilities[packageName]);

  return via.flatMap((entry) => {
    if (typeof entry === 'string') {
      return vulnerabilities[entry] === undefined
        ? [{}]
        : collectEvidence(entry, vulnerabilities, nextVisited);
    }

    return isRecord(entry) ? [advisoryEvidence(entry)] : [{}];
  });
}

function getNodes(vulnerability: unknown): readonly string[] {
  if (!isRecord(vulnerability) || !Array.isArray(vulnerability.nodes)) {
    return [];
  }

  return vulnerability.nodes.filter((node): node is string => typeof node === 'string');
}

function hasOnlyAllowedNodes(
  vulnerability: unknown,
  allowedNodes: readonly string[] | undefined
): boolean {
  if (allowedNodes === undefined) {
    return true;
  }

  const vulnerabilityNodes = getNodes(vulnerability);
  return (
    vulnerabilityNodes.length === allowedNodes.length &&
    vulnerabilityNodes.every((node) => allowedNodes.includes(node))
  );
}

function matchingException(
  evidence: AdvisoryEvidence,
  vulnerability: unknown,
  now: Date
): AuditException | undefined {
  return AUDIT_EXCEPTIONS.find(
    (exception) =>
      evidence.packageName === exception.packageName &&
      evidence.url === exception.url &&
      now.getTime() < exception.expiresAt.getTime() &&
      hasOnlyAllowedNodes(vulnerability, exception.allowedNodes)
  );
}

function uniqueUrls(evidence: readonly AdvisoryEvidence[]): string[] {
  return [...new Set(evidence.flatMap(({ url }) => (url === undefined ? [] : [url])))];
}

function finding(
  packageName: string,
  vulnerability: unknown,
  evidence: readonly AdvisoryEvidence[],
  reason: string
): AuditFinding {
  return {
    packageName,
    severity: getSeverity(vulnerability),
    advisoryUrls: uniqueUrls(evidence),
    reason,
  };
}

export function evaluateAuditReport(report: unknown, now = new Date()): AuditDecision {
  const vulnerabilities = getVulnerabilities(report);
  if (vulnerabilities === undefined) {
    return {
      accepted: [],
      blocked: [
        {
          packageName: 'audit-report',
          severity: 'unknown',
          advisoryUrls: [],
          reason: 'missing vulnerabilities map',
        },
      ],
    };
  }

  const decision: AuditDecision = { accepted: [], blocked: [] };

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const severity = getSeverity(vulnerability);
    if ((SEVERITY_RANKS.get(severity) ?? Number.POSITIVE_INFINITY) < MINIMUM_SEVERITY) {
      continue;
    }

    const evidence = collectEvidence(packageName, vulnerabilities);
    const matchedExceptions = evidence.map((item) => matchingException(item, vulnerability, now));
    if (evidence.length > 0 && matchedExceptions.every((exception) => exception !== undefined)) {
      const reasons = [
        ...new Set(
          matchedExceptions.flatMap((exception) =>
            exception === undefined ? [] : [exception.reason]
          )
        ),
      ];
      decision.accepted.push(finding(packageName, vulnerability, evidence, reasons.join('; ')));
      continue;
    }

    decision.blocked.push(
      finding(packageName, vulnerability, evidence, 'not covered by the narrow audit exception')
    );
  }

  return decision;
}

function formatFinding(item: AuditFinding): string {
  const advisories = item.advisoryUrls.length > 0 ? item.advisoryUrls.join(', ') : 'unresolved';
  return `- ${item.packageName} (${item.severity}): ${advisories}`;
}

function runAudit(): number {
  const audit = spawnSync('npm', ['audit', '--json', '--audit-level=moderate'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (audit.error !== undefined) {
    process.stderr.write(`Could not run npm audit: ${audit.error.message}\n`);
    return 1;
  }

  let report: unknown;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    process.stderr.write(`npm audit did not return valid JSON.\n${audit.stderr}`);
    return 1;
  }

  if (isRecord(report) && report.error !== undefined) {
    process.stderr.write(`npm audit failed: ${JSON.stringify(report.error)}\n`);
    return 1;
  }

  const decision = evaluateAuditReport(report);
  if (decision.blocked.length > 0) {
    process.stderr.write(
      `Dependency audit blocked by ${decision.blocked.length} package finding(s):\n${decision.blocked.map(formatFinding).join('\n')}\n`
    );
    return 1;
  }

  if (audit.status !== 0 && audit.status !== 1) {
    process.stderr.write(`npm audit exited unexpectedly with status ${String(audit.status)}.\n`);
    return 1;
  }

  if (decision.accepted.length > 0) {
    process.stdout.write(
      `Accepted ${decision.accepted.length} narrowly scoped package finding(s):\n` +
        `${decision.accepted.map((item) => `${formatFinding(item)}\n  ${item.reason}`).join('\n')}\n`
    );
  } else {
    process.stdout.write('Dependency audit found no moderate-or-higher vulnerabilities.\n');
  }

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runAudit();
}
