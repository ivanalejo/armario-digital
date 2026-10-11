import { useEffect, useState } from 'react';
import { getBlob } from '../db/items';
import { logError } from '../platform/errorLog';
import type { BlobVariant } from '../domain/schema';

/** URL temporal (blob:) para un binario; se revoca al desmontar para no perder memoria. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useStoredImage(imageId: string | undefined, variant: BlobVariant): { blob?: Blob; failed: boolean } {
  const [state, setState] = useState<{ blob?: Blob; failed: boolean }>({ failed: false });
  useEffect(() => {
    let alive = true;
    setState({ failed: false });
    if (imageId) {
      getBlob(imageId, variant)
        .then((b) => alive && setState({ blob: b, failed: !b }))
        .catch((err: unknown) => {
          logError('mostrar imagen', err);
          if (alive) setState({ failed: true });
        });
    }
    return () => {
      alive = false;
    };
  }, [imageId, variant]);
  return state;
}

interface ThumbProps {
  imageId?: string;
  blob?: Blob;
  variant?: BlobVariant;
  alt: string;
  className?: string;
}

/** Imagen guardada (por ID) o en memoria (por blob). */
export function Thumb({ imageId, blob, variant = 'thumb', alt, className }: ThumbProps) {
  const stored = useStoredImage(blob ? undefined : imageId, variant);
  const url = useObjectUrl(blob ?? stored.blob);
  if (!url) {
    return (
      <div className={`thumb thumb--empty${stored.failed ? ' thumb--broken' : ''} ${className ?? ''}`} role={stored.failed ? 'img' : undefined} aria-label={stored.failed ? `${alt} (imagen no disponible)` : alt}>
        {stored.failed && <span>Imagen no disponible</span>}
      </div>
    );
  }
  return <img className={`thumb ${className ?? ''}`} src={url} alt={alt} loading="lazy" decoding="async" draggable={false} />;
}
