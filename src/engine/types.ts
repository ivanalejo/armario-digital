// Tipos del motor de recomendación (ARCHITECTURE.md §8). Sin React ni Dexie.
import type { FeedbackEvent, Item, Outfit, WearEntry } from '../domain/schema';

export type Temp = 'hot' | 'mild' | 'cold';
export interface Weather {
  temp: Temp;
  rain: boolean;
}

/** Posiciones principales de un conjunto. Los accesorios van aparte. */
export type MainSlot = 'base' | 'mid' | 'outer' | 'bottom' | 'footwear';
export const MAIN_SLOTS: readonly MainSlot[] = ['base', 'mid', 'outer', 'bottom', 'footwear'];
/** Piezas que definen si dos propuestas son «prácticamente la misma». */
export const CORE_SLOTS: readonly MainSlot[] = ['base', 'bottom', 'footwear'];

export interface OutfitSlots {
  base?: string;
  mid?: string;
  outer?: string;
  bottom?: string;
  footwear?: string;
  accessories?: string[];
}

export interface Weights {
  color: number;
  occasion: number;
  style: number;
  season: number;
  preference: number;
}
export const DEFAULT_WEIGHTS: Weights = { color: 30, occasion: 25, style: 20, season: 15, preference: 10 };
export type Criterion = keyof Weights;

export interface RecommendRequest {
  occasionId: string;
  weather: Weather;
  /** Prendas que deben aparecer sí o sí. */
  mustInclude?: string[];
  /** Prendas que no deben aparecer. */
  exclude?: string[];
  /** Máximo de propuestas devueltas (por defecto 20). */
  limit?: number;
}

export interface RecommendContext {
  now?: Date;
  wearLog?: readonly WearEntry[];
  feedback?: readonly FeedbackEvent[];
  savedOutfits?: readonly Outfit[];
  weights?: Weights;
}

export interface Recommendation {
  /** Huella canónica de las piezas principales (los accesorios no cuentan). */
  key: string;
  slots: OutfitSlots;
  /** Piezas en orden de presentación: exterior, intermedia, base, inferior, calzado, accesorios. */
  pieces: { slot: MainSlot | 'accessory'; item: Item }[];
  /** 0–100. */
  score: number;
  breakdown: Record<Criterion, number>;
  reasons: string[];
  warnings: string[];
  /** 0–1: proporción de atributos conocidos y confirmados. */
  confidence: number;
}

export interface MissingSlot {
  slot: 'base' | 'bottom' | 'footwear';
  label: string;
  /** Prendas de ese tipo que existen pero no se pueden usar (no disponibles, borradores…). */
  unusable: number;
}

export interface RecommendResult {
  status: 'ok' | 'insufficient' | 'none-viable';
  outfits: Recommendation[];
  missing: MissingSlot[];
  /** Avisos generales (p. ej. una prenda obligatoria que no encaja con la ocasión). */
  notices: string[];
}
