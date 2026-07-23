import type { MerchantProjection } from '@argus-challenge/contracts';

export const INDIVIDUAL_SCORE_LIMIT = 30;
export const PROJECTION_FRESHNESS_WINDOW_SECONDS = 180;

const LOCATION_MISMATCH_SCORE = 35;
const LOCATION_MISMATCH_SCORE_LIMIT = 40;
const TOTAL_SCORE_LIMIT = 50;
const ISOLATED_LOCATION_TAGS = new Set([
  'apple_attestation_missing',
  'apple_attested',
  'cellular',
  'incognito',
  'location_mismatch',
]);

export interface ClassifiedProjection {
  individualScore: number;
  isPhone: boolean;
  isDatacenter: boolean;
  isProxy: boolean;
  patAttested: boolean;
  browserName: string | null;
  browserVersion: string | null;
  os: string | null;
  ip: string | null;
  userAgent: string | null;
  asnName: string | null;
  city: string | null;
  country: string | null;
  isMobileNetwork: boolean;
  isVpn: boolean;
  isIsolatedLocationMismatch: boolean;
}

export interface ProjectionVerdict {
  verdict: 'paired' | 'failed';
  reason: string;
  annotations: Record<string, unknown>;
}

function hasTagLike(tags: string[], ...patterns: string[]): boolean {
  const normalized = tags.map((tag) => tag.toLowerCase());
  return patterns.some((pattern) => normalized.some((tag) => tag.includes(pattern.toLowerCase())));
}

function isPhoneProjection(projection: MerchantProjection): boolean {
  const browser = projection.identification.browserDetails;
  const device = String(browser.device ?? '').toLowerCase();
  const os = String(browser.os ?? '').toLowerCase();
  const userAgent = browser.userAgent ?? '';
  return (
    ['mobile', 'tablet', 'phone'].includes(device) ||
    /\b(ios|ipados|android|iphone|ipod)\b/i.test(os) ||
    /Mobile|Android|iPhone|iPad|iPod/.test(userAgent)
  );
}

function isolatedLocationMismatch(projection: MerchantProjection): boolean {
  const tags = projection.tags.map((tag) => tag.toLowerCase());
  return (
    projection.automation === 0 &&
    projection.device_tampering === LOCATION_MISMATCH_SCORE &&
    projection.network_tampering === 0 &&
    tags.includes('location_mismatch') &&
    tags.every((tag) => ISOLATED_LOCATION_TAGS.has(tag))
  );
}

export function classifyProjection(projection: MerchantProjection): ClassifiedProjection {
  const browser = projection.identification.browserDetails;
  return {
    individualScore: Math.max(
      projection.automation,
      projection.device_tampering,
      projection.network_tampering
    ),
    isPhone: isPhoneProjection(projection),
    isDatacenter:
      hasTagLike(projection.tags, 'datacenter', 'hyperscaler', 'dc_asn') ||
      projection.ipInfo.datacenter.result,
    isProxy: hasTagLike(projection.tags, 'proxy') || projection.ipInfo.hosting.result,
    patAttested: hasTagLike(projection.tags, 'apple_attested'),
    browserName: browser.browserName,
    browserVersion: browser.browserVersion,
    os: browser.os,
    ip: projection.ip,
    userAgent: browser.userAgent,
    asnName: projection.ipInfo.asn.organization,
    city: projection.ipLocation.city,
    country: projection.ipLocation.country,
    isMobileNetwork: projection.ipInfo.mobile.result,
    isVpn: projection.ipInfo.vpn.result,
    isIsolatedLocationMismatch: isolatedLocationMismatch(projection),
  };
}

function isScoreAllowed(scan: ClassifiedProjection): boolean {
  const limit = scan.isIsolatedLocationMismatch
    ? LOCATION_MISMATCH_SCORE_LIMIT
    : INDIVIDUAL_SCORE_LIMIT;
  return scan.individualScore < limit;
}

function sideAnnotations(prefix: 'desktop' | 'phone', scan: ClassifiedProjection) {
  return {
    [`${prefix}_score`]: scan.individualScore,
    [`${prefix}_is_phone`]: scan.isPhone,
    [`${prefix}_dc_asn`]: scan.isDatacenter,
    [`${prefix}_browser_name`]: scan.browserName,
    [`${prefix}_browser_version`]: scan.browserVersion,
    [`${prefix}_os`]: scan.os,
    [`${prefix}_ip`]: scan.ip,
    [`${prefix}_ua`]: scan.userAgent,
    [`${prefix}_asn_name`]: scan.asnName,
    [`${prefix}_city`]: scan.city,
    [`${prefix}_country`]: scan.country,
    [`${prefix}_is_mobile_network`]: scan.isMobileNetwork,
    [`${prefix}_is_proxy`]: scan.isProxy,
    [`${prefix}_is_vpn`]: scan.isVpn,
    [`${prefix}_isolated_location_mismatch`]: scan.isIsolatedLocationMismatch,
  };
}

function annotations(
  desktop: ClassifiedProjection,
  phone: ClassifiedProjection
): Record<string, unknown> {
  return {
    ...sideAnnotations('desktop', desktop),
    ...sideAnnotations('phone', phone),
    total_score: desktop.individualScore + phone.individualScore,
    pat_used_desktop: desktop.patAttested,
    pat_used_phone: phone.patAttested,
    phone_to_phone: desktop.isPhone && phone.isPhone,
  };
}

export function computeProjectionVerdict(
  desktop: ClassifiedProjection,
  phone: ClassifiedProjection
): ProjectionVerdict {
  const details = annotations(desktop, phone);
  if (desktop.isProxy)
    return { verdict: 'failed', reason: 'desktop_on_proxy', annotations: details };
  if (phone.isProxy) return { verdict: 'failed', reason: 'phone_on_proxy', annotations: details };
  if (!isScoreAllowed(desktop)) {
    return { verdict: 'failed', reason: 'desktop_score_high', annotations: details };
  }
  if (!isScoreAllowed(phone)) {
    return { verdict: 'failed', reason: 'phone_score_high', annotations: details };
  }
  if (desktop.individualScore + phone.individualScore >= TOTAL_SCORE_LIMIT) {
    return { verdict: 'failed', reason: 'total_score_high', annotations: details };
  }
  if (phone.isDatacenter) {
    return { verdict: 'failed', reason: 'phone_on_datacenter', annotations: details };
  }
  if (!desktop.isPhone && !phone.isPhone) {
    return { verdict: 'failed', reason: 'both_sides_desktop', annotations: details };
  }
  return {
    verdict: 'paired',
    reason: details.phone_to_phone ? 'paired_phone_to_phone' : 'paired_desktop_and_phone',
    annotations: details,
  };
}

export function projectionAgeSeconds(
  projection: MerchantProjection | null,
  nowMilliseconds: number = Date.now()
): number | null {
  return projection ? Math.round((nowMilliseconds - projection.created_at) / 1000) : null;
}

export function isProjectionFresh(
  projection: MerchantProjection | null,
  nowMilliseconds: number = Date.now()
): boolean {
  const age = projectionAgeSeconds(projection, nowMilliseconds);
  return (
    age !== null &&
    age >= -PROJECTION_FRESHNESS_WINDOW_SECONDS &&
    age <= PROJECTION_FRESHNESS_WINDOW_SECONDS
  );
}
