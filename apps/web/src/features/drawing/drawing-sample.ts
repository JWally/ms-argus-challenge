export interface DrawingPoint {
  x: number;
  y: number;
  t: number;
  pressure: number;
  contactWidth: number;
  contactHeight: number;
  coalescedCount: number;
}

export type DrawingStroke = DrawingPoint[];

export interface DrawingSampleStats {
  strokes: number;
  samples: number;
  durationMs: number;
  pathLength: number;
  averageSpeed: number;
  peakSpeed: number;
  smoothness: number;
  directionEntropy: number;
  coalesced: number;
  pressure: number;
  contactArea: number;
}

const EMPTY_STATS: DrawingSampleStats = {
  strokes: 0,
  samples: 0,
  durationMs: 0,
  pathLength: 0,
  averageSpeed: 0,
  peakSpeed: 0,
  smoothness: 0,
  directionEntropy: 0,
  coalesced: 0,
  pressure: 0,
  contactArea: 0,
};

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function directionEntropy(directions: number[]): number {
  if (directions.length === 0) return 0;
  const buckets = new Array<number>(16).fill(0);
  for (const direction of directions) {
    const normalized = direction < 0 ? direction + Math.PI * 2 : direction;
    const index = Math.min(15, Math.floor((normalized / (Math.PI * 2)) * 16));
    buckets[index] = (buckets[index] ?? 0) + 1;
  }
  let entropy = 0;
  for (const count of buckets) {
    if (!count) continue;
    const probability = count / directions.length;
    entropy -= probability * Math.log2(probability);
  }
  return Math.round(entropy * 100) / 100;
}

function movementMetrics(strokes: DrawingStroke[]) {
  const speeds: number[] = [];
  const directions: number[] = [];
  let pathLength = 0;
  let samples = 0;
  let coalesced = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      const previous = stroke[index - 1] as DrawingPoint;
      const current = stroke[index] as DrawingPoint;
      const deltaX = current.x - previous.x;
      const deltaY = current.y - previous.y;
      const distance = Math.hypot(deltaX, deltaY);
      const elapsed = current.t - previous.t;
      pathLength += distance;
      if (distance > 0) directions.push(Math.atan2(deltaY, deltaX));
      if (elapsed > 0) speeds.push((distance / elapsed) * 1_000);
      samples += 1;
      if (current.coalescedCount > 0) coalesced += 1;
    }
  }
  return { coalesced, directions, pathLength, samples, speeds };
}

export function summarizeDrawingSample(strokes: DrawingStroke[]): DrawingSampleStats {
  const nonempty = strokes.filter((stroke) => stroke.length > 0);
  const points = nonempty.flat();
  if (!points.length) return { ...EMPTY_STATS };
  const movement = movementMetrics(nonempty);
  const { directions, pathLength, speeds } = movement;
  const averageSpeed = average(speeds);
  const speedDeviation = Math.sqrt(average(speeds.map((speed) => (speed - averageSpeed) ** 2)));
  const smoothness = averageSpeed
    ? Math.max(0, Math.round(100 * (1 - speedDeviation / averageSpeed)))
    : 0;
  return {
    strokes: nonempty.length,
    samples: points.length,
    durationMs: Math.round(
      Math.max(...points.map(({ t }) => t)) - Math.min(...points.map(({ t }) => t))
    ),
    pathLength: Math.round(pathLength),
    averageSpeed: Math.round(averageSpeed),
    peakSpeed: Math.round(speeds.length ? Math.max(...speeds) : 0),
    smoothness,
    directionEntropy: directionEntropy(directions),
    coalesced: movement.samples ? Math.round((movement.coalesced / movement.samples) * 100) : 0,
    pressure: Math.round(average(points.map(({ pressure }) => pressure)) * 100) / 100,
    contactArea: Math.round(
      average(points.map(({ contactWidth, contactHeight }) => contactWidth * contactHeight))
    ),
  };
}
