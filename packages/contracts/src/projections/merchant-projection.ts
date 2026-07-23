import { z } from 'zod';

const nullableString = z.string().nullable();
const score = z.number().finite().min(0).max(100);
const resultFlag = z.object({ result: z.boolean() });
const cryptoDeviceId = z
  .string()
  .regex(/^[0-9a-f]{10}$/)
  .nullable();

export const MerchantProjectionSchema = z.object({
  schema_version: z.literal(1),
  session_id: z.string().min(1),
  automation: score,
  device_tampering: score,
  network_tampering: score,
  created_at: z.number().int().positive(),
  verdict: z.enum(['clean', 'suspect', 'block']),
  identification: z.object({
    crypto_device_id: cryptoDeviceId,
    crypto_verified: z.boolean().nullable(),
    browserDetails: z.object({
      browserName: nullableString,
      browserVersion: nullableString,
      device: nullableString,
      os: nullableString,
      userAgent: nullableString,
    }),
  }),
  ip: nullableString,
  ipLocation: z.object({ city: nullableString, country: nullableString }),
  ipInfo: z.object({
    asn: z.object({ organization: nullableString }),
    datacenter: resultFlag,
    mobile: resultFlag,
    vpn: resultFlag,
    hosting: resultFlag,
  }),
  tags: z.array(z.string()),
  worker_scope_evidence: z
    .object({
      all_scopes_consistent: z.boolean(),
      main_web_consensus_id: nullableString,
      shared_partition_candidate: z.boolean(),
      brave_detected: z.boolean(),
      device_tampering_without_worker: score,
    })
    .nullable(),
});

export type MerchantProjection = z.infer<typeof MerchantProjectionSchema>;
