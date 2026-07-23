import { describe, expect, it } from 'vitest';
import { readEmbedConfig } from './embed-config.js';

describe('embed config', () => {
  it('accepts the latest scoped CPI and merchant challenge shape', () => {
    const config = readEmbedConfig(
      '?cpi=argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB.fastpass&challengeId=challenge-value-123&origin=https%3A%2F%2Fgames.example'
    );
    expect(config).toEqual({
      cpi: 'argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB.fastpass',
      challengeId: 'challenge-value-123',
      hostOrigin: 'https://games.example',
    });
  });

  it('rejects wildcard and malformed host origins', () => {
    expect(readEmbedConfig('?cpi=bad&challengeId=short&origin=*')).toBeNull();
  });
});
