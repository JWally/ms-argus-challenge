import { describe, expect, it } from 'vitest';
import { deploymentConfig } from './deployment-config.js';

describe('deployment config', () => {
  it('isolates dev-jw on a new hostname and stack namespace', () => {
    const config = deploymentConfig('dev-jw', {
      CDK_DEFAULT_ACCOUNT: '123456789012',
      MERCHANT_API_URL: 'https://merchant.example',
      MERCHANT_API_CREDENTIAL: 'key.token',
      MERCHANT_CPI: 'argus_cpi_test_abcdefghijkl',
    });
    expect(config.domainName).toBe('challenge-dev-jw.argus.pw');
    expect(config.publicOrigin).toBe('https://challenge-dev-jw.argus.pw');
    expect(config.domainName).not.toContain('captcha-dev-jw');
  });

  it('refuses an unknown stage', () => {
    expect(() => deploymentConfig('production', {})).toThrow('unsupported_stage');
  });
});
