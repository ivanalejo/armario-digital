// Conjuntos guardados, valoraciones, descartes e historial de uso.
// Mismas garantías que las prendas: validación antes de escribir y una sola
// transacción con tiempo límite por operación.
import type { z } from 'zod';
import { newId } from '../domain/ids';
import { FeedbackEventSchema, type FeedbackEvent, formatIssues, OutfitSchema, type Outfit, WearEntrySchema, type WearEntry } from '../domain/schema';
import { outfitKey, type OutfitSlots, type Recommendation, type Weather } from '../engine';
import { type ArmarioDB, db as defaultDb } from './db';
import { compact, ValidationError, writeTx } from './items';

export interface OutfitContext {
  occasionId: string;
  weather: Weather;
}

export const localDate = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const itemIdsOf = (slots: OutfitSlots): string[] =>
  [slots.outer, slots.mid, slots.base, slots.bottom, slots.footwear, ...(slots.accessories ?? [])].filter((x): x is string => !!x);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(formatIssues(r.error));
  return r.data;
}

function feedback(e: Omit<FeedbackEvent, 'id' | 'at'>): FeedbackEvent {
  return parse(FeedbackEventSchema, compact({ id: newId('fb'), at: new Date().toISOString(), ...e }));
}

/** Guarda un conjunto. Si ya estaba guardado (mismas piezas principales), no lo duplica. */
export async function saveOutfit(rec: Pick<Recommendation, 'slots' | 'score' | 'breakdown'>, ctx: OutfitContext, database: ArmarioDB = defaultDb): Promise<Outfit> {
  const key = outfitKey(rec.slots);
  return writeTx(database, [database.outfits, database.feedback], 'guardar el conjunto', async () => {
    const existing = (await database.outfits.toArray()).find((o) => (o.key ?? outfitKey(o.slots)) === key);
    if (existing) {
      if (!existing.favorite) await database.outfits.put({ ...existing, favorite: true });
      return { ...existing, favorite: true };
    }
    const outfit = parse(OutfitSchema, compact({
      id: newId('out'),
      slots: rec.slots,
      key,
      occasionId: ctx.occasionId,
      weather: ctx.weather,
      origin: 'generated',
      favorite: true,
      createdAt: new Date().toISOString(),
      scoreSnapshot: { total: rec.score, breakdown: rec.breakdown, weightsVersion: 1 },
    }));
    await database.outfits.add(outfit);
    await database.feedback.add(feedback({ target: 'outfit', kind: 'favorite', itemIds: itemIdsOf(rec.slots), outfit: { slots: rec.slots, key }, context: { occasionId: ctx.occasionId, weather: ctx.weather.temp, rain: ctx.weather.rain }, source: 'recommender' }));
    return outfit;
  });
}

export async function rateOutfit(id: string, rating: number, database: ArmarioDB = defaultDb): Promise<Outfit> {
  return writeTx(database, [database.outfits, database.feedback], 'valorar el conjunto', async () => {
    const o = await database.outfits.get(id);
    if (!o) throw new ValidationError([`El conjunto ${id} no existe`]);
    const next = parse(OutfitSchema, { ...o, rating });
    await database.outfits.put(next);
    await database.feedback.add(feedback({ target: 'outfit', kind: 'rating', value: rating, itemIds: itemIdsOf(o.slots), outfit: { slots: o.slots, key: o.key ?? outfitKey(o.slots) }, source: 'manual' }));
    return next;
  });
}

/** Borra un conjunto guardado. El historial de uso se conserva. */
export async function deleteOutfit(id: string, database: ArmarioDB = defaultDb): Promise<void> {
  await writeTx(database, [database.outfits], 'borrar el conjunto', async () => {
    await database.outfits.delete(id);
  });
}

/** Descarta una propuesta: «hoy no» (solo la oculta hoy) o «no me gusta» (cuenta como preferencia). */
export async function dismissOutfit(slots: OutfitSlots, ctx: OutfitContext, reason?: 'not-today', database: ArmarioDB = defaultDb): Promise<FeedbackEvent> {
  const ev = feedback({
    target: 'outfit',
    kind: 'dismiss',
    itemIds: itemIdsOf(slots),
    outfit: { slots, key: outfitKey(slots) },
    ...(reason ? { reason } : {}),
    context: { occasionId: ctx.occasionId, weather: ctx.weather.temp, rain: ctx.weather.rain },
    source: 'recommender',
  });
  await writeTx(database, [database.feedback], 'descartar la propuesta', async () => {
    await database.feedback.add(ev);
  });
  return ev;
}

/** Registra que hoy te pones este conjunto (alimenta la variedad y el historial). */
export async function logWear(slots: OutfitSlots, ctx: OutfitContext & { outfitId?: string; date?: string }, database: ArmarioDB = defaultDb): Promise<WearEntry> {
  const entry = parse(WearEntrySchema, compact({
    id: newId('wear'),
    date: ctx.date ?? localDate(),
    itemIds: itemIdsOf(slots),
    outfitId: ctx.outfitId,
    occasionId: ctx.occasionId,
  }));
  await writeTx(database, [database.wearLog, database.feedback], 'registrar el uso', async () => {
    await database.wearLog.add(entry);
    await database.feedback.add(feedback({ target: 'outfit', kind: 'worn', itemIds: entry.itemIds, outfit: { slots, key: outfitKey(slots) }, context: { occasionId: ctx.occasionId, weather: ctx.weather.temp, rain: ctx.weather.rain }, source: 'recommender' }));
  });
  return entry;
}

export async function deleteWear(id: string, database: ArmarioDB = defaultDb): Promise<void> {
  await writeTx(database, [database.wearLog], 'borrar el registro', async () => {
    await database.wearLog.delete(id);
  });
}

/** Todo lo que necesita el recomendador, leído de una vez. */
export async function loadOutfitData(database: ArmarioDB = defaultDb) {
  const [outfits, wearLog, feedbackEvents] = await Promise.all([
    database.outfits.toArray(),
    database.wearLog.toArray(),
    database.feedback.toArray(),
  ]);
  return {
    outfits: outfits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    wearLog: wearLog.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    feedback: feedbackEvents,
  };
}
