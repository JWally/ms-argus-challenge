import { describe, expect, it } from 'vitest';
import { packDrawingPictureBundle, unpackDrawingPictureBundle } from './picture-bundle.js';

describe('drawing picture bundle', () => {
  it('round trips fixed-size temporal gray8 prompt pictures', () => {
    const pictures = [new Uint8Array([0, 80, 255, 12]), new Uint8Array([20, 40, 60, 80])];
    const packed = packDrawingPictureBundle({
      width: 2,
      height: 2,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures,
    });

    expect(unpackDrawingPictureBundle(packed)).toEqual({
      encoding: 'gray8',
      width: 2,
      height: 2,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures,
    });
  });

  it('round trips variable-size server-rendered png prompt pictures', () => {
    const pngA = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const pngB = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 2, 3]);
    const packed = packDrawingPictureBundle({
      encoding: 'png',
      width: 280,
      height: 126,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures: [pngA, pngB],
    });

    expect(unpackDrawingPictureBundle(packed)).toEqual({
      encoding: 'png',
      width: 280,
      height: 126,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures: [pngA, pngB],
    });
  });

  it('rejects invalid dimensions, frame grouping, truncation, and trailing bytes', () => {
    expect(() =>
      packDrawingPictureBundle({
        encoding: 'gray8',
        width: 0,
        height: 2,
        framesPerPrompt: 1,
        frameMs: 50,
        pictures: [new Uint8Array([1, 2])],
      })
    ).toThrow('invalid_drawing_picture_width');
    expect(() =>
      packDrawingPictureBundle({
        encoding: 'gray8',
        width: 1,
        height: 1,
        framesPerPrompt: 0,
        frameMs: 50,
        pictures: [],
      })
    ).toThrow('invalid_drawing_picture_frames_per_prompt');
    expect(() =>
      packDrawingPictureBundle({
        encoding: 'gray8',
        width: 1,
        height: 1,
        framesPerPrompt: 1,
        frameMs: 0,
        pictures: [new Uint8Array([1])],
      })
    ).toThrow('invalid_drawing_picture_frame_ms');
    expect(() =>
      packDrawingPictureBundle({
        encoding: 'gray8',
        width: 1,
        height: 1,
        framesPerPrompt: 2,
        frameMs: 50,
        pictures: [new Uint8Array([1])],
      })
    ).toThrow('invalid_drawing_picture_count');
    expect(() =>
      packDrawingPictureBundle({
        encoding: 'gray8',
        width: 2,
        height: 2,
        framesPerPrompt: 1,
        frameMs: 50,
        pictures: [new Uint8Array([1])],
      })
    ).toThrow('invalid_drawing_picture_bytes');

    const valid = packDrawingPictureBundle({
      encoding: 'gray8',
      width: 1,
      height: 2,
      framesPerPrompt: 1,
      frameMs: 50,
      pictures: [new Uint8Array([1, 2])],
    });
    expect(() => unpackDrawingPictureBundle(valid.slice(0, -1))).toThrow('truncated');

    const trailing = new Uint8Array(valid.length + 1);
    trailing.set(valid);
    expect(() => unpackDrawingPictureBundle(trailing)).toThrow('trailing');
  });

  it('rejects unsupported magic and versions before trusting dimensions', () => {
    const packed = packDrawingPictureBundle({
      encoding: 'gray8',
      width: 1,
      height: 1,
      framesPerPrompt: 1,
      frameMs: 50,
      pictures: [new Uint8Array([255])],
    });
    const badMagic = Uint8Array.from(packed);
    badMagic[0] = 0;
    expect(() => unpackDrawingPictureBundle(badMagic)).toThrow('magic');

    const badVersion = Uint8Array.from(packed);
    badVersion[4] = 5;
    expect(() => unpackDrawingPictureBundle(badVersion)).toThrow('version');
  });
});
