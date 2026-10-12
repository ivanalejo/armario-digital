// Señales de preferencia (versión sencilla, Fase 3). El modelo completo de
// aprendizaje — doble semivida, contexto por ocasión, exploración — es la
// Fase 5 (ARCHITECTURE.md §8.2). Esta interfaz es la que usará esa versión:
// cambiar la implementación no obliga a tocar la puntuación.
import type { FeedbackEvent, Outfit, WearEntry } from '../domain/schema';
import { CORE_SLOTS, type OutfitSlots } from './types';

export interface PreferenceModel {
  /** −1…1: gusto por una prenda en sí. */
  itemAffinity(itemId: string): number;
  /** −1…1: gusto por una pareja de prendas juntas. */
  pairAffinity(a: string, b: string): number;
  /** −1…1: gusto por un conjunto concreto. */
  outfitAffinity(key: string): number;
  /** Conjunto descartado: «hoy no» (solo hoy) o «no me gusta» (30 días). */
  isBlocked(key: string): boolean;
  /** Días desde el último uso registrado; undefined si nunca. */
  daysSinceWorn(itemId: string): number | undefined;
}

/** Prior de contracción: con pocas señales la afinidad apenas se mueve. */
const K = 3;
const DISMISS_DAYS = 30;
const DAY = 86_400_000;

export function outfitKey(slots: OutfitSlots): string {
  return (['outer', 'mid', 'base', 'bottom', 'footwear'] as const).map((s) => `${s}:${slots[s] ?? '-'}`).join('|');
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`);

function corePairs(slots: OutfitSlots): [string, string][] {
  const ids = CORE_SLOTS.map((s) => slots[s]).filter((x): x is string => !!x);
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i]!, ids[j]!]);
  return out;
}

class Acc {
  private m = new Map<string, { sum: number; n: number }>();
  add(k: string, v: number) {
    const cur = this.m.get(k) ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    this.m.set(k, cur);
  }
  get(k: string, prior = K): number {
    const c = this.m.get(k);
    return c ? Math.max(-1, Math.min(1, c.sum / (c.n + prior))) : 0;
  }
}

export function buildPreferences(
  input: { feedback?: readonly FeedbackEvent[]; savedOutfits?: readonly Outfit[]; wearLog?: readonly WearEntry[] },
  now: Date,
): PreferenceModel {
  const items = new Acc();
  const pairs = new Acc();
  const outfits = new Acc();
  const blocked = new Set<string>();
  const today = localDate(now);

  for (const o of input.savedOutfits ?? []) {
    const key = outfitKey(o.slots);
    const v = o.rating !== undefined ? (o.rating - 3) / 2 : o.favorite ? 1 : 0.5;
    outfits.add(key, v);
    for (const [a, b] of corePairs(o.slots)) pairs.add(pairKey(a, b), v / 2);
  }
  for (const e of input.feedback ?? []) {
    if (e.target === 'item' && (e.kind === 'like' || e.kind === 'dislike')) {
      for (const id of e.itemIds) items.add(id, e.kind === 'like' ? 1 : -1);
    }
    if (e.target === 'outfit' && e.kind === 'dismiss' && e.outfit) {
      const at = new Date(e.at);
      if (e.reason === 'not-today') {
        if (localDate(at) === today) blocked.add(e.outfit.key);
        continue; // «hoy no» no expresa un gusto
      }
      if (now.getTime() - at.getTime() < DISMISS_DAYS * DAY) blocked.add(e.outfit.key);
      outfits.add(e.outfit.key, -1);
      for (const [a, b] of corePairs(e.outfit.slots)) pairs.add(pairKey(a, b), -0.5);
    }
  }

  const lastWorn = new Map<string, number>();
  for (const w of input.wearLog ?? []) {
    const t = new Date(`${w.date}T12:00:00`).getTime();
    for (const id of w.itemIds) lastWorn.set(id, Math.max(lastWorn.get(id) ?? 0, t));
  }

  return {
    itemAffinity: (id) => items.get(id),
    pairAffinity: (a, b) => pairs.get(pairKey(a, b)),
    outfitAffinity: (key) => outfits.get(key, 1),
    isBlocked: (key) => blocked.has(key),
    daysSinceWorn: (id) => {
      const t = lastWorn.get(id);
      return t === undefined ? undefined : Math.max(0, Math.floor((now.getTime() - t) / DAY));
    },
  };
}
