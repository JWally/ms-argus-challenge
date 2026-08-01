interface DrawingPictureLetterMaskStyle {
  fontSizeScale: number;
  rotationScale: number;
  scaleX: number;
  scaleY: number;
  skewScale: number;
}

const DEFAULT_MASK_STYLE: DrawingPictureLetterMaskStyle = {
  fontSizeScale: 1,
  rotationScale: 1,
  scaleX: 1.12,
  scaleY: 1,
  skewScale: 1,
};

export function drawingPictureLetterMaskStyle(letter: string): DrawingPictureLetterMaskStyle {
  const normalized = letter.toUpperCase();
  if (normalized === 'B') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      rotationScale: 0.65,
      scaleX: 1.19,
      scaleY: 1.02,
      skewScale: 0.65,
    };
  }
  if (normalized === 'R') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      rotationScale: 0.55,
      scaleX: 1.24,
      scaleY: 1.02,
      skewScale: 0.55,
    };
  }
  if (normalized === 'K') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 0.98,
      rotationScale: 0.55,
      scaleX: 1.18,
      scaleY: 1.02,
      skewScale: 0.5,
    };
  }
  if (normalized === 'J') {
    return {
      ...DEFAULT_MASK_STYLE,
      fontSizeScale: 1.02,
      scaleX: 1.22,
      scaleY: 1.04,
    };
  }
  return DEFAULT_MASK_STYLE;
}
