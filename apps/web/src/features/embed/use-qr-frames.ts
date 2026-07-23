import { useEffect, useState } from 'react';
import type { RenderedQrFrames } from '../qr/qr-protocol.js';

export function useQrFrames(qr: RenderedQrFrames | null): string | null {
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    if (!qr) return;
    const urls = qr.frames.map((bytes) =>
      URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }))
    );
    let index = 0;
    setFrame(urls[0] ?? null);
    const timer =
      urls.length > 1
        ? window.setInterval(() => {
            index = (index + 1) % urls.length;
            setFrame(urls[index] ?? null);
          }, qr.frameMs)
        : null;
    return () => {
      if (timer !== null) window.clearInterval(timer);
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [qr]);
  return frame;
}
