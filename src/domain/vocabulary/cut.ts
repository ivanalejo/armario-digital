// Corte y silueta: atributos específicos por tipo de prenda (DATA_MODEL.md §4.8, ADR-011).
// Añadir un atributo o un valor = añadir una entrada aquí. Una misma clave
// (p. ej. `length`) puede definirse con valores distintos para cada categoría.
// `cut` es un mapa:
// no requiere migración de base de datos.
import type { CategoryId, SubcategoryId } from './categories';

export interface CutValue {
  id: string;
  label: string;
  /** 0 ceñido … 3 muy amplio. Lo usará el recomendador para equilibrar proporciones. */
  volume?: 0 | 1 | 2 | 3;
}

export interface CutAttrDef {
  key: string;
  label: string;
  values: readonly CutValue[];
  categories: readonly CategoryId[];
  /** Si se indica, solo estas subcategorías (dentro de `categories`). */
  only?: readonly SubcategoryId[];
  /** Subcategorías excluidas. */
  except?: readonly SubcategoryId[];
}

const FIT: readonly CutValue[] = [
  { id: 'slim', label: 'Entallado', volume: 0 },
  { id: 'regular', label: 'Regular', volume: 1 },
  { id: 'relaxed', label: 'Holgado', volume: 2 },
  { id: 'boxy', label: 'Recto / boxy', volume: 2 },
  { id: 'oversized', label: 'Oversize', volume: 3 },
];
const DRAPE: readonly CutValue[] = [
  { id: 'structured', label: 'Estructurada' },
  { id: 'soft', label: 'Suave' },
  { id: 'fluid', label: 'Fluida' },
];
const SHORTS = ['shorts', 'sport-shorts'] as const;

