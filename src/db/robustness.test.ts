import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from '../platform/timeouts';
import { ArmarioDB } from './db';
import { checkConsistency, loadItems } from './health';
import { DbError, getBlob, saveItem, type ItemInput } from './items';
import type { ProcessedImage } from '../images/types';

let db: ArmarioDB;
let name: string;
let seq = 0;
const g = globalThis as { __ARMARIO_TIMEOUTS__?: unknown };

beforeEach(async () => {
  name = `robust-${++seq}`;
  db = new ArmarioDB(name);
  await db.open();
});
afterEach(async () => {
  delete g.__ARMARIO_TIMEOUTS__;
  db.close();
  await new ArmarioDB(name).delete();
});

const input: ItemInput = {
  name: 'Camiseta', categoryId: 'top', subcategoryId: 'tshirt', status: 'available',
  isDraft: false, favorite: false, colors: { primary: 'white' },
};
function img(tag: string): ProcessedImage {
  const display = new Blob([`display-${tag}`], { type: 'image/webp' });
  return { display, thumb: new Blob([`thumb-${tag}`], { type: 'image/webp' }), mime: 'image/webp', width: 10, height: 10, bytes: display.size, sha256: 'c'.repeat(64) };
}

/** Mantiene una transacción de escritura abierta desde otra conexión (como una ventana colgada). */
function holdLock(store: string): { release: () => void; ready: Promise<void> } {
  let stop = false;
  const ready = new Promise<void>((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const conn = req.result;
      const tx = conn.transaction([store], 'readwrite');
      const os = tx.objectStore(store);
      const spin = () => {
        if (!stop) os.count().onsuccess = spin;
      };
      spin();
      tx.oncomplete = () => conn.close();
      resolve();
    };
  });
  return { release: () => { stop = true; }, ready };
}

describe('tiempos límite', () => {
  it('withTimeout rechaza con TimeoutError y no afecta a promesas rápidas', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'lento')).rejects.toBeInstanceOf(TimeoutError);
    await expect(withTimeout(Promise.resolve(1), 1000, 'x')).resolves.toBe(1);
  });

  it('si la base de datos no responde, el guardado se aborta, informa y libera el bloqueo', async () => {
    g.__ARMARIO_TIMEOUTS__ = { db: 300 };
    const lock = holdLock('blobs');
    await lock.ready;
    const err = await saveItem(input, [{ kind: 'new', key: 'k', image: img('a') }], db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).kind).toBe('timeout');
    expect((err as Error).message).toMatch(/No se ha guardado nada/);
    lock.release();
    // Tras liberar: nada a medias y la base de datos vuelve a aceptar escrituras.
    expect(await db.items.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
    const ok = await saveItem(input, [{ kind: 'new', key: 'k', image: img('b') }], db);
    expect(await db.items.get(ok.id)).toBeDefined();
  });
});

describe('formato de binarios', () => {
  it('guarda ArrayBuffer + tipo y lo devuelve como Blob', async () => {
    const it = await saveItem(input, [{ kind: 'new', key: 'k', image: img('x') }], db);
    const rec = await db.blobs.get([it.imageIds[0]!, 'display']);
    expect(rec?.data).toBeInstanceOf(ArrayBuffer);
    expect(rec?.type).toBe('image/webp');
    const blob = await getBlob(it.imageIds[0]!, 'display', db);
    expect(await blob?.text()).toBe('display-x');
  });

  it('sigue leyendo los registros de v0.1.0 (Blob) sin migración', async () => {
    await db.blobs.put({ imageId: 'img_legacy000001', variant: 'thumb', blob: new Blob(['antiguo'], { type: 'image/webp' }) });
    expect(await (await getBlob('img_legacy000001', 'thumb', db))?.text()).toBe('antiguo');
  });
});

describe('carga tolerante e incoherencias', () => {
  it('una ficha inválida no impide cargar las válidas y no se borra', async () => {
    const ok = await saveItem(input, [], db);
    await db.items.put({ id: 'itm_roto000001', name: '' } as never);
    const { items, invalid } = await loadItems(db);
    expect(items.map((i) => i.id)).toEqual([ok.id]);
    expect(invalid[0]?.id).toBe('itm_roto000001');
    expect(await db.items.count()).toBe(2);
  });

  it('detecta referencias rotas y huérfanos sin modificar nada', async () => {
    const it = await saveItem(input, [{ kind: 'new', key: 'k', image: img('a') }], db);
    const imgId = it.imageIds[0]!;
    expect((await checkConsistency(db)).issues).toEqual([]);
    await db.blobs.delete([imgId, 'thumb']);
    await db.blobs.put({ imageId: 'img_huerfana0001', variant: 'display', data: new ArrayBuffer(1), type: 'image/webp' });
    await db.items.put({ ...it, imageIds: [imgId, 'img_noexiste0001'] });
    const report = await checkConsistency(db);
    expect(report.issues.join('\n')).toMatch(/img_noexiste0001.*no existe/);
    expect(report.issues.join('\n')).toMatch(/falta la miniatura/);
    expect(report.issues.join('\n')).toMatch(/img_huerfana0001.*huérfano/);
    expect(await db.blobs.count()).toBe(2); // solo informa
  });
});
