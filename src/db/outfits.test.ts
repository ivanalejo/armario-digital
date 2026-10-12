import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recommend } from '../engine';
import { sampleWardrobe } from '../test/engineFixtures';
import { ArmarioDB } from './db';
import { checkConsistency, loadItems } from './health';
import { getBlob } from './items';
import { deleteOutfit, dismissOutfit, loadOutfitData, logWear, rateOutfit, saveOutfit } from './outfits';

let db: ArmarioDB;
let name: string;
let n = 0;
beforeEach(async () => {
  name = `outfits-${++n}`;
  db = new ArmarioDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new ArmarioDB(name).delete();
});

const ctx = { occasionId: 'casual', weather: { temp: 'mild' as const, rain: false } };
const NOW = new Date('2026-10-12T09:00:00');

describe('conjuntos guardados', () => {
  it('guardar no duplica el mismo conjunto y registra la señal', async () => {
    const rec = recommend(sampleWardrobe(), { occasionId: 'casual', weather: ctx.weather }, { now: NOW }).outfits[0]!;
    const a = await saveOutfit(rec, ctx, db);
    const b = await saveOutfit({ ...rec, slots: { ...rec.slots, accessories: [] } }, ctx, db);
    expect(b.id).toBe(a.id);
    const data = await loadOutfitData(db);
    expect(data.outfits).toHaveLength(1);
    expect(data.outfits[0]).toMatchObject({ key: rec.key, favorite: true, occasionId: 'casual', origin: 'generated' });
    expect(data.feedback.filter((f) => f.kind === 'favorite')).toHaveLength(1);
  });

  it('valorar guarda la nota y el evento; valores fuera de 1–5 se rechazan sin escribir', async () => {
    const rec = recommend(sampleWardrobe(), { occasionId: 'casual', weather: ctx.weather }, { now: NOW }).outfits[0]!;
    const o = await saveOutfit(rec, ctx, db);
    await rateOutfit(o.id, 4, db);
    await expect(rateOutfit(o.id, 9, db)).rejects.toThrow();
    expect((await db.outfits.get(o.id))?.rating).toBe(4);
    expect((await db.feedback.toArray()).filter((f) => f.kind === 'rating')).toHaveLength(1);
  });

  it('descartar, registrar uso y borrar', async () => {
    const recs = recommend(sampleWardrobe(), { occasionId: 'casual', weather: ctx.weather }, { now: NOW }).outfits;
    await dismissOutfit(recs[0]!.slots, ctx, 'not-today', db);
    await dismissOutfit(recs[1]!.slots, ctx, undefined, db);
    const o = await saveOutfit(recs[2]!, ctx, db);
    const w = await logWear(recs[2]!.slots, { ...ctx, outfitId: o.id, date: '2026-10-12' }, db);
    await deleteOutfit(o.id, db);
    const data = await loadOutfitData(db);
    expect(data.outfits).toHaveLength(0);
    expect(data.wearLog.map((x) => x.id)).toEqual([w.id]); // el historial se conserva
    expect(data.feedback.map((f) => f.kind).sort()).toEqual(['dismiss', 'dismiss', 'favorite', 'worn']);
    // Y el motor los tiene en cuenta
    const again = recommend(sampleWardrobe(), { occasionId: 'casual', weather: ctx.weather }, { now: NOW, feedback: data.feedback, wearLog: data.wearLog });
    const keys = again.outfits.map((r) => r.key);
    expect(keys).not.toContain(recs[0]!.key);
    expect(keys).not.toContain(recs[1]!.key);
  });
});

describe('compatibilidad con datos de v0.1.x', () => {
  it('una base de datos con prendas y fotos de v0.1.0/v0.1.1 se lee y sirve para recomendar sin migrar nada', async () => {
    const items = sampleWardrobe().map((i, k) => ({ ...i, imageIds: [`img_legacy${String(k).padStart(4, '0')}`] }));
    await db.items.bulkPut(items);
    await db.images.bulkPut(items.map((i) => ({ id: i.imageIds[0]!, itemId: i.id, mime: 'image/webp' as const, width: 10, height: 10, bytes: 1, sha256: 'a'.repeat(64), createdAt: i.createdAt })));
    await db.blobs.bulkPut(items.flatMap((i, k) => [
      // la mitad en formato v0.1.0 (Blob) y la otra mitad en formato v0.1.1 (ArrayBuffer)
      k % 2 ? { imageId: i.imageIds[0]!, variant: 'thumb' as const, blob: new Blob(['x'], { type: 'image/webp' }) } : { imageId: i.imageIds[0]!, variant: 'thumb' as const, data: new ArrayBuffer(1), type: 'image/webp' },
      { imageId: i.imageIds[0]!, variant: 'display' as const, data: new ArrayBuffer(1), type: 'image/webp' },
    ]));
    const { items: loaded, invalid } = await loadItems(db);
    expect(invalid).toEqual([]);
    expect(loaded).toHaveLength(items.length);
    const res = recommend(loaded, { occasionId: 'casual', weather: ctx.weather }, { now: NOW, ...(await loadOutfitData(db)) });
    expect(res.status).toBe('ok');
    expect(await getBlob(items[1]!.imageIds[0]!, 'thumb', db)).toBeInstanceOf(Blob);
    const o = await saveOutfit(res.outfits[0]!, ctx, db);
    expect((await checkConsistency(db)).issues).toEqual([]);
    expect(await db.items.count()).toBe(items.length); // nada se ha tocado
    expect(o.key).toBe(res.outfits[0]!.key);
  });

  it('un conjunto guardado sin los campos nuevos (formato anterior) sigue siendo válido', async () => {
    await db.outfits.put({ id: 'out_antiguo00001', slots: { base: 'itm_a00001', bottom: 'itm_b00001', footwear: 'itm_c00001' }, origin: 'manual', favorite: false, createdAt: '2026-10-01T10:00:00Z' });
    const data = await loadOutfitData(db);
    expect(data.outfits).toHaveLength(1);
  });
});
