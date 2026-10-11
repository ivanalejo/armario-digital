import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmarioDB } from './db';
import { ValidationError, deleteItem, findImageBySourceHash, getBlob, patchItem, saveItem, type ItemInput } from './items';
import type { ProcessedImage } from '../images/types';

let db: ArmarioDB;
let dbName: string;
let seq = 0;

beforeEach(async () => {
  dbName = `test-${++seq}`;
  db = new ArmarioDB(dbName);
  await db.open();
});
afterEach(async () => {
  db.close();
  await new ArmarioDB(dbName).delete();
});

function fakeImage(tag: string): ProcessedImage {
  const display = new Blob([`display-${tag}`], { type: 'image/webp' });
  return {
    display,
    thumb: new Blob([`thumb-${tag}`], { type: 'image/webp' }),
    mime: 'image/webp',
    width: 1200,
    height: 1600,
    bytes: display.size,
    sha256: tag.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, 'a'),
    source: { name: `IMG_${tag}.jpg`, bytes: 1234, sha256: tag.padEnd(64, 'f').slice(0, 64).replace(/[^0-9a-f]/g, 'b') },
  };
}

const input: ItemInput = {
  name: 'Camisa Oxford',
  categoryId: 'top',
  subcategoryId: 'shirt',
  status: 'available',
  isDraft: false,
  favorite: false,
  colors: { primary: 'light-blue', secondary: [] },
  cut: { fit: 'slim', sleeve: 'long' },
  brand: null,
  material: undefined,
};

const newSlot = (tag: string) => ({ kind: 'new' as const, key: tag, image: fakeImage(tag) });

describe('saveItem', () => {
  it('crea la prenda con sus fotos en orden y guarda display + thumb', async () => {
    const item = await saveItem(input, [newSlot('a1'), newSlot('b2')], db);
    expect(item.id).toMatch(/^itm_[0-9a-z]{26}$/);
    expect(item.imageIds).toHaveLength(2);
    expect(await db.images.count()).toBe(2);
    expect(await db.blobs.count()).toBe(4);
    const thumb = await getBlob(item.imageIds[0]!, 'thumb', db);
    expect(await thumb?.text()).toBe('thumb-a1');
  });

  it('respeta «ausente = desconocido» y «null = inexistente» al guardar', async () => {
    const item = await saveItem(input, [], db);
    const stored = (await db.items.get(item.id))!;
    expect(stored.brand).toBeNull();
    expect('material' in stored).toBe(false);
    expect(stored.colors?.secondary).toEqual([]);
  });

  it('los datos persisten al cerrar y reabrir la base de datos', async () => {
    const item = await saveItem(input, [newSlot('p1')], db);
    db.close();
    const reopened = new ArmarioDB(dbName);
    await reopened.open();
    expect((await reopened.items.get(item.id))?.name).toBe('Camisa Oxford');
    expect(await (await getBlob(item.imageIds[0]!, 'display', reopened))?.text()).toBe('display-p1');
    reopened.close();
    db = new ArmarioDB(dbName);
    await db.open();
  });

  it('edita: reordena, sustituye y elimina fotos en una sola operación', async () => {
    const item = await saveItem(input, [newSlot('a1'), newSlot('b2'), newSlot('c3')], db);
    const [a, b, c] = item.imageIds as [string, string, string];
    // Nuevo orden: c, (sustituta de a), sin b
    const updated = await saveItem(
      { ...input, id: item.id, name: 'Camisa Oxford azul' },
      [{ kind: 'existing', imageId: c }, newSlot('a1-nueva')],
      db,
    );
    expect(updated.imageIds[0]).toBe(c);
    expect(updated.imageIds).not.toContain(a);
    expect(updated.imageIds).not.toContain(b);
    expect(updated.createdAt).toBe(item.createdAt);
    expect(await db.images.count()).toBe(2);
    expect(await db.blobs.count()).toBe(4);
    expect(await db.blobs.where('imageId').anyOf([a, b]).count()).toBe(0);
  });

  it('valida antes de escribir y no deja nada a medias', async () => {
    await expect(saveItem({ ...input, subcategoryId: 'jeans' }, [newSlot('x')], db)).rejects.toBeInstanceOf(ValidationError);
    expect(await db.items.count()).toBe(0);
    expect(await db.images.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('si falla una escritura dentro de la transacción, se deshace todo', async () => {
    const item = await saveItem(input, [newSlot('ok')], db);
    const before = { items: await db.items.count(), images: await db.images.count(), blobs: await db.blobs.count() };
    // Una imagen nueva con un ID ya existente fuerza un error de clave a mitad de la transacción.
    const original = db.images.bulkAdd.bind(db.images);
    db.images.bulkAdd = (() => Promise.reject(new Error('fallo simulado'))) as unknown as typeof db.images.bulkAdd;
    await expect(saveItem({ ...input, id: item.id, name: 'Cambiado' }, [newSlot('falla')], db)).rejects.toThrow('fallo simulado');
    db.images.bulkAdd = original;
    expect((await db.items.get(item.id))?.name).toBe('Camisa Oxford');
    expect({ items: await db.items.count(), images: await db.images.count(), blobs: await db.blobs.count() }).toEqual(before);
  });

  it('no permite asociar una foto de otra prenda', async () => {
    const a = await saveItem(input, [newSlot('a')], db);
    const b = await saveItem(input, [], db);
    await expect(saveItem({ ...input, id: b.id }, [{ kind: 'existing', imageId: a.imageIds[0]! }], db)).rejects.toThrow(/no pertenece/);
  });

  it('guarda borradores incompletos', async () => {
    const draft = await saveItem({ ...input, isDraft: true, subcategoryId: undefined, colors: undefined }, [newSlot('d')], db);
    expect(draft.isDraft).toBe(true);
    expect('colors' in draft).toBe(false);
  });
});

describe('patchItem y deleteItem', () => {
  it('cambia favorito y estado', async () => {
    const item = await saveItem(input, [], db);
    const p = await patchItem(item.id, { favorite: true, status: 'laundry' }, db);
    expect(p.favorite).toBe(true);
    expect((await db.items.get(item.id))?.status).toBe('laundry');
  });

  it('borra la prenda con sus imágenes y binarios, sin tocar otras prendas', async () => {
    const a = await saveItem(input, [newSlot('a1'), newSlot('a2')], db);
    const b = await saveItem(input, [newSlot('b1')], db);
    await deleteItem(a.id, db);
    expect(await db.items.get(a.id)).toBeUndefined();
    expect(await db.images.count()).toBe(1);
    expect(await db.blobs.count()).toBe(2);
    expect((await db.items.get(b.id))?.imageIds).toHaveLength(1);
  });

  it('reconoce una foto original ya importada por su huella', async () => {
    const a = await saveItem(input, [newSlot('rep')], db);
    const meta = (await db.images.get(a.imageIds[0]!))!;
    const found = await findImageBySourceHash(meta.source!.sha256!, db);
    expect(found?.itemId).toBe(a.id);
  });
});
