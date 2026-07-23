const LOGICAL_WIDTH = 520;
const LOGICAL_HEIGHT = 312;
const FRAME_COUNT = 5;
const FRAME_INTERVAL_MS = 120;
const GRID_SPACING = 15;
const GRID_MARGIN = 14;

interface PlateDot {
  x: number;
  y: number;
  radius: number;
  color: string;
  highlight: string;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1_664_525) + 1_013_904_223;
    return (state >>> 0) / 4_294_967_296;
  };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createLetterMask(letter: string, seed: number): Uint8ClampedArray {
  const mask = createCanvas(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(LOGICAL_WIDTH * LOGICAL_HEIGHT * 4);
  const next = seededRandom(seed + 17);
  context.fillStyle = '#000';
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  context.save();
  context.translate(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 4);
  context.rotate((next() - 0.5) * 0.1);
  context.transform(1, (next() - 0.5) * 0.1, (next() - 0.5) * 0.14, 1, 0, 0);
  context.font = '900 246px Georgia, "Times New Roman", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.fillText(letter, 0, 2);
  context.restore();
  return context.getImageData(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).data;
}

function isLetterPixel(mask: Uint8ClampedArray, x: number, y: number): boolean {
  const pixelX = Math.max(0, Math.min(LOGICAL_WIDTH - 1, Math.floor(x)));
  const pixelY = Math.max(0, Math.min(LOGICAL_HEIGHT - 1, Math.floor(y)));
  return (mask[(pixelY * LOGICAL_WIDTH + pixelX) * 4] ?? 0) > 20;
}

function drawCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function plateDot(
  column: number,
  row: number,
  mask: Uint8ClampedArray,
  next: () => number
): PlateDot {
  const x = column + (next() - 0.5) * GRID_SPACING * 0.55;
  const y = row + (next() - 0.5) * GRID_SPACING * 0.55;
  const hit = isLetterPixel(mask, x, y);
  const radius = (hit ? 5.2 : 4.3) + next() * (hit ? 2.3 : 2);
  const red = hit ? 150 + Math.floor(next() * 45) : 70 + Math.floor(next() * 40);
  const green = hit ? 100 + Math.floor(next() * 50) : 40 + Math.floor(next() * 35);
  const blue = hit ? 235 + Math.floor(next() * 20) : 120 + Math.floor(next() * 60);
  const alpha = hit ? 0.98 : 0.7 + next() * 0.18;
  return {
    x,
    y,
    radius,
    color: `rgba(${red}, ${green}, ${blue}, ${alpha})`,
    highlight: `rgba(236, 229, 255, ${hit ? 0.18 : 0.1})`,
  };
}

function drawGrid(
  context: CanvasRenderingContext2D,
  mask: Uint8ClampedArray,
  next: () => number
): void {
  for (let row = GRID_MARGIN; row < LOGICAL_HEIGHT - GRID_MARGIN; row += GRID_SPACING) {
    for (let column = GRID_MARGIN; column < LOGICAL_WIDTH - GRID_MARGIN; column += GRID_SPACING) {
      const dot = plateDot(column, row, mask, next);
      drawCircle(context, dot.x, dot.y, dot.radius, dot.color);
      drawCircle(
        context,
        dot.x - dot.radius * 0.28,
        dot.y - dot.radius * 0.28,
        Math.max(1, dot.radius * 0.22),
        dot.highlight
      );
    }
  }
}

function renderFrame(letter: string, seed: number): HTMLCanvasElement {
  const frame = createCanvas(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const context = frame.getContext('2d');
  if (!context) return frame;
  const next = seededRandom(seed);
  const mask = createLetterMask(letter, seed);
  context.fillStyle = '#050505';
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawGrid(context, mask, next);
  for (let index = 0; index < 22; index += 1) {
    const x = 10 + next() * (LOGICAL_WIDTH - 20);
    const y = 10 + next() * (LOGICAL_HEIGHT - 20);
    const alpha = isLetterPixel(mask, x, y) ? 0.28 : 0.18;
    drawCircle(context, x, y, 2.4 + next() * 2.4, `rgba(240, 234, 255, ${alpha})`);
  }
  return frame;
}

export function startBioDotPlate(
  canvas: HTMLCanvasElement,
  letter: string,
  seed: number
): () => void {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return () => undefined;
  const frames = Array.from({ length: FRAME_COUNT }, (_, index) =>
    renderFrame(letter, seed + index * 317)
  );
  let frameIndex = 0;
  const paint = (): void => {
    const frame = frames[frameIndex] ?? frames[0];
    if (frame) context.drawImage(frame, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  };
  const resize = (): void => {
    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(LOGICAL_WIDTH * scale);
    canvas.height = Math.floor(LOGICAL_HEIGHT * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.imageSmoothingEnabled = false;
    paint();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const timer = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    paint();
  }, FRAME_INTERVAL_MS);
  return () => {
    window.clearInterval(timer);
    observer.disconnect();
  };
}