export const CUT_ATTRS: readonly CutAttrDef[] = [
  // Partes superiores
  { key: 'fit', label: 'Ajuste', categories: ['top', 'outerwear'], values: FIT },
  {
    key: 'length', label: 'Largo', categories: ['top'],
    values: [
      { id: 'cropped', label: 'Corto' },
      { id: 'regular', label: 'Normal' },
      { id: 'long', label: 'Largo' },
    ],
  },
  {
    key: 'sleeve', label: 'Manga', categories: ['top'],
    values: [
      { id: 'sleeveless', label: 'Sin manga' },
      { id: 'short', label: 'Corta' },
      { id: 'three-quarter', label: 'Tres cuartos' },
      { id: 'long', label: 'Larga' },
    ],
  },
  {
    key: 'neckline', label: 'Cuello', categories: ['top'],
    values: [
      { id: 'crew', label: 'Redondo' },
      { id: 'v-neck', label: 'Pico' },
      { id: 'henley', label: 'Henley' },
      { id: 'polo', label: 'Polo' },
      { id: 'point-collar', label: 'Camisero' },
      { id: 'button-down', label: 'Button-down' },
      { id: 'band', label: 'Mao' },
      { id: 'mock', label: 'Perkins' },
      { id: 'turtleneck', label: 'Vuelto' },
      { id: 'hood', label: 'Capucha' },
    ],
  },
  { key: 'drape', label: 'Caída', categories: ['top', 'bottom'], values: DRAPE },
  // Partes inferiores
  {
    key: 'leg', label: 'Pierna', categories: ['bottom'], except: SHORTS,
    values: [
      { id: 'skinny', label: 'Pitillo', volume: 0 },
      { id: 'slim', label: 'Slim', volume: 0 },
      { id: 'tapered', label: 'Tapered', volume: 1 },
      { id: 'straight', label: 'Recto', volume: 1 },
      { id: 'bootcut', label: 'Bootcut', volume: 1 },
      { id: 'relaxed', label: 'Relajado', volume: 2 },
      { id: 'wide-leg', label: 'Ancho', volume: 3 },
      { id: 'baggy', label: 'Baggy', volume: 3 },
    ],
  },
  {
    key: 'rise', label: 'Tiro', categories: ['bottom'],
    values: [
      { id: 'low', label: 'Bajo' },
      { id: 'mid', label: 'Medio' },
      { id: 'high', label: 'Alto' },
    ],
  },
  {
    key: 'length', label: 'Largo', categories: ['bottom'], except: SHORTS,
    values: [
      { id: 'cropped', label: 'Tobillero corto' },
      { id: 'ankle', label: 'Al tobillo' },
      { id: 'full', label: 'Completo' },
      { id: 'stacked', label: 'Con pliegues' },
    ],
  },
  {
    key: 'inseam', label: 'Largo', categories: ['bottom'], only: SHORTS,
    values: [
      { id: 'short', label: 'Corto' },
      { id: 'mid', label: 'Medio' },
      { id: 'knee', label: 'A la rodilla' },
    ],
  },
  {
    key: 'waist', label: 'Cintura', categories: ['bottom'],
    values: [
      { id: 'belt-loops', label: 'Trabillas' },
      { id: 'elastic', label: 'Elástica' },
      { id: 'drawstring', label: 'Cordón' },
      { id: 'side-adjusters', label: 'Ajustadores laterales' },
    ],
  },
  {
    key: 'front', label: 'Delantero', categories: ['bottom'], only: ['chinos', 'trousers'],
    values: [
      { id: 'flat', label: 'Liso' },
      { id: 'pleated', label: 'Con pinzas' },
    ],
  },
  // Prendas exteriores (fit compartido arriba)
  {
    key: 'length', label: 'Largo', categories: ['outerwear'],
    values: [
      { id: 'cropped', label: 'Corta' },
      { id: 'hip', label: 'A la cadera' },
      { id: 'thigh', label: 'Medio muslo' },
      { id: 'knee', label: 'A la rodilla' },
      { id: 'long', label: 'Larga' },
    ],
  },
  {
    key: 'structure', label: 'Estructura', categories: ['outerwear'],
    values: [
      { id: 'structured', label: 'Estructurada' },
      { id: 'semi', label: 'Semiestructurada' },
      { id: 'unstructured', label: 'Desestructurada' },
    ],
  },
  {
    key: 'closure', label: 'Cierre', categories: ['outerwear'],
    values: [
      { id: 'single-breasted', label: 'Botonadura sencilla' },
      { id: 'double-breasted', label: 'Cruzada' },
      { id: 'zip', label: 'Cremallera' },
      { id: 'snaps', label: 'Automáticos' },
      { id: 'open', label: 'Abierta' },
    ],
  },
  // Calzado
  {
    key: 'profile', label: 'Perfil', categories: ['footwear'],
    values: [
      { id: 'sleek', label: 'Estilizado' },
      { id: 'standard', label: 'Estándar' },
      { id: 'chunky', label: 'Robusto' },
    ],
  },
  {
    key: 'shaft', label: 'Caña', categories: ['footwear'], only: ['sneakers', 'sport-shoes', 'boots'],
    values: [
      { id: 'low', label: 'Baja' },
      { id: 'mid', label: 'Media' },
      { id: 'high', label: 'Alta' },
    ],
  },
];

/** Atributos de corte aplicables a un tipo de prenda. Sin subcategoría: los de toda la categoría. */
export function cutAttrsFor(categoryId: CategoryId, subcategoryId?: string): CutAttrDef[] {
  return CUT_ATTRS.filter((a) => {
    if (!a.categories.includes(categoryId)) return false;
    if (!subcategoryId) return !a.only;
    if (a.only && !(a.only as readonly string[]).includes(subcategoryId)) return false;
    if (a.except && (a.except as readonly string[]).includes(subcategoryId)) return false;
    return true;
  });
}

/** Definición de un atributo para un tipo concreto (la misma clave puede tener valores distintos según la categoría, p. ej. `length`). */
export function getCutAttr(key: string, categoryId: CategoryId, subcategoryId?: string): CutAttrDef | undefined {
  return cutAttrsFor(categoryId, subcategoryId).find((a) => a.key === key);
}

export function cutValueLabel(key: string, value: string, categoryId: CategoryId, subcategoryId?: string): string {
  return getCutAttr(key, categoryId, subcategoryId)?.values.find((v) => v.id === value)?.label ?? value;
}
