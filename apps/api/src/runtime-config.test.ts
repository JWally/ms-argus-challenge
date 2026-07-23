import { describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime-config.js';

const complete = {
  TABLE_NAME: 'challenge-table',
  PUBLIC_ORIGIN: 'https://challenge.example',
  WS_API_URL: 'wss://socket.example/dev',
  WS_MGMT_ENDPOINT: 'https://socket.example/dev',
  WS_SECRET_ARN: 'ws-secret',
  DEVICE_TRUST_SECRET_ARN: 'trust-secret',
  VERDICT_SECRET_ARN: 'verdict-secret',
  MERCHANT_API_URL: 'https://merchant.example',
  MERCHANT_API_CREDENTIAL: 'key.token',
  MERCHANT_CPI: 'argus_cpi_test_Example12345',
  ALLOWED_ORIGINS: 'https://challenge.example,https://games.example',
  SSO_CALLBACK_ORIGINS: 'https://games.example',
};

describe('API runtime configuration', () => {
  it('parses explicit origins and fail-closed defaults', () => {
    expect(readRuntimeConfig(complete)).toMatchObject({
      tableName: 'challenge-table',
      allowedOrigins: ['https://challenge.example', 'https://games.example'],
      ssoCallbackOrigins: ['https://games.example'],
      proofRequiredByDefault: false,
      allowTestAuthenticators: false,
    });
  });

  it('refuses to start without every load-bearing integration', () => {
    expect(() => readRuntimeConfig({ ...complete, MERCHANT_API_CREDENTIAL: '' })).toThrow(
      'MERCHANT_API_CREDENTIAL'
    );
  });
});
