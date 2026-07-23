import {
  deriveAesKey,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  packQrFrameBundle,
  sealBytes,
} from '@argus-challenge/contracts';
import {
  renderPairQrFrames,
  type QrRenderProfile,
  type RenderedQrFrames,
} from './server-qr-renderer.js';

export interface SealedPairTokenQr {
  enc: string;
  sPub: string;
  kind: 'png-frames';
  compression: 'none';
  width: number;
  frameMs: number;
  frameCount: number;
}

export interface SealPairTokenQrInput {
  pairOrigin: string;
  token: string;
  suffix?: string;
  clientPublicKey: string;
  compression: 'none';
}

export interface PairTokenQrProfile {
  event: 'pair_token_qr_profile';
  frameCount: number;
  frameBytes: number[];
  width: number;
  totalMs: number;
  keyMs: number;
  renderMs: number;
  packMs: number;
  sealMs: number;
  exportMs: number;
  renderProfile: QrRenderProfile;
}

interface SealDependencies {
  renderFrames(pairOrigin: string, token: string, suffix?: string): Promise<RenderedQrFrames>;
  nowMilliseconds(): number;
  recordProfile(profile: PairTokenQrProfile): void;
}

interface Timed<T> {
  value: T;
  durationMs: number;
}

interface QrKeyMaterial {
  server: CryptoKeyPair;
  shared: CryptoKey;
}

interface SealMeasurements {
  startedAt: number;
  key: Timed<QrKeyMaterial>;
  rendered: Timed<RenderedQrFrames>;
  packed: Timed<Uint8Array>;
  sealed: Timed<string>;
  publicKey: Timed<string>;
}

export interface SealPairTokenQrOverrides {
  renderFrames?: SealDependencies['renderFrames'];
  nowMilliseconds?: SealDependencies['nowMilliseconds'];
  recordProfile?: SealDependencies['recordProfile'];
}

function nowMilliseconds(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

async function measured<T>(operation: () => Promise<T>, now: () => number): Promise<Timed<T>> {
  const startedAt = now();
  const value = await operation();
  return { value, durationMs: now() - startedAt };
}

function profileFrom(
  measurements: SealMeasurements,
  dependencies: SealDependencies
): PairTokenQrProfile {
  const { rendered, key, packed, sealed, publicKey } = measurements;
  return {
    event: 'pair_token_qr_profile',
    frameCount: rendered.value.frameCount,
    frameBytes: rendered.value.frames.map((frame) => frame.byteLength),
    width: rendered.value.width,
    totalMs: roundMilliseconds(dependencies.nowMilliseconds() - measurements.startedAt),
    keyMs: roundMilliseconds(key.durationMs),
    renderMs: roundMilliseconds(rendered.durationMs),
    packMs: roundMilliseconds(packed.durationMs),
    sealMs: roundMilliseconds(sealed.durationMs),
    exportMs: roundMilliseconds(publicKey.durationMs),
    renderProfile: rendered.value.profile,
  };
}

export async function sealPairTokenQr(
  input: SealPairTokenQrInput,
  overrides: SealPairTokenQrOverrides = {}
): Promise<SealedPairTokenQr> {
  const dependencies: SealDependencies = {
    renderFrames: renderPairQrFrames,
    nowMilliseconds,
    recordProfile: () => undefined,
    ...overrides,
  };
  const startedAt = dependencies.nowMilliseconds();
  const key = await measured(async () => {
    const server = await generateKeyPair();
    const shared = await deriveAesKey(
      server.privateKey,
      await importPublicKey(input.clientPublicKey)
    );
    return { server, shared };
  }, dependencies.nowMilliseconds);
  const rendered = await measured(
    () => dependencies.renderFrames(input.pairOrigin, input.token, input.suffix ?? ''),
    dependencies.nowMilliseconds
  );
  const packed = await measured(
    async () =>
      packQrFrameBundle({
        frameMs: rendered.value.frameMs,
        frames: rendered.value.frames,
      }),
    dependencies.nowMilliseconds
  );
  const [sealed, publicKey] = await Promise.all([
    measured(() => sealBytes(key.value.shared, packed.value), dependencies.nowMilliseconds),
    measured(() => exportPublicKey(key.value.server.publicKey), dependencies.nowMilliseconds),
  ]);
  dependencies.recordProfile(
    profileFrom({ startedAt, key, rendered, packed, sealed, publicKey }, dependencies)
  );
  return {
    enc: sealed.value,
    sPub: publicKey.value,
    kind: 'png-frames',
    compression: input.compression,
    width: rendered.value.width,
    frameMs: rendered.value.frameMs,
    frameCount: rendered.value.frameCount,
  };
}
