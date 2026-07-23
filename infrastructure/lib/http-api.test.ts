import { CHALLENGE_HTTP_ROUTES } from '@argus-challenge/contracts';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_ROUTES } from './http-api.js';

describe('HTTP API infrastructure contract', () => {
  it('provisions every and only current public route', () => {
    const provisioned = CHALLENGE_ROUTES.map(({ method, path }) => `${method} ${path}`);
    expect(provisioned).toEqual([...CHALLENGE_HTTP_ROUTES]);
  });
});
