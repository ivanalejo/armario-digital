// Paleta controlada con alias (DATA_MODEL.md §4.2).
import { normalizeText } from '../text';

export type ColorFamily = 'neutral' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'brown' | 'metal';
export type ColorTone = 'light' | 'mid' | 'dark';

export interface ColorDef {
  id: string;
  label: string;
  aliases: readonly string[];
  hex: string;
  family: ColorFamily;
  tone: ColorTone;
  neutral: boolean;
}

export const COLORS = [
  { id: 'black', label: 'Negro', aliases: [], hex: '#1b1b1b', family: 'neutral', tone: 'dark', neutral: true },
  { id: 'charcoal', label: 'Gris marengo', aliases: ['gris oscuro', 'antracita'], hex: '#3d4045', family: 'neutral', tone: 'dark', neutral: true },
  { id: 'grey', label: 'Gris', aliases: ['gris medio', 'gris jaspeado'], hex: '#8a8d91', family: 'neutral', tone: 'mid', neutral: true },
  { id: 'light-grey', label: 'Gris claro', aliases: ['perla'], hex: '#c9cbce', family: 'neutral', tone: 'light', neutral: true },
  { id: 'white', label: 'Blanco', aliases: [], hex: '#fafafa', family: 'neutral', tone: 'light', neutral: true },
  { id: 'off-white', label: 'Crudo', aliases: ['hueso', 'marfil', 'ecru', 'blanco roto'], hex: '#efe9dc', family: 'neutral', tone: 'light', neutral: true },
  { id: 'beige', label: 'Beige', aliases: ['arena', 'piedra', 'stone'], hex: '#d8c7a6', family: 'neutral', tone: 'light', neutral: true },
  { id: 'camel', label: 'Camel', aliases: ['tostado', 'tan'], hex: '#b8864f', family: 'brown', tone: 'mid', neutral: true },
  { id: 'brown', label: 'Marrón', aliases: ['chocolate', 'cuero'], hex: '#5e3f2a', family: 'brown', tone: 'dark', neutral: true },
  { id: 'navy', label: 'Azul marino', aliases: ['navy', 'azul oscuro', 'azul noche', 'marino'], hex: '#1f2a44', family: 'blue', tone: 'dark', neutral: true },
  { id: 'blue', label: 'Azul', aliases: ['azul medio', 'azulon', 'royal'], hex: '#2f5fb3', family: 'blue', tone: 'mid', neutral: false },
  { id: 'light-blue', label: 'Azul claro', aliases: ['celeste', 'azul cielo'], hex: '#a9c6e8', family: 'blue', tone: 'light', neutral: false },
  { id: 'denim', label: 'Azul vaquero', aliases: ['indigo', 'vaquero'], hex: '#3e5f8a', family: 'blue', tone: 'mid', neutral: true },
  { id: 'olive', label: 'Verde oliva', aliases: ['caqui', 'khaki', 'verde militar', 'oliva'], hex: '#6b6b3a', family: 'green', tone: 'mid', neutral: true },
  { id: 'green', label: 'Verde', aliases: [], hex: '#3f8f4f', family: 'green', tone: 'mid', neutral: false },
  { id: 'dark-green', label: 'Verde botella', aliases: ['verde bosque'], hex: '#24432f', family: 'green', tone: 'dark', neutral: false },
  { id: 'burgundy', label: 'Burdeos', aliases: ['granate', 'vino'], hex: '#6b1f2e', family: 'red', tone: 'dark', neutral: false },
  { id: 'red', label: 'Rojo', aliases: [], hex: '#c0332b', family: 'red', tone: 'mid', neutral: false },
  { id: 'pink', label: 'Rosa', aliases: ['rosa palo'], hex: '#e7a9b4', family: 'red', tone: 'light', neutral: false },
  { id: 'orange', label: 'Naranja', aliases: ['teja', 'oxido'], hex: '#d9702b', family: 'yellow', tone: 'mid', neutral: false },
  { id: 'mustard', label: 'Mostaza', aliases: ['ocre'], hex: '#c9a227', family: 'yellow', tone: 'mid', neutral: false },
  { id: 'yellow', label: 'Amarillo', aliases: [], hex: '#f0d24a', family: 'yellow', tone: 'light', neutral: false },
  { id: 'purple', label: 'Morado', aliases: ['lila', 'malva', 'violeta'], hex: '#7a4f9a', family: 'purple', tone: 'mid', neutral: false },
  { id: 'silver', label: 'Plateado', aliases: ['acero', 'plata'], hex: '#b9bec4', family: 'metal', tone: 'light', neutral: true },
  { id: 'gold', label: 'Dorado', aliases: ['oro'], hex: '#c8a24a', family: 'metal', tone: 'mid', neutral: true },
] as const satisfies readonly ColorDef[];

export type ColorId = (typeof COLORS)[number]['id'];
export const COLOR_IDS = COLORS.map((c) => c.id) as [ColorId, ...ColorId[]];

const byId = new Map<string, ColorDef>(COLORS.map((c) => [c.id, c]));
const byName = new Map<string, ColorId>();
for (const c of COLORS) {
  for (const n of [c.id, c.label, ...c.aliases]) byName.set(normalizeText(n), c.id);
}

export const getColor = (id: string): ColorDef | undefined => byId.get(id);

/** Convierte un nombre, alias o ID ("Azul oscuro", "navy") al ID canónico. */
export function resolveColor(input: string): ColorId | undefined {
  return byName.get(normalizeText(input));
}

/** IDs de color cuyo nombre o alias contiene el texto (para la búsqueda). */
export function colorsMatching(query: string): ColorId[] {
  const q = normalizeText(query);
  if (!q) return [];
  const out = new Set<ColorId>();
  for (const [name, id] of byName) if (name.includes(q)) out.add(id);
  return [...out];
}
