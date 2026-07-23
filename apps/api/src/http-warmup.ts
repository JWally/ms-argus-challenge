const HTTP_WARMUP_SOURCE = 'argus.challenge.warmup';

interface HttpWarmupDependencies {
  warmSessionStore(): Promise<unknown>;
  primeQrRenderer(): Promise<boolean>;
  nowMilliseconds(): number;
  recordProfile(profile: {
    event: 'challenge_http_warmup';
    durationMs: number;
    rendererPrimed: boolean;
  }): void;
}

export interface HttpWarmupResult {
  warmed: true;
  rendererPrimed: boolean;
}

export function isHttpWarmupEvent(event: unknown): boolean {
  return (
    !!event && typeof event === 'object' && 'source' in event && event.source === HTTP_WARMUP_SOURCE
  );
}

export function createHttpWarmup(
  dependencies: HttpWarmupDependencies
): () => Promise<HttpWarmupResult> {
  return async () => {
    const startedAt = dependencies.nowMilliseconds();
    const [, rendererPrimed] = await Promise.all([
      dependencies.warmSessionStore(),
      dependencies.primeQrRenderer(),
    ]);
    dependencies.recordProfile({
      event: 'challenge_http_warmup',
      durationMs: dependencies.nowMilliseconds() - startedAt,
      rendererPrimed,
    });
    return { warmed: true, rendererPrimed };
  };
}
