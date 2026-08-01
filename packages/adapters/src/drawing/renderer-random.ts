import { createHash } from 'node:crypto';

export function seededUnit(seed: string, label: string): number {
  return (
    createHash('sha256').update(seed).update(':').update(label).digest().readUInt32BE(0) /
    0x1_0000_0000
  );
}

export function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0) || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
