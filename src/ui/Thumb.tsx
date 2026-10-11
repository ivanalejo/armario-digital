import { useEffect, useState } from 'react';
import { getBlob } from '../db/items';
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

export function useStoredImage(imageId: string | undefined, variant: BlobVariant): Blob | undefined {
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let alive = true;
    setBlob(undefined);
    if (imageId) void getBlob(imageId, variant).then((b) => alive && setBlob(b));
    return () => {
      alive = false;
    };
  }, [imageId, variant]);
  return blob;
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
  const url = useObjectUrl(blob ?? stored);
  if (!url) return <div className={`thumb thumb--empty ${className ?? ''}`} aria-label={alt} />;
  return <img className={`thumb ${className ?? ''}`} src={url} alt={alt} loading="lazy" decoding="async" draggable={false} />;
}
