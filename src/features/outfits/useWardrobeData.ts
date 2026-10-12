import { useMemo } from 'react';
import { loadItems } from '../../db/health';
import { loadOutfitData } from '../../db/outfits';
import { useDbQuery } from '../../db/useDbQuery';
import { recommend, type RecommendResult } from '../../engine';
import type { OutfitContextState } from './context';

/** Prendas + conjuntos + historial + señales, en una sola consulta reactiva. */
export function useWardrobeData(context: string) {
  return useDbQuery(async () => ({ ...(await loadItems()), ...(await loadOutfitData()) }), [], context);
}

export type WardrobeData = NonNullable<ReturnType<typeof useWardrobeData>['data']>;

/** El mismo motor y las mismas reglas para Inicio y Outfits. */
export function useRecommendations(data: WardrobeData | undefined, ctx: OutfitContextState, mustInclude?: string[]): RecommendResult | undefined {
  const must = mustInclude?.join(',');
  return useMemo(() => {
    if (!data) return undefined;
    return recommend(
      data.items,
      { occasionId: ctx.occasionId, weather: ctx.weather, mustInclude: must ? must.split(',') : undefined, limit: 30 },
      { wearLog: data.wearLog, feedback: data.feedback, savedOutfits: data.outfits },
    );
  }, [data, ctx.occasionId, ctx.weather, must]);
}
