// Carga un armario SINTÉTICO directamente en IndexedDB, en el mismo formato que
// guarda la app v0.1.1 (fichas + metadatos + binarios ArrayBuffer). Las «fotos»
// son siluetas dibujadas en un canvas: nunca se usan fotos reales.
import type { Page } from '@playwright/test';

export interface SeedItem {
  sub: string;
  cat: 'top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory';
  name: string;
  color: string;
  hex: string;
  extra?: Record<string, unknown>;
}

export const WARDROBE: SeedItem[] = [
  { sub: 'tshirt', cat: 'top', name: 'Camiseta blanca', color: 'white', hex: '#f3f3f1', extra: { formality: { min: 2, max: 2 }, styles: ['casual', 'minimal'], warmth: 1, cut: { fit: 'regular', sleeve: 'short' } } },
  { sub: 'tshirt', cat: 'top', name: 'Camiseta azul marino oversize', color: 'navy', hex: '#1f2a44', extra: { formality: { min: 2, max: 2 }, styles: ['casual', 'streetwear'], warmth: 1, cut: { fit: 'oversized' } } },
  { sub: 'shirt', cat: 'top', name: 'Camisa Oxford azul claro', color: 'light-blue', hex: '#a9c6e8', extra: { formality: { min: 3, max: 4 }, styles: ['classic', 'preppy'], warmth: 2, cut: { fit: 'slim', neckline: 'button-down' }, favorite: true } },
  { sub: 'sweater', cat: 'top', name: 'Jersey gris', color: 'grey', hex: '#8a8d91', extra: { formality: { min: 2, max: 3 }, styles: ['minimal', 'casual'], warmth: 3, seasons: ['autumn', 'winter'], pattern: 'texture' } },
  { sub: 'jeans', cat: 'bottom', name: 'Vaqueros oscuros tapered', color: 'navy', hex: '#26324d', extra: { formality: { min: 2, max: 3 }, styles: ['casual', 'classic'], cut: { leg: 'tapered', waist: 'belt-loops' } } },
  { sub: 'chinos', cat: 'bottom', name: 'Chinos beige', color: 'beige', hex: '#d8c7a6', extra: { formality: { min: 2, max: 3 }, styles: ['classic', 'casual'], cut: { leg: 'slim', waist: 'belt-loops' }, estimated: ['cut.leg'] } },
  { sub: 'sneakers', cat: 'footwear', name: 'Zapatillas blancas', color: 'white', hex: '#fafafa', extra: { formality: { min: 1, max: 3 }, styles: ['casual', 'minimal'] } },
  { sub: 'boots', cat: 'footwear', name: 'Botas chukka marrones', color: 'brown', hex: '#5e3f2a', extra: { formality: { min: 2, max: 3 }, styles: ['classic', 'workwear'], material: 'ante' } },
  { sub: 'jacket', cat: 'outerwear', name: 'Cazadora verde oliva', color: 'olive', hex: '#6b6b3a', extra: { formality: { min: 2, max: 3 }, styles: ['casual', 'workwear'], warmth: 3 } },
  { sub: 'raincoat', cat: 'outerwear', name: 'Impermeable azul marino', color: 'navy', hex: '#24304a', extra: { formality: { min: 2, max: 3 }, styles: ['minimal'], warmth: 2, waterproof: true } },
  { sub: 'belt', cat: 'accessory', name: 'Cinturón de piel marrón', color: 'brown', hex: '#6b4a32', extra: { formality: { min: 2, max: 4 } } },
  { sub: 'watch', cat: 'accessory', name: 'Reloj de acero', color: 'silver', hex: '#b9bec4', extra: {} },
];

/** Inserta el armario y devuelve los IDs creados, en el mismo orden. */
export async function seedWardrobe(page: Page, items: SeedItem[] = WARDROBE, opts: { status?: Record<number, string> } = {}): Promise<string[]> {
  return page.evaluate(
    async ({ items, status }) => {
      async function draw(cat: string, hex: string, w: number, h: number): Promise<ArrayBuffer> {
        const cv = new OffscreenCanvas(w, h);
        const x = cv.getContext('2d')!;
        x.fillStyle = '#ece8e1';
        x.fillRect(0, 0, w, h);
        x.fillStyle = hex;
        x.strokeStyle = 'rgba(0,0,0,0.18)';
        x.lineWidth = w / 120;
        const P = (pts: number[][]) => {
          x.beginPath();
          pts.forEach(([a, b], i) => (i ? x.lineTo(a! * w, b! * h) : x.moveTo(a! * w, b! * h)));
          x.closePath();
          x.fill();
          x.stroke();
        };
        if (cat === 'top') P([[0.32, 0.2], [0.68, 0.2], [0.9, 0.34], [0.8, 0.44], [0.72, 0.38], [0.72, 0.82], [0.28, 0.82], [0.28, 0.38], [0.2, 0.44], [0.1, 0.34]]);
        else if (cat === 'outerwear') P([[0.3, 0.14], [0.7, 0.14], [0.92, 0.3], [0.86, 0.7], [0.76, 0.68], [0.76, 0.9], [0.24, 0.9], [0.24, 0.68], [0.14, 0.7], [0.08, 0.3]]);
        else if (cat === 'bottom') P([[0.3, 0.1], [0.7, 0.1], [0.74, 0.92], [0.55, 0.92], [0.5, 0.36], [0.45, 0.92], [0.26, 0.92]]);
        else if (cat === 'footwear') P([[0.12, 0.62], [0.42, 0.6], [0.5, 0.48], [0.62, 0.5], [0.66, 0.6], [0.9, 0.66], [0.9, 0.74], [0.12, 0.74]]);
        else {
          x.beginPath();
          x.arc(w / 2, h / 2, w * 0.22, 0, Math.PI * 2);
          x.fill();
          x.stroke();
        }
        const blob = await cv.convertToBlob({ type: 'image/webp', quality: 0.8 });
        return blob.arrayBuffer();
      }
      const now = Date.now();
      const records: { item: { id: string } & Record<string, unknown>; image: Record<string, unknown>; blobs: Record<string, unknown>[] }[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        const n = String(i + 1).padStart(4, '0');
        const id = `itm_seed${n}_${it.sub.replace(/-/g, '')}`;
        const imgId = `img_seed${n}`;
        const created = new Date(now - (items.length - i) * 3_600_000).toISOString();
        const display = await draw(it.cat, it.hex, 600, 800);
        const thumb = await draw(it.cat, it.hex, 300, 400);
        records.push({
          item: { id, name: it.name, categoryId: it.cat, subcategoryId: it.sub, status: status[i] ?? 'available', isDraft: false, favorite: false, createdAt: created, updatedAt: created, colors: { primary: it.color, secondary: [] }, imageIds: [imgId], ...it.extra },
          image: { id: imgId, itemId: id, mime: 'image/webp', width: 600, height: 800, bytes: display.byteLength, sha256: 'b'.repeat(64), createdAt: created },
          blobs: [{ imageId: imgId, variant: 'display', data: display, type: 'image/webp' }, { imageId: imgId, variant: 'thumb', data: thumb, type: 'image/webp' }],
        });
      }
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('armario-digital');
        req.onsuccess = () => {
          const tx = req.result.transaction(['items', 'images', 'blobs'], 'readwrite');
          for (const r of records) {
            tx.objectStore('items').put(r.item);
            tx.objectStore('images').put(r.image);
            for (const b of r.blobs) tx.objectStore('blobs').put(b);
          }
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
      return records.map((r) => r.item.id);
    },
    { items, status: opts.status ?? {} },
  );
}
