// Ocasiones y clima como DATOS (DATA_MODEL.md §4.9). Ajustarlos no exige tocar el algoritmo.
import type { SeasonId, StyleId, SubcategoryId } from '../domain/vocabulary';
import type { Temp, Weather } from './types';

export interface OccasionDef {
  id: string;
  label: string;
  /** Rango de formalidad objetivo (1–5). */
  range: readonly [number, number];
  styles: readonly StyleId[];
  /** Tipos de prenda que nunca se proponen para esta ocasión (salvo si los fijas tú). */
  exclude: readonly SubcategoryId[];
  /** Accesorios que encajan. */
  accessories: readonly SubcategoryId[];
}

const SPORTY_STUFF = ['sport-shoes', 'sport-shorts', 'sport-top'] as const;

export const OCCASIONS: readonly OccasionDef[] = [
  { id: 'casual', label: 'Casual', range: [1.5, 3], styles: ['casual', 'minimal', 'streetwear'], exclude: [], accessories: ['watch', 'cap', 'scarf', 'belt'] },
  { id: 'smart-casual', label: 'Smart casual', range: [2.5, 3.5], styles: ['classic', 'minimal', 'preppy'], exclude: [...SPORTY_STUFF, 'joggers'], accessories: ['belt', 'watch', 'scarf'] },
  { id: 'office', label: 'Oficina', range: [2.5, 3.5], styles: ['classic', 'minimal', 'preppy'], exclude: [...SPORTY_STUFF, 'sandals', 'shorts'], accessories: ['belt', 'watch', 'scarf'] },
  { id: 'office-formal', label: 'Reunión importante', range: [3.5, 4.5], styles: ['classic', 'minimal'], exclude: [...SPORTY_STUFF, 'sandals', 'shorts', 'hoodie', 'sweatshirt', 'joggers', 'cap'], accessories: ['belt', 'watch', 'tie', 'scarf'] },
  { id: 'night-out', label: 'Salida o cena', range: [2.5, 4], styles: ['minimal', 'classic', 'streetwear'], exclude: [...SPORTY_STUFF], accessories: ['belt', 'watch'] },
  {
    id: 'formal-event', label: 'Evento formal', range: [4.5, 5], styles: ['classic'],
    exclude: [...SPORTY_STUFF, 'sandals', 'shorts', 'hoodie', 'sweatshirt', 'joggers', 'cap', 'sneakers', 'jeans', 'tshirt', 'polo'],
    accessories: ['belt', 'watch', 'tie'],
  },
  { id: 'sport', label: 'Deporte', range: [1, 1.5], styles: ['sporty'], exclude: ['shoes', 'loafers', 'boots', 'blazer', 'trousers', 'shirt', 'coat'], accessories: ['watch', 'cap'] },
];

export const getOccasion = (id: string): OccasionDef => OCCASIONS.find((o) => o.id === id) ?? OCCASIONS[0]!;

export const TEMPS: readonly { id: Temp; label: string }[] = [
  { id: 'cold', label: 'Frío' },
  { id: 'mild', label: 'Templado' },
  { id: 'hot', label: 'Calor' },
];

/** Suma de abrigo (base + intermedia + exterior) adecuada para cada temperatura. */
export const WARMTH_TARGET: Record<Temp, readonly [number, number]> = {
  hot: [1, 3],
  mild: [3, 7],
  cold: [7, 12],
};

/** Abrigo típico por tipo, usado solo cuando la prenda no tiene `warmth` (se cuenta como dato desconocido). */
export const TYPICAL_WARMTH: Partial<Record<SubcategoryId, number>> = {
  tshirt: 1, polo: 1, 'sport-top': 1, shirt: 2, overshirt: 3, sweatshirt: 3, hoodie: 3, sweater: 3, cardigan: 3,
  blazer: 2, gilet: 2, raincoat: 2, jacket: 3, coat: 5, parka: 5, puffer: 5,
};

/** Estación por mes (hemisferio norte). */
export function seasonOf(date: Date): SeasonId {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** Clima por defecto según el mes (aproximación para Madrid). El usuario lo cambia con un toque. */
export function defaultWeather(date: Date): Weather {
  const m = date.getMonth() + 1;
  const temp: Temp = m === 12 || m <= 2 || m === 11 ? 'cold' : m >= 6 && m <= 9 ? 'hot' : 'mild';
  return { temp, rain: false };
}
