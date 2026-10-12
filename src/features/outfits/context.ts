// Ocasión y clima elegidos: compartidos por Inicio y Outfits, recordados en
// este dispositivo (localStorage, con tolerancia a fallos). El clima vuelve al
// valor por defecto del mes cada día nuevo.
import { useSyncExternalStore } from 'react';
import { defaultWeather, type Weather } from '../../engine';
import { localDate } from '../../db/outfits';

export interface OutfitContextState {
  occasionId: string;
  weather: Weather;
}

const KEY = 'armario-digital:outfit-context';
let state: OutfitContextState = load();
const listeners = new Set<() => void>();

function load(): OutfitContextState {
  const fallback = { occasionId: 'casual', weather: defaultWeather(new Date()) };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (OutfitContextState & { date?: string }) | null;
    if (!raw?.occasionId) return fallback;
    return { occasionId: raw.occasionId, weather: raw.date === localDate() && raw.weather ? raw.weather : fallback.weather };
  } catch {
    return fallback;
  }
}

export function setOutfitContext(patch: Partial<OutfitContextState>): void {
  state = { ...state, ...patch, weather: { ...state.weather, ...patch.weather } };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, date: localDate() }));
  } catch {
    /* sin almacenamiento local: se mantiene en memoria */
  }
  listeners.forEach((l) => l());
}

export function useOutfitContext(): OutfitContextState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// --- Propuesta del día: qué conjunto se está mostrando en Inicio hoy ---
const DAILY = 'armario-digital:daily';
export function readDailyKey(ctxKey: string): string | undefined {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY) ?? 'null') as { date: string; ctx: string; key: string } | null;
    return d && d.date === localDate() && d.ctx === ctxKey ? d.key : undefined;
  } catch {
    return undefined;
  }
}
export function writeDailyKey(ctxKey: string, key: string): void {
  try {
    localStorage.setItem(DAILY, JSON.stringify({ date: localDate(), ctx: ctxKey, key }));
  } catch {
    /* ignorado */
  }
}
