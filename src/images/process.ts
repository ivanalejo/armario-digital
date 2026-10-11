// Pipeline de imagen en el dispositivo (ARCHITECTURE.md §6).
// 1. Lee el archivo original una sola vez a memoria (nunca lo modifica).
// 2. Decodifica con orientación EXIF, aplica giro y recorte.
// 3. Genera `display` (≤1600 px) y `thumb` (≤400 px) en WebP; al reencodificar
//    desde un canvas no se copia ningún metadato: EXIF y GPS desaparecen.
// Cada paso tiene tiempo límite y un mensaje de error comprensible.
import { TimeoutError, timeouts, withTimeout } from '../platform/timeouts';
import { DISPLAY_MAX, THUMB_MAX, clampCrop, fitWithin, normalizeRotation, rotatedSize } from './geometry';
import type { ProcessOptions, ProcessedImage } from './types';

export class ImageError extends Error {
  override name = 'ImageError';
}

const DISPLAY_QUALITY = 0.82;
const THUMB_QUALITY = 0.75;
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PIXELS = 100_000_000; // 100 MP: por encima, riesgo real de agotar la memoria del móvil
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const HEIC = /\.(heic|heif)$/i;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number, dom = false): AnyCanvas {
  if (!dom && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: AnyCanvas): Ctx {
  // willReadFrequently: canvas en CPU. Evita depender de la GPU para codificar,
  // que en Android puede quedarse esperando si el proceso de GPU se reinicia.
  const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new ImageError('El navegador no permite procesar imágenes (sin contexto 2D).');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function toBlob(c: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality });
  return new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new ImageError('No se pudo codificar la imagen.'))), type, quality),
  );
}

async function encodeOnce(c: AnyCanvas, quality: number): Promise<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' }> {
  const ms = timeouts().image;
  const webp = await withTimeout(toBlob(c, 'image/webp', quality), ms, 'encode');
  if (webp.type === 'image/webp' && webp.size > 0) return { blob: webp, mime: 'image/webp' };
  // Navegadores sin codificador WebP devuelven PNG: se usa JPEG.
  return { blob: await withTimeout(toBlob(c, 'image/jpeg', quality), ms, 'encode'), mime: 'image/jpeg' };
}

/** Codifica; si el canvas acelerado falla o no responde, repite con un canvas del DOM. */
async function encode(c: AnyCanvas, quality: number): Promise<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' }> {
  try {
    return await encodeOnce(c, quality);
  } catch (first) {
    if (!('convertToBlob' in c) || typeof document === 'undefined') throw first;
    const dom = makeCanvas(c.width, c.height, true);
    ctx2d(dom).drawImage(c as CanvasImageSource, 0, 0);
    return encodeOnce(dom, quality);
  }
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function describe(name: string | undefined): string {
  return name ? `«${name}»` : 'La imagen';
}

function friendly(err: unknown, label: string): ImageError {
  if (err instanceof ImageError) return err;
  if (err instanceof TimeoutError) {
    return new ImageError(`${label}: el procesado ha tardado demasiado y se ha cancelado. Inténtalo de nuevo; si se repite con esta foto, prueba con otra o haz una captura de ella.`);
  }
  const e = err as Error;
  if (e?.name === 'QuotaExceededError') return new ImageError(`${label}: no hay memoria o espacio suficiente para procesarla.`);
  return new ImageError(`${label}: no se pudo procesar (${e?.message ?? String(err)}).`);
}

export async function processImage(source: Blob, opts: ProcessOptions = {}): Promise<ProcessedImage> {
  const name = source instanceof File ? source.name : undefined;
  const label = describe(name);
  const ms = timeouts().image;

  if (/hei[cf]/i.test(source.type) || (name && HEIC.test(name))) {
    throw new ImageError(`${label}: formato HEIC/HEIF no compatible con el navegador. Configura la cámara para guardar en JPEG o convierte la foto.`);
  }
  if (source.type && !source.type.startsWith('image/')) {
    throw new ImageError(`${label}: no es una imagen (${source.type}).`);
  }
  if (!source.type && name && !IMAGE_EXT.test(name)) {
    throw new ImageError(`${label}: no parece una imagen compatible (JPEG, PNG o WebP).`);
  }
  if (source.size === 0) throw new ImageError(`${label}: el archivo está vacío.`);
  if (source.size > MAX_BYTES) throw new ImageError(`${label}: supera 40 MB.`);

  let bitmap: ImageBitmap | undefined;
  try {
    // Una sola lectura del archivo: las fotos de la galería pueden venir de un
    // proveedor externo (p. ej. nube) y leerlas varias veces es más lento y frágil.
    let bytes: ArrayBuffer;
    try {
      bytes = await withTimeout(source.arrayBuffer(), ms, 'read');
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new ImageError(`${label}: no se ha podido leer el archivo a tiempo. Si la foto está solo en la nube, descárgala primero al móvil.`);
      }
      throw new ImageError(`${label}: no se ha podido leer el archivo (${(err as Error).message}).`);
    }
    const local = new Blob([bytes], { type: source.type });
    const sourceSha = sha256Hex(bytes);

    try {
      bitmap = await withTimeout(createImageBitmap(local, { imageOrientation: 'from-image' }), ms, 'decode');
    } catch (err) {
      if (err instanceof TimeoutError) throw err;
      throw new ImageError(`${label}: no se pudo leer la imagen. ¿Está dañada o en un formato no compatible?`);
    }
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new ImageError(`${label}: es demasiado grande (${bitmap.width}×${bitmap.height}). Usa una versión de menos de 100 megapíxeles.`);
    }

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
    bitmap.close(); // liberar la imagen decodificada cuanto antes
    bitmap = undefined;

    const t = fitWithin(out.width, out.height, THUMB_MAX);
    const thumb = makeCanvas(t.width, t.height);
    ctx2d(thumb).drawImage(display as CanvasImageSource, 0, 0, t.width, t.height);

    const d = await encode(display, DISPLAY_QUALITY);
    const th = await encode(thumb, THUMB_QUALITY);
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
        sha256: await sourceSha,
      },
    };
  } catch (err) {
    throw friendly(err, label);
  } finally {
    bitmap?.close();
  }
}
