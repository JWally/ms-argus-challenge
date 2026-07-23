import { useEffect, useRef } from 'react';
import { startBioDotPlate } from './bio-dot-plate.js';

interface DotLetterPlateProps {
  letter: string;
  seed: number;
}

export function DotLetterPlate({ letter, seed }: DotLetterPlateProps) {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasReference.current) return;
    return startBioDotPlate(canvasReference.current, letter, seed);
  }, [letter, seed]);
  return (
    <canvas ref={canvasReference} className="bio-draw-dot-canvas" aria-label={`Letter ${letter}`} />
  );
}
