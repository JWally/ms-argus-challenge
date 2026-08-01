import { useEffect, useRef, useState } from 'react';
import type { RenderedDrawingPictures } from './drawing-picture-protocol.js';

interface DrawingPicturePlayerProps {
  pictures: RenderedDrawingPictures;
  promptIndex: number;
}

function rgbaFromGray8Frame(frame: Uint8Array, width: number, height: number) {
  const pixels = width * height;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(pixels * 4));
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const value = frame[pixel] ?? 0;
    const offset = pixel * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function promptFrames(pictures: RenderedDrawingPictures, promptIndex: number): Uint8Array[] {
  const start = promptIndex * pictures.framesPerPrompt;
  return pictures.pictures.slice(start, start + pictures.framesPerPrompt);
}

function blobPartFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

interface PngFrameUrl {
  url: string;
  dispose(): void;
}

async function preloadImage(source: string): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  await image.decode();
}

function pngFrameUrl(bytes: Uint8Array): PngFrameUrl {
  const blob = new Blob([blobPartFromBytes(bytes)], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  return { url, dispose: () => URL.revokeObjectURL(url) };
}

function DrawingGray8PicturePlayer({ pictures, promptIndex }: DrawingPicturePlayerProps) {
  const canvasReference = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasReference.current;
    const context = canvas?.getContext('2d');
    const frames = promptFrames(pictures, promptIndex);
    if (!canvas || !context || frames.length === 0) return undefined;
    canvas.width = pictures.width;
    canvas.height = pictures.height;
    let frameIndex = 0;
    let timeout: number | undefined;
    const draw = (): void => {
      const frame = frames[frameIndex];
      if (frame) {
        context.putImageData(
          new ImageData(
            rgbaFromGray8Frame(frame, pictures.width, pictures.height),
            pictures.width,
            pictures.height
          ),
          0,
          0
        );
      }
      frameIndex = (frameIndex + 1) % frames.length;
      if (frames.length > 1) timeout = window.setTimeout(draw, pictures.frameMs);
    };
    draw();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [pictures, promptIndex]);

  return (
    <canvas
      ref={canvasReference}
      className="bio-draw-picture-canvas"
      aria-label={`Drawing prompt ${promptIndex + 1}`}
    />
  );
}

function DrawingPngPicturePlayer({ pictures, promptIndex }: DrawingPicturePlayerProps) {
  const [currentSource, setCurrentSource] = useState<string>('');

  useEffect(() => {
    const frames = promptFrames(pictures, promptIndex);
    if (frames.length === 0) return undefined;
    let isDisposed = false;
    const frameUrls = frames.map(pngFrameUrl);
    let frameIndex = 0;
    let timeout: number | undefined;
    const show = (): void => {
      setCurrentSource(frameUrls[frameIndex]?.url ?? '');
      frameIndex = (frameIndex + 1) % frameUrls.length;
      if (frameUrls.length > 1) timeout = window.setTimeout(show, pictures.frameMs);
    };

    setCurrentSource('');
    void Promise.all(frameUrls.map((frame) => preloadImage(frame.url)))
      .catch(() => undefined)
      .then(() => {
        if (!isDisposed) show();
      });

    return () => {
      isDisposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      for (const frame of frameUrls) frame.dispose();
    };
  }, [pictures, promptIndex]);

  return (
    <img
      className="bio-draw-picture-canvas"
      src={currentSource || undefined}
      width={pictures.width}
      height={pictures.height}
      alt=""
      aria-label={`Drawing prompt ${promptIndex + 1}`}
    />
  );
}

export function DrawingPicturePlayer(props: DrawingPicturePlayerProps) {
  if (props.pictures.encoding === 'png') return <DrawingPngPicturePlayer {...props} />;
  return <DrawingGray8PicturePlayer {...props} />;
}
