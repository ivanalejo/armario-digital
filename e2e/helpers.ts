import type { Page } from '@playwright/test';

/** Segmento APP1 EXIF mínimo con un IFD de GPS (latitud «N») y una marca reconocible. */
function exifSegment(): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4);
  let o = 0;
  tiff.write('II', o); o += 2;
  tiff.writeUInt16LE(42, o); o += 2;
  tiff.writeUInt32LE(8, o); o += 4; // IFD0 en 8
  tiff.writeUInt16LE(1, o); o += 2; // 1 entrada
  tiff.writeUInt16LE(0x8825, o); tiff.writeUInt16LE(4, o + 2); tiff.writeUInt32LE(1, o + 4); tiff.writeUInt32LE(26, o + 8); o += 12; // GPSInfo → 26
  tiff.writeUInt32LE(0, o); o += 4; // sin IFD siguiente
  tiff.writeUInt16LE(1, o); o += 2; // GPS IFD: 1 entrada
  tiff.writeUInt16LE(0x0001, o); tiff.writeUInt16LE(2, o + 2); tiff.writeUInt32LE(2, o + 4); tiff.write('N\0', o + 8); o += 12; // GPSLatitudeRef = "N"
  tiff.writeUInt32LE(0, o);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff, Buffer.from('GPSMARKER')]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** Genera en el navegador un JPEG de prueba (sintético, nunca una foto real) y le inyecta EXIF con GPS. */
export async function makeJpegWithGps(page: Page, width = 2400, height = 3200, color = '#1f2a44'): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([w, h, c]) => {
      const cv = new OffscreenCanvas(w as number, h as number);
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = c as string;
      ctx.fillRect(0, 0, w as number, h as number);
      ctx.fillStyle = '#fff';
      ctx.fillRect((w as number) / 4, (h as number) / 4, (w as number) / 2, (h as number) / 2);
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    },
    [width, height, color],
  );
  const jpeg = Buffer.from(b64, 'base64');
  // Insertar APP1 justo después de SOI (FFD8).
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(), jpeg.subarray(2)]);
}

/** Lee el contenido de la base de datos de la app desde la página. */
export async function readDb(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ items: unknown[]; images: { id: string; width: number; height: number; mime: string; source?: { name?: string } }[]; blobs: { imageId: string; variant: string; type: string; size: number; hasExif: boolean; hasGps: boolean }[] }>((resolve, reject) => {
        const req = indexedDB.open('armario-digital');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['items', 'images', 'blobs'], 'readonly');
          const all = (name: string) => new Promise<unknown[]>((res) => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
          void Promise.all([all('items'), all('images'), all('blobs')]).then(async ([items, images, blobs]) => {
            const out = [];
            for (const b of blobs as { imageId: string; variant: string; blob: Blob }[]) {
              const text = new TextDecoder('latin1').decode(await b.blob.arrayBuffer());
              out.push({ imageId: b.imageId, variant: b.variant, type: b.blob.type, size: b.blob.size, hasExif: text.includes('Exif'), hasGps: text.includes('GPSMARKER') });
            }
            db.close();
            resolve({ items, images: images as never, blobs: out });
          });
        };
      }),
  );
}
