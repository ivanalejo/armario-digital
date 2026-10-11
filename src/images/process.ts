// Pipeline de imagen en el dispositivo (ARCHITECTURE.md §6).
// Lee el archivo original (que nunca se modifica), aplica orientación EXIF,
// rotación y recorte, y genera `display` (≤1600 px) y `thumb` (≤400 px) en WebP.
// Al reencodificar desde un canvas no se copia ningún metadato: EXIF y GPS desaparecen.
import { DISPLAY_MAX, THUMB_MAX, clampCrop, fitWithin, normalizeRotation, rotatedSize } from './geometry';
import type { ProcessOptions, ProcessedImage } from './types';

export class ImageError extends Error {
  override name = 'ImageError';
}

const DISPLAY_QUALITY = 0.82;
const THUMB_QUALITY = 0.75;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: AnyCanvas): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new ImageError('El navegador no permite procesar imágenes (sin contexto 2D).');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

async function encode(c: AnyCanvas, quality: number): Promise<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' }> {
  const toBlob = (type: string) =>
    'convertToBlob' in c
      ? c.convertToBlob({ type, quality })
      : new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ImageError('No se pudo codificar la imagen.'))), type, quality));
  const webp = await toBlob('image/webp');
  if (webp.type === 'image/webp') return { blob: webp, mime: 'image/webp' };
  // Algunos navegadores no codifican WebP y devuelven PNG: usamos JPEG.
  return { blob: await toBlob('image/jpeg'), mime: 'image/jpeg' };
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const HEIC = /\.(heic|heif)$/i;

export async function processImage(source: Blob, opts: ProcessOptions = {}): Promise<ProcessedImage> {
  const name = source instanceof File ? source.name : undefined;
  if (/hei[cf]/i.test(source.type) || (name && HEIC.test(name))) {
    throw new ImageError('Formato HEIC/HEIF no compatible con el navegador. Configura la cámara para guardar en JPEG o convierte la foto.');
  }
  if (source.size > 40 * 1024 * 1024) throw new ImageError('La imagen supera 40 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('No se pudo leer la imagen. ¿Está dañada o en un formato no compatible?');
  }

  try {
    const rotation = normalizeRotation(opts.rotation);
    const rot = rotatedSize(bitmap.width, bitmap.height, rotation);
    const crop = clampCrop(opts.crop, rot.width, rot.height);
    const out = fitWithin(crop.width, crop.height, DISPLAY_MAX);

    const display = makeCanvas(out.width, out.height);
    const ctx = ctx2d(display);
    ctx.scale(out.scale, out.scale);
    ctx.translate(-crop.x, -crop.y);
    ctx.translate(rot.width / 2, rot.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const t = fitWithin(out.width, out.height, THUMB_MAX);
    const thumb = makeCanvas(t.width, t.height);
    ctx2d(thumb).drawImage(display as CanvasImageSource, 0, 0, t.width, t.height);

    const [d, th, sourceSha] = await Promise.all([
      encode(display, DISPLAY_QUALITY),
      encode(thumb, THUMB_QUALITY),
      sha256Hex(source),
    ]);
    return {
      display: d.blob,
      thumb: th.blob,
      mime: d.mime,
      width: out.width,
      height: out.height,
      bytes: d.blob.size,
      sha256: await sha256Hex(d.blob),
      source: {
        ...(name ? { name } : {}),
        bytes: source.size,
        ...(source instanceof File ? { lastModified: source.lastModified } : {}),
        sha256: sourceSha,
      },
    };
  } finally {
    bitmap.close();
  }
}
