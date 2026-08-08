import { inferEmnistLetter, loadEmnistWeights, type EmnistGrade } from './emnist-inference.js';
import { normalizeDrawingImage } from './emnist-preprocess.js';

export interface EmnistCandidate {
  letter: string;
  confidence: number;
}

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface DrawingGrade extends Omit<EmnistGrade, 'letter'> {
  targetLetter: string;
  recognizedLetter: string;
  qualityScore: number;
  letterGrade: LetterGrade;
  isCorrect: boolean;
  candidates: EmnistCandidate[];
}

function letterGrade(score: number): LetterGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function gradeEmnistRecognition(grade: EmnistGrade, target: string): DrawingGrade {
  const targetLetter = target.toUpperCase();
  const targetIndex = targetLetter.codePointAt(0)! - 65;
  if (targetIndex < 0 || targetIndex >= 26) throw new Error('invalid_drawing_target');
  const candidates = grade.confidences
    .map((confidence, index) => ({
      letter: String.fromCodePoint(65 + index),
      confidence,
    }))
    .sort((first, second) => second.confidence - first.confidence)
    .slice(0, 3);
  const qualityScore = Math.round((grade.confidences[targetIndex] ?? 0) * 100);
  return {
    confidence: grade.confidence,
    confidences: grade.confidences,
    targetLetter,
    recognizedLetter: grade.letter,
    qualityScore,
    letterGrade: letterGrade(qualityScore),
    isCorrect: grade.letter === targetLetter,
    candidates,
  };
}

export async function gradeDrawingCanvas(
  canvas: HTMLCanvasElement,
  targetLetter: string
): Promise<DrawingGrade> {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('drawing_canvas_unavailable');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const [weights] = await Promise.all([loadEmnistWeights(), nextPaint()]);
  return gradeEmnistRecognition(
    inferEmnistLetter(normalizeDrawingImage(image), weights),
    targetLetter
  );
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
