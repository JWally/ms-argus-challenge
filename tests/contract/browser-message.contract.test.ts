import { describe, expect, it } from 'vitest';
import { parseCaptchaMessage } from '@argus-challenge/contracts';

describe('loader message contract', () => {
  const source = {};

  it('accepts a bound result from the expected iframe', () => {
    expect(
      parseCaptchaMessage(
        {
          origin: 'https://challenge.example',
          source,
          data: {
            source: 'argus-captcha',
            event: 'result',
            sessionId: 'session-1',
            token: 'signed-token',
          },
        },
        'https://challenge.example',
        source
      )
    ).toEqual({
      payload: {
        source: 'argus-captcha',
        event: 'result',
        sessionId: 'session-1',
        token: 'signed-token',
      },
      result: {
        sessionId: 'session-1',
        token: 'signed-token',
      },
      sizeHeight: null,
    });
  });

  it.each([undefined, null, ''])('rejects a result without a server token: %s', (token) => {
    expect(
      parseCaptchaMessage(
        {
          origin: 'https://challenge.example',
          source,
          data: {
            source: 'argus-captcha',
            event: 'result',
            sessionId: 'session-1',
            verdict: 'paired',
            token,
          },
        },
        'https://challenge.example',
        source
      )?.result
    ).toBeNull();
  });

  it.each([
    ['wrong origin', 'https://attacker.example', source],
    ['wrong source', 'https://challenge.example', {}],
  ])('rejects %s', (_label, origin, messageSource) => {
    expect(
      parseCaptchaMessage(
        {
          origin,
          source: messageSource,
          data: { source: 'argus-captcha', event: 'size', height: 400 },
        },
        'https://challenge.example',
        source
      )
    ).toBeNull();
  });

  it('accepts only finite iframe heights', () => {
    const envelope = {
      origin: 'https://challenge.example',
      source,
      data: { source: 'argus-captcha', event: 'size', height: 412.5 },
    };
    expect(parseCaptchaMessage(envelope, envelope.origin, source)?.sizeHeight).toBe(412.5);
  });
});
