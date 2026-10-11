// Lógica pura del catálogo: búsqueda, filtros y utilidades de ficha.
import type { Item } from './schema';
import { normalizeText } from './text';
import {
  type CategoryId,
  type ColorId,
  type SeasonId,
  type StatusId,
  type StyleId,
  categoryLabel,
  colorsMatching,
  getColor,
  subcategoryLabel,
} from './vocabulary';

export interface CatalogFilter {
  text?: string;
  categoryId?: CategoryId;
  colorIds?: ColorId[];
  styleIds?: StyleId[];
  seasonIds?: SeasonId[];
  /** Por defecto: todos menos `retired`. */
  statuses?: StatusId[];
  /** Nivel 1–5: la prenda debe cubrirlo en su rango. */
  formality?: number;
  drafts?: 'include' | 'exclude' | 'only';
  pendingReview?: boolean;
  favorites?: boolean;
}

export const DEFAULT_STATUSES: StatusId[] = ['available', 'laundry', 'stored', 'repair', 'lent'];

function haystack(item: Item): string {
  const parts = [
    item.name,
    item.description,
    item.brand,
    item.material,
    item.notes,
    ...(item.tags ?? []),
    categoryLabel(item.categoryId),
    item.subcategoryId ? subcategoryLabel(item.subcategoryId) : '',
  ];
  return normalizeText(parts.filter(Boolean).join(' '));
}

function itemColors(item: Item): string[] {
  return [item.colors?.primary, ...(item.colors?.secondary ?? [])].filter((c): c is ColorId => !!c);
}

export function matchesText(item: Item, text: string): boolean {
  const tokens = normalizeText(text).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const hay = haystack(item);
  const colors = itemColors(item);
  // Cada palabra debe aparecer en el texto de la ficha o corresponder a uno de sus colores (con alias).
  return tokens.every((t) => hay.includes(t) || colorsMatching(t).some((c) => colors.includes(c)));
}

export function filterItems(items: readonly Item[], f: CatalogFilter = {}): Item[] {
  const statuses = f.statuses ?? DEFAULT_STATUSES;
  const drafts = f.drafts ?? 'include';
  return items
    .filter((it) => {
      if (!statuses.includes(it.status)) return false;
      if (drafts === 'exclude' && it.isDraft) return false;
      if (drafts === 'only' && !it.isDraft) return false;
      if (f.categoryId && it.categoryId !== f.categoryId) return false;
      if (f.favorites && !it.favorite) return false;
      if (f.pendingReview && !(it.estimated?.length || it.issues?.length)) return false;
      if (f.colorIds?.length && !itemColors(it).some((c) => f.colorIds!.includes(c as ColorId))) return false;
      if (f.styleIds?.length && !(it.styles ?? []).some((s) => f.styleIds!.includes(s))) return false;
      if (f.seasonIds?.length && !(it.seasons ?? []).some((s) => f.seasonIds!.includes(s))) return false;
      if (f.formality !== undefined) {
        if (!it.formality || f.formality < it.formality.min || f.formality > it.formality.max) return false;
      }
      return f.text ? matchesText(it, f.text) : true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** Una prenda deja de ser borrador cuando tiene subcategoría y color principal. */
export const isComplete = (it: Pick<Item, 'subcategoryId' | 'colors'>): boolean =>
  !!it.subcategoryId && !!it.colors?.primary;

export const isEstimated = (it: Pick<Item, 'estimated'>, path: string): boolean =>
  !!it.estimated?.includes(path);

/** Al editar un campo, pasa a confirmado. */
export function confirmPath(estimated: string[] | undefined, path: string): string[] | undefined {
  if (!estimated) return undefined;
  const next = estimated.filter((p) => p !== path && !p.startsWith(path + '.'));
  return next.length ? next : undefined;
}

export function suggestName(subcategoryId?: string, colorId?: string): string {
  const sub = subcategoryId ? subcategoryLabel(subcategoryId) : 'Prenda';
  const color = colorId ? getColor(colorId)?.label.toLowerCase() : undefined;
  return color ? `${sub} ${color}` : sub;
}

export interface CatalogStats {
  total: number;
  available: number;
  drafts: number;
  pendingReview: number;
  favorites: number;
}

export function catalogStats(items: readonly Item[]): CatalogStats {
  const active = items.filter((i) => i.status !== 'retired');
  return {
    total: active.length,
    available: active.filter((i) => i.status === 'available' && !i.isDraft).length,
    drafts: active.filter((i) => i.isDraft).length,
    pendingReview: active.filter((i) => i.estimated?.length || i.issues?.length).length,
    favorites: active.filter((i) => i.favorite).length,
  };
}
