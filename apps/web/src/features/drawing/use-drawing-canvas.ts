import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { DrawingPoint, DrawingStroke } from './drawing-sample.js';

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.scale(scale, scale);
  context.fillStyle = '#080b12';
  context.fillRect(0, 0, bounds.width, bounds.height);
  context.strokeStyle = '#f8fafc';
  context.lineWidth = 15;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  return context;
}

function point(canvas: HTMLCanvasElement, event: ReactPointerEvent) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

interface DrawingCanvas {
  canvasReference: RefObject<HTMLCanvasElement | null>;
  hasInk: boolean;
  hasStarted: boolean;
  strokes(): DrawingStroke[];
  clear(): void;
  begin(event: ReactPointerEvent<HTMLCanvasElement>): void;
  move(event: ReactPointerEvent<HTMLCanvasElement>): void;
  end(event: ReactPointerEvent<HTMLCanvasElement>): void;
}

export function useDrawingCanvas(resetKey: number, disabled: boolean): DrawingCanvas {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const contextReference = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawing = useRef(false);
  const strokesReference = useRef<DrawingStroke[]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const clear = (): void => {
    if (canvasReference.current) contextReference.current = resizeCanvas(canvasReference.current);
    strokesReference.current = [];
    setHasInk(false);
  };
  useEffect(() => {
    setHasStarted(false);
    clear();
    window.addEventListener('resize', clear);
    return () => window.removeEventListener('resize', clear);
  }, [resetKey]);
  return {
    canvasReference,
    hasInk,
    hasStarted,
    strokes: () => strokesReference.current.map((stroke) => [...stroke]),
    clear,
    begin(event) {
      if (disabled || !contextReference.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = point(event.currentTarget, event);
      const nextStroke = [samplePoint(event.currentTarget, event)];
      strokesReference.current = [...strokesReference.current.slice(-7), nextStroke];
      contextReference.current.beginPath();
      contextReference.current.moveTo(start.x, start.y);
      isDrawing.current = true;
      setHasInk(true);
      setHasStarted(true);
      navigator.vibrate?.(5);
    },
    move(event) {
      if (!isDrawing.current || !contextReference.current) return;
      event.preventDefault();
      const next = point(event.currentTarget, event);
      const stroke = strokesReference.current.at(-1);
      if (stroke && stroke.length < 360) stroke.push(samplePoint(event.currentTarget, event));
      contextReference.current.lineTo(next.x, next.y);
      contextReference.current.stroke();
    },
    end(event) {
      isDrawing.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };
}

function samplePoint(canvas: HTMLCanvasElement, event: ReactPointerEvent): DrawingPoint {
  const bounds = canvas.getBoundingClientRect();
  let coalescedCount = 0;
  try {
    coalescedCount = event.nativeEvent.getCoalescedEvents?.().length ?? 0;
  } catch {
    coalescedCount = 0;
  }
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    t: event.timeStamp || globalThis.performance.now(),
    pressure: event.pressure,
    contactWidth: event.width,
    contactHeight: event.height,
    coalescedCount,
  };
}
