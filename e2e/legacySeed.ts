// Siembra datos SINTÉTICOS con el formato exacto que guardan v0.1.0/v0.1.1:
// fichas + metadatos + binarios (ArrayBuffer + tipo; y una foto como Blob, v0.1.0).
import type { Page } from '@playwright/test';

export const LEGACY_ITEMS = [
  { sub: 'tshirt', cat: 'top', name: 'Camiseta blanca', color: 'white', hex: '#f1f1ef' },
  { sub: 'jeans', cat: 'bottom', name: 'Vaqueros oscuros', color: 'navy', hex: '#24304a' },
  { sub: 'sneakers', cat: 'footwear', name: 'Zapatillas blancas', color: 'white', hex: '#fafafa' },
  { sub: 'jacket', cat: 'outerwear', name: 'Cazadora oliva', color: 'olive', hex: '#6b6b3a' },
] as const;

export async function seedLegacy(page: Page): Promise<string[]> {
  return page.evaluate(async (items) => {
    const enc = async (hex: string, w: number, h: number) => {
      const cv = new OffscreenCanvas(w, h);
      const x = cv.getContext('2d')!;
      x.fillStyle = '#ece8e1';
      x.fillRect(0, 0, w, h);
      x.fillStyle = hex;
      x.fillRect(w * 0.25, h * 0.2, w * 0.5, h * 0.6);
      return cv.convertToBlob({ type: 'image/webp', quality: 0.8 });
    };
    const ids: string[] = [];
    const recs: { item: Record<string, unknown>; image: Record<string, unknown>; blobs: Record<string, unknown>[] }[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const id = `itm_legacy${String(i + 1).padStart(4, '0')}`;
      const imgId = `img_legacy${String(i + 1).padStart(4, '0')}`;
      const at = new Date(Date.UTC(2026, 9, 5, 10, i)).toISOString();
      const display = await enc(it.hex, 600, 800);
      const thumb = await enc(it.hex, 150, 200);
      ids.push(id);
      recs.push({
        item: { id, name: it.name, categoryId: it.cat, subcategoryId: it.sub, status: 'available', isDraft: false, favorite: i === 0, createdAt: at, updatedAt: at, colors: { primary: it.color, secondary: [] }, imageIds: [imgId] },
        image: { id: imgId, itemId: id, mime: 'image/webp', width: 600, height: 800, bytes: display.size, sha256: String(i + 1).repeat(64).slice(0, 64), createdAt: at, source: { name: `IMG_${i + 1}.jpg` } },
        // La primera foto, como la guardaba v0.1.0 (Blob); el resto, como v0.1.1 (ArrayBuffer + tipo).
        blobs:
          i === 0
            ? [{ imageId: imgId, variant: 'display', blob: display }, { imageId: imgId, variant: 'thumb', blob: thumb }]
            : [{ imageId: imgId, variant: 'display', data: await display.arrayBuffer(), type: 'image/webp' }, { imageId: imgId, variant: 'thumb', data: await thumb.arrayBuffer(), type: 'image/webp' }],
      });
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('armario-digital');
      req.onsuccess = () => {
        const tx = req.result.transaction(['items', 'images', 'blobs', 'outfits', 'wearLog'], 'readwrite');
        for (const r of recs) {
          tx.objectStore('items').put(r.item);
          tx.objectStore('images').put(r.image);
          for (const b of r.blobs) tx.objectStore('blobs').put(b);
        }
        tx.objectStore('outfits').put({ id: 'out_legacy000001', slots: { base: ids[0], bottom: ids[1], footwear: ids[2] }, origin: 'manual', favorite: true, createdAt: new Date(Date.UTC(2026, 9, 6)).toISOString() });
        tx.objectStore('wearLog').put({ id: 'wear_legacy00001', date: '2026-10-06', itemIds: [ids[0], ids[1], ids[2]] });
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    return ids;
  }, LEGACY_ITEMS);
}

/** Recuento y huella de todo el contenido (para comparar origen y destino). */
export async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const req = indexedDB.open('armario-digital');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['items', 'images', 'blobs', 'outfits', 'wearLog'], 'readonly');
          const all = (n: string) => new Promise<unknown[]>((r) => { const q = tx.objectStore(n).getAll(); q.onsuccess = () => r(q.result); });
          void Promise.all(['items', 'images', 'blobs', 'outfits', 'wearLog'].map(all)).then(async ([items, images, blobs, outfits, wearLog]) => {
            const sizes: Record<string, number> = {};
            for (const b of blobs as { imageId: string; variant: string; data?: ArrayBuffer; blob?: Blob }[]) {
              const buf = b.data ?? (await b.blob!.arrayBuffer());
              const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
              sizes[`${b.imageId}/${b.variant}`] = d.reduce((a, x) => (a * 31 + x) >>> 0, 7);
            }
            db.close();
            const sort = (xs: unknown[]) => [...xs].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
            resolve({ items: sort(items!), images: sort(images!), blobs: sizes, outfits: sort(outfits!), wearLog: sort(wearLog!) });
          });
        };
      }),
  );
}
