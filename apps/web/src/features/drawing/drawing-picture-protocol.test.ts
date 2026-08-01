import { describe, expect, it } from 'vitest';
import { readDrawingPictures } from './drawing-picture-protocol.js';

describe('drawing picture protocol', () => {
  it('accepts transferred gray8 picture buffers', () => {
    const pictures = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

    expect(
      readDrawingPictures({
        type: 'drawing-pictures',
        encoding: 'gray8',
        width: 3,
        height: 1,
        framesPerPrompt: 2,
        frameMs: 50,
        pictures,
      })
    ).toEqual({
      encoding: 'gray8',
      width: 3,
      height: 1,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures,
    });
  });

  it('accepts transferred server-rendered png picture buffers', () => {
    const pictures = [new Uint8Array([137, 80, 78, 71]), new Uint8Array([137, 80, 78, 71, 1])];

    expect(
      readDrawingPictures({
        type: 'drawing-pictures',
        encoding: 'png',
        width: 400,
        height: 180,
        framesPerPrompt: 2,
        frameMs: 50,
        pictures,
      })
    ).toEqual({
      encoding: 'png',
      width: 400,
      height: 180,
      framesPerPrompt: 2,
      frameMs: 50,
      pictures,
    });
  });

  it('rejects non-picture worker messages', () => {
    expect(
      readDrawingPictures({ type: 'frames', frames: [new Uint8Array([1])], frameMs: 180 })
    ).toBeNull();
    expect(
      readDrawingPictures({
        type: 'drawing-pictures',
        encoding: 'gray8',
        width: 0,
        height: 1,
        pictures: [],
      })
    ).toBeNull();
    expect(
      readDrawingPictures({
        type: 'drawing-pictures',
        encoding: 'gray8',
        width: 2,
        height: 2,
        framesPerPrompt: 1,
        frameMs: 50,
        pictures: [new Uint8Array([1])],
      })
    ).toBeNull();
  });

  it('rejects a picture bundle that cannot form complete prompt frame groups', () => {
    expect(
      readDrawingPictures({
        type: 'drawing-pictures',
        encoding: 'png',
        width: 200,
        height: 270,
        framesPerPrompt: 2,
        frameMs: 120,
        pictures: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
      })
    ).toBeNull();
  });
});
