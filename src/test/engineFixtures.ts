// Inventarios sintéticos para las pruebas del motor (nunca datos reales).
import type { Item } from '../domain/schema';
import { getSubcategory, SUBCATEGORIES } from '../domain/vocabulary';

let seq = 0;
export function resetIds() {
  seq = 0;
}

/** Prenda de prueba: tipo + color, con el resto de atributos opcionales. */
export function mk(sub: string, color: string | undefined, extra: Partial<Item> = {}): Item {
  const def = getSubcategory(sub);
  if (!def) throw new Error(`subcategoría desconocida: ${sub}`);
  seq++;
  return {
    id: `itm_t${String(seq).padStart(5, '0')}_${sub.replace(/-/g, '')}`,
    name: `${def.label} ${color ?? ''}`.trim(),
    categoryId: def.categoryId,
    subcategoryId: def.id as Item['subcategoryId'],
    status: 'available',
    isDraft: false,
    favorite: false,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    ...(color ? { colors: { primary: color as never } } : {}),
    imageIds: [],
    ...extra,
  };
}

/** Armario realista y bien catalogado. */
export function sampleWardrobe(): Item[] {
  resetIds();
  return [
    mk('tshirt', 'white', { formality: { min: 2, max: 2 }, styles: ['casual', 'minimal'], warmth: 1, seasons: ['spring', 'summer', 'autumn'], pattern: 'solid', cut: { fit: 'regular' } }),
    mk('tshirt', 'navy', { formality: { min: 2, max: 2 }, styles: ['casual'], warmth: 1, pattern: 'solid', cut: { fit: 'oversized' } }),
    mk('shirt', 'light-blue', { formality: { min: 3, max: 4 }, styles: ['classic', 'preppy'], warmth: 2, pattern: 'solid', cut: { fit: 'slim' } }),
    mk('polo', 'navy', { formality: { min: 2, max: 3 }, styles: ['preppy', 'casual'], warmth: 1, pattern: 'solid' }),
    mk('sweater', 'grey', { formality: { min: 2, max: 3 }, styles: ['minimal', 'casual'], warmth: 3, seasons: ['autumn', 'winter'], pattern: 'texture' }),
    mk('jeans', 'navy', { formality: { min: 2, max: 3 }, styles: ['casual', 'classic'], pattern: 'solid', cut: { leg: 'tapered', waist: 'belt-loops' } }),
    mk('chinos', 'beige', { formality: { min: 2, max: 3 }, styles: ['classic', 'casual'], pattern: 'solid', cut: { leg: 'slim', waist: 'belt-loops' } }),
    mk('trousers', 'charcoal', { formality: { min: 4, max: 5 }, styles: ['classic'], pattern: 'solid', cut: { leg: 'straight', waist: 'belt-loops' } }),
    mk('sneakers', 'white', { formality: { min: 1, max: 3 }, styles: ['casual', 'minimal'], cut: { profile: 'standard' } }),
    mk('boots', 'brown', { formality: { min: 2, max: 3 }, styles: ['classic', 'workwear'], material: 'ante' }),
    mk('shoes', 'black', { formality: { min: 4, max: 5 }, styles: ['classic'], cut: { profile: 'sleek' } }),
    mk('jacket', 'olive', { formality: { min: 2, max: 3 }, styles: ['casual', 'workwear'], warmth: 3, waterproof: false }),
    mk('coat', 'camel', { formality: { min: 3, max: 4 }, styles: ['classic'], warmth: 5, seasons: ['autumn', 'winter'] }),
    mk('raincoat', 'navy', { formality: { min: 2, max: 3 }, styles: ['casual', 'minimal'], warmth: 2, waterproof: true }),
    mk('blazer', 'navy', { formality: { min: 3, max: 4 }, styles: ['classic'], warmth: 2, cut: { structure: 'structured' } }),
    mk('belt', 'brown', { formality: { min: 2, max: 4 } }),
    mk('belt', 'black', { formality: { min: 3, max: 5 } }),
    mk('watch', 'silver', {}),
    mk('scarf', 'grey', {}),
  ];
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['black', 'white', 'navy', 'grey', 'beige', 'olive', 'brown', 'blue', 'red', 'light-blue', 'burgundy', 'green', 'mustard'];
const STATUSES = ['available', 'available', 'available', 'available', 'laundry', 'stored'] as const;

/** Armario aleatorio con datos incompletos, estimados, no disponibles y borradores. */
export function randomWardrobe(r: () => number, size: number): Item[] {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const out: Item[] = [];
  for (let i = 0; i < size; i++) {
    const sub = pick(SUBCATEGORIES).id;
    const lo = 1 + Math.floor(r() * 5);
    const hi = Math.min(5, lo + Math.floor(r() * 2));
    const extra: Partial<Item> = {
      status: pick(STATUSES),
      isDraft: r() < 0.08,
      favorite: r() < 0.15,
      ...(r() < 0.7 ? { formality: { min: lo, max: hi } } : {}),
      ...(r() < 0.6 ? { styles: [pick(['classic', 'minimal', 'casual', 'streetwear', 'sporty', 'preppy', 'workwear', 'outdoor'] as const)] } : {}),
      ...(r() < 0.5 ? { warmth: 1 + Math.floor(r() * 5) } : {}),
      ...(r() < 0.3 ? { pattern: pick(['solid', 'stripes', 'checks', 'graphic'] as const) } : {}),
      ...(r() < 0.2 ? { estimated: ['formality'].filter(() => true) } : {}),
    };
    if (extra.estimated && !extra.formality) delete extra.estimated;
    out.push(mk(sub, r() < 0.9 ? pick(COLORS) : undefined, extra));
  }
  return out;
}
