import { useSyncExternalStore } from 'react';
import type { CatalogFilter } from '../../domain/catalog';

// Filtros del armario en memoria: se conservan al entrar en una ficha y volver.
let state: CatalogFilter = {};
const listeners = new Set<() => void>();

export function setCatalogFilter(next: CatalogFilter | ((cur: CatalogFilter) => CatalogFilter)): void {
  state = typeof next === 'function' ? next(state) : next;
  listeners.forEach((l) => l());
}

export function useCatalogFilter(): CatalogFilter {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Número de filtros activos (sin contar texto ni categoría, que se ven siempre). */
export function activeFilterCount(f: CatalogFilter): number {
  return (
    (f.colorIds?.length ? 1 : 0) +
    (f.styleIds?.length ? 1 : 0) +
    (f.seasonIds?.length ? 1 : 0) +
    (f.statuses ? 1 : 0) +
    (f.formality !== undefined ? 1 : 0) +
    (f.drafts && f.drafts !== 'include' ? 1 : 0) +
    (f.pendingReview ? 1 : 0) +
    (f.favorites ? 1 : 0)
  );
}
