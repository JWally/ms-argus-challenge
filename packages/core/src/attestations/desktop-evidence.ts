import type { MerchantProjection } from '@argus-challenge/contracts';
import { applyBraveSharedWorkerPolicy } from '../verdicts/brave-shared-worker-policy.js';
import {
  classifyProjection,
  isProjectionFresh,
  projectionAgeSeconds,
  type ClassifiedProjection,
} from '../verdicts/projection-policy.js';

interface DesktopEvidenceInput {
  hostArgusSessionId: string | null;
  iframeArgusSessionId: string;
  pairSessionId: string;
}

interface DesktopEvidenceDependencies {
  fetchProjection(argusSessionId: string): Promise<MerchantProjection | null>;
  nowMilliseconds(): number;
}

function sameLabel(first: string | null, second: string | null): boolean {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

function evidenceAnnotations(input: {
  bound: boolean;
  hostProjection: MerchantProjection | null;
  hostScan: ClassifiedProjection | null;
  iframeProjection: MerchantProjection | null;
  iframeScan: ClassifiedProjection | null;
  now: number;
}): Record<string, unknown> {
  if (!input.bound) return { host_preflight_bound: false };
  const annotations: Record<string, unknown> = {
    host_preflight_bound: true,
    host_projection_present: Boolean(input.hostProjection),
    host_projection_fresh: isProjectionFresh(input.hostProjection, input.now),
    host_projection_age_sec: projectionAgeSeconds(input.hostProjection, input.now),
  };
  if (input.hostProjection) {
    annotations.host_automation = input.hostProjection.automation;
    annotations.host_device_tampering = input.hostProjection.device_tampering;
    annotations.host_network_tampering = input.hostProjection.network_tampering;
  }
  if (input.iframeProjection) {
    annotations.iframe_automation = input.iframeProjection.automation;
    annotations.iframe_device_tampering = input.iframeProjection.device_tampering;
    annotations.iframe_network_tampering = input.iframeProjection.network_tampering;
  }
  if (input.hostScan && input.iframeScan) {
    annotations.host_iframe_ip_match =
      Boolean(input.hostScan.ip) && input.hostScan.ip === input.iframeScan.ip;
    annotations.host_iframe_browser_match = sameLabel(
      input.hostScan.browserName,
      input.iframeScan.browserName
    );
    annotations.host_iframe_os_match = sameLabel(input.hostScan.os, input.iframeScan.os);
  }
  return annotations;
}

export async function collectDesktopEvidence(
  input: DesktopEvidenceInput,
  dependencies: DesktopEvidenceDependencies
) {
  const [hostProjection, desktopProjection] = await Promise.all([
    input.hostArgusSessionId
      ? dependencies.fetchProjection(input.hostArgusSessionId)
      : Promise.resolve(null),
    dependencies.fetchProjection(input.iframeArgusSessionId),
  ]);
  const now = dependencies.nowMilliseconds();
  const hostScan = hostProjection ? classifyProjection(hostProjection) : null;
  const rawDesktopScan = desktopProjection ? classifyProjection(desktopProjection) : null;
  const policy = applyBraveSharedWorkerPolicy(
    { iframeProjection: desktopProjection, iframeScan: rawDesktopScan },
    now
  );
  return {
    desktopProjection,
    desktopScan: policy.effectiveIframeScan,
    annotations: {
      ...evidenceAnnotations({
        bound: Boolean(input.hostArgusSessionId),
        hostProjection,
        hostScan,
        iframeProjection: desktopProjection,
        iframeScan: rawDesktopScan,
        now,
      }),
      ...policy.annotations,
    },
  };
}
