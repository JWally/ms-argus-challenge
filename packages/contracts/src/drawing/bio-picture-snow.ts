import {
  BIO_PICTURE_SIGNAL_COLORS,
  bioPictureBlockSize,
  seededRandom,
} from './bio-picture-style.js';

interface BioPictureSnowSpeck {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: string;
}

export function buildBioPictureSnow(input: {
  letter: string;
  variantIndex: number;
  frameIndex: number;
  width: number;
  height: number;
}): BioPictureSnowSpeck[] {
  const next = seededRandom(
    `bio-picture-style:snow:${input.letter}:${input.variantIndex}:${input.frameIndex}:${input.width}x${input.height}`
  );
  const blockSize = bioPictureBlockSize(input.width, input.height);
  const speckCount = Math.round((input.width * input.height * 0.04) / (blockSize * blockSize));
  const specks: BioPictureSnowSpeck[] = [];
  for (let index = 0; index < speckCount; index += 1) {
    specks.push({
      x: Math.floor(next() * Math.max(1, input.width - blockSize + 1)),
      y: Math.floor(next() * Math.max(1, input.height - blockSize + 1)),
      width: blockSize,
      height: blockSize,
      radius: Math.max(1.5, blockSize * 0.22),
      color:
        BIO_PICTURE_SIGNAL_COLORS[Math.floor(next() * BIO_PICTURE_SIGNAL_COLORS.length)] ??
        BIO_PICTURE_SIGNAL_COLORS[0],
    });
  }
  return specks;
}
