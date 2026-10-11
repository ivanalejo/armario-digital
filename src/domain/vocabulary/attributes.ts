// Estilos, formalidad, temporadas, patrones, abrigo y estado (DATA_MODEL.md §3.1, §4.3–4.7).

const ids = <T extends readonly { id: string }[]>(list: T) =>
  list.map((x) => x.id) as [T[number]['id'], ...T[number]['id'][]];

export const STYLES = [
  { id: 'classic', label: 'Clásico' },
  { id: 'minimal', label: 'Minimalista' },
  { id: 'casual', label: 'Casual' },
  { id: 'streetwear', label: 'Urbano' },
  { id: 'sporty', label: 'Deportivo' },
  { id: 'preppy', label: 'Preppy' },
  { id: 'workwear', label: 'Utilitario' },
  { id: 'outdoor', label: 'Outdoor' },
] as const;
export type StyleId = (typeof STYLES)[number]['id'];
export const STYLE_IDS = ids(STYLES);

export const FORMALITY = [
  { level: 1, label: 'Deporte / casa' },
  { level: 2, label: 'Casual' },
  { level: 3, label: 'Smart casual' },
  { level: 4, label: 'Business' },
  { level: 5, label: 'Formal' },
] as const;

export const SEASONS = [
  { id: 'spring', label: 'Primavera' },
  { id: 'summer', label: 'Verano' },
  { id: 'autumn', label: 'Otoño' },
  { id: 'winter', label: 'Invierno' },
] as const;
export type SeasonId = (typeof SEASONS)[number]['id'];
export const SEASON_IDS = ids(SEASONS);

export const PATTERNS = [
  { id: 'solid', label: 'Liso', intensity: 0 },
  { id: 'texture', label: 'Textura sutil', intensity: 1 },
  { id: 'stripes', label: 'Rayas', intensity: 2 },
  { id: 'checks', label: 'Cuadros', intensity: 2 },
  { id: 'dots', label: 'Topos / micro', intensity: 2 },
  { id: 'graphic', label: 'Gráfico / logo', intensity: 3 },
  { id: 'floral', label: 'Floral', intensity: 3 },
  { id: 'camo', label: 'Camuflaje', intensity: 3 },
  { id: 'other', label: 'Otro', intensity: 2 },
] as const;
export type PatternId = (typeof PATTERNS)[number]['id'];
export const PATTERN_IDS = ids(PATTERNS);

export const WARMTH = [
  { level: 1, label: 'Muy ligero' },
  { level: 2, label: 'Ligero' },
  { level: 3, label: 'Medio' },
  { level: 4, label: 'Abrigado' },
  { level: 5, label: 'Muy abrigado' },
] as const;

export const STATUSES = [
  { id: 'available', label: 'Disponible', recommendable: true },
  { id: 'laundry', label: 'Para lavar', recommendable: false },
  { id: 'stored', label: 'Guardada', recommendable: false },
  { id: 'repair', label: 'En arreglo', recommendable: false },
  { id: 'lent', label: 'Prestada', recommendable: false },
  { id: 'retired', label: 'Dada de baja', recommendable: false },
] as const;
export type StatusId = (typeof STATUSES)[number]['id'];
export const STATUS_IDS = ids(STATUSES);

export const ISSUE_TYPES = ['multiple-items', 'unusable-photo', 'possible-duplicate', 'other'] as const;

export const labelOf = (list: readonly { id: string; label: string }[], id: string): string =>
  list.find((x) => x.id === id)?.label ?? id;
