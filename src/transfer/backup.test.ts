import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmarioDB } from '../db/db';
import { getSetting } from '../db/settings';
import type { BlobRecord, Item } from '../domain/schema';
import { exportBackup, type LastExport } from './exportBackup';
import { canonical } from './format';
import { applyImport, ImportError, planImport, REPLACE_WORD } from './importBackup';
import { readBackup, type ReadResult } from './readBackup';

const dbs: ArmarioDB[] = [];
let seq = 0;
async function newDb() {
  const d = new ArmarioDB(`backup-${++seq}`);
  await d.open();
  dbs.push(d);
  return d;
}
beforeEach(() => {
  dbs.length = 0;
});
afterEach(async () => {
  for (const d of dbs) {
    d.close();
    await new ArmarioDB(d.name).delete();
  }
});

/** «Foto» WebP sintética: cabecera RIFF/WEBP real + contenido distinto por etiqueta. */
const webp = (tag: string) => new Uint8Array([...strToU8('RIFF'), 0, 0, 0, 0, ...strToU8('WEBP'), ...strToU8(tag)]);
const hash = (tag: string) => tag.split('').map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(64, '0').slice(0, 64);

function item(n: number, extra: Partial<Item> = {}): Item {
  return {
    id: `itm_test${String(n).padStart(5, '0')}`,
    name: `Prenda ${n}`,
    categoryId: 'top',
    subcategoryId: 'tshirt',
    status: 'available',
    isDraft: false,
    favorite: false,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    colors: { primary: 'white' },
    imageIds: [`img_test${String(n).padStart(5, '0')}`],
    ...extra,
  };
}

/** Siembra prendas con foto en el formato real de la app (ArrayBuffer + tipo) y una en formato v0.1.0 (Blob). */
async function seed(d: ArmarioDB, ns: number[], opts: { legacy?: number } = {}) {
  for (const n of ns) {
    const it = item(n);
    const imgId = it.imageIds[0]!;
    await d.items.put(it);
    await d.images.put({ id: imgId, itemId: it.id, mime: 'image/webp', width: 10, height: 10, bytes: 20, sha256: hash(`p${n}`), createdAt: it.createdAt });
    const display: BlobRecord =
      opts.legacy === n
        ? { imageId: imgId, variant: 'display', blob: new Blob([webp(`display-${n}`)], { type: 'image/webp' }) }
        : { imageId: imgId, variant: 'display', data: webp(`display-${n}`).slice().buffer as ArrayBuffer, type: 'image/webp' };
    await d.blobs.bulkPut([display, { imageId: imgId, variant: 'thumb', data: webp(`thumb-${n}`).slice().buffer as ArrayBuffer, type: 'image/webp' }]);
  }
}

async function dump(d: ArmarioDB) {
  const blobs = await d.blobs.toArray();
  const bytes = await Promise.all(
    blobs.map(async (b) => [`${b.imageId}/${b.variant}`, Array.from(b.data ? new Uint8Array(b.data) : new Uint8Array(await b.blob!.arrayBuffer())).join(',')] as const),
  );
  return {
    items: (await d.items.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    images: (await d.images.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    blobs: Object.fromEntries(bytes.sort()),
    outfits: await d.outfits.toArray(),
    wearLog: await d.wearLog.toArray(),
    feedback: await d.feedback.toArray(),
  };
}

const ok = (r: ReadResult) => {
  if (!r.ok) throw new Error(`Se esperaba una copia válida: ${r.fatal}`);
  return r;
};

/** Reescribe el ZIP de una copia aplicando cambios al manifiesto o a los archivos. */
async function tamper(blob: Blob, fn: (files: Record<string, Uint8Array>, manifest: Record<string, unknown>) => void): Promise<Blob> {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Record<string, unknown>;
  fn(files, manifest);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return new Blob([zipSync(files) as BlobPart]);
}

const outfit = { id: 'out_test000001', slots: { base: 'itm_test00001', bottom: 'itm_test00002', footwear: 'itm_test00003' }, origin: 'generated' as const, favorite: true, createdAt: '2026-10-02T10:00:00Z' };
const wear = { id: 'wear_test00001', date: '2026-10-03', itemIds: ['itm_test00001'] };

describe('exportar y restaurar', () => {
  it('ida y vuelta completa a un dispositivo vacío: mismas fichas, metadatos y bytes de cada foto', async () => {
    const src = await newDb();
    await seed(src, [1, 2, 3], { legacy: 2 });
    await src.outfits.put(outfit);
    await src.wearLog.put(wear);
    const exp = await exportBackup(src, { appVersion: '0.1.2', now: new Date('2026-10-12T18:30:00') });
    expect(exp.fileName).toBe('armario-copia-2026-10-12-1830.armario.zip');
    expect(exp.counts).toMatchObject({ items: 3, images: 3, outfits: 1, wearLog: 1 });
    expect((await getSetting<LastExport | null>('lastExport', null, src))?.counts.items).toBe(3);

    const dst = await newDb();
    const read = ok(await readBackup(exp.blob));
    expect(read.problems).toEqual([]);
    const plan = await planImport(read.backup, dst);
    expect(plan.items.every((p) => p.status === 'new')).toBe(true);
    const report = await applyImport(plan, { mode: 'merge' }, dst);
    expect(report).toMatchObject({ added: 3, replaced: 0, skipped: 0 });
    expect(report.consistency.issues).toEqual([]);

    const a = await dump(src);
    const b = await dump(dst);
    expect(b.items).toEqual(a.items);
    expect(b.images).toEqual(a.images);
    expect(b.blobs).toEqual(a.blobs); // incluida la foto guardada como Blob (v0.1.0)
    expect(b.outfits).toEqual(a.outfits);
    expect(b.wearLog).toEqual(a.wearLog);
    // En el destino todas las fotos quedan en el formato actual (ArrayBuffer + tipo)
    expect((await dst.blobs.toArray()).every((r) => r.data instanceof ArrayBuffer && r.type === 'image/webp')).toBe(true);
  });

  it('exportar no modifica nada del dispositivo', async () => {
    const d = await newDb();
    await seed(d, [1, 2], { legacy: 1 });
    const before = await dump(d);
    await exportBackup(d);
    expect(await dump(d)).toEqual(before);
  });

  it('restaurar dos veces la misma copia no duplica nada', async () => {
    const src = await newDb();
    await seed(src, [1, 2]);
    await src.outfits.put(outfit);
    const exp = await exportBackup(src);
    const dst = await newDb();
    await applyImport(await planImport(ok(await readBackup(exp.blob)).backup, dst), { mode: 'merge' }, dst);
    const plan2 = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    expect(plan2.items.map((p) => p.status)).toEqual(['same', 'same']);
    expect(plan2.others[0]).toMatchObject({ add: 0, same: 1 });
    const r = await applyImport(plan2, { mode: 'merge' }, dst);
    expect(r).toMatchObject({ added: 0, skipped: 2 });
    expect(await dst.items.count()).toBe(2);
    expect(await dst.images.count()).toBe(2);
    expect(await dst.blobs.count()).toBe(4);
    expect(await dst.outfits.count()).toBe(1);
  });
});

describe('restaurar sobre datos existentes', () => {
  async function setup() {
    const src = await newDb();
    await seed(src, [1, 2, 3]);
    await src.outfits.put(outfit);
    const exp = await exportBackup(src);
    const dst = await newDb();
    await seed(dst, [1, 2, 3]);
    return { exp, dst };
  }

  it('un conflicto (misma prenda modificada) conserva la del dispositivo salvo que elijas la de la copia', async () => {
    const { exp, dst } = await setup();
    await dst.items.update('itm_test00001', { name: 'Renombrada en el móvil' });
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    expect(plan.items.find((p) => p.item.id === 'itm_test00001')).toMatchObject({ status: 'conflict', existing: { name: 'Renombrada en el móvil' } });

    await applyImport(plan, { mode: 'merge' }, dst);
    expect((await dst.items.get('itm_test00001'))?.name).toBe('Renombrada en el móvil');

    await applyImport(plan, { mode: 'merge', useBackup: new Set(['itm_test00001']) }, dst);
    expect((await dst.items.get('itm_test00001'))?.name).toBe('Prenda 1');
  });

  it('al usar la versión de la copia, las fotos de la prenda se sustituyen sin dejar restos', async () => {
    const { exp, dst } = await setup();
    // En el móvil se añadió una segunda foto después de la copia.
    await dst.images.put({ id: 'img_extra00001', itemId: 'itm_test00001', mime: 'image/webp', width: 10, height: 10, bytes: 20, sha256: hash('extra'), createdAt: '2026-10-05T10:00:00Z' });
    await dst.blobs.bulkPut([{ imageId: 'img_extra00001', variant: 'display', data: webp('x').buffer as ArrayBuffer, type: 'image/webp' }, { imageId: 'img_extra00001', variant: 'thumb', data: webp('y').buffer as ArrayBuffer, type: 'image/webp' }]);
    await dst.items.update('itm_test00001', { imageIds: ['img_test00001', 'img_extra00001'] });
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    const r = await applyImport(plan, { mode: 'merge', useBackup: new Set(['itm_test00001']) }, dst);
    expect(r.replaced).toBe(1);
    expect(await dst.images.get('img_extra00001')).toBeUndefined();
    expect(await dst.blobs.where('imageId').equals('img_extra00001').count()).toBe(0);
    expect(r.consistency.issues).toEqual([]);
  });

  it('una prenda con otro ID pero la misma foto se marca como posible duplicado y por defecto no se importa', async () => {
    const src = await newDb();
    await seed(src, [7]);
    const exp = await exportBackup(src);
    const dst = await newDb();
    await seed(dst, [1]);
    // Misma huella de foto que la prenda 7 de la copia
    await dst.images.update('img_test00001', { sha256: hash('p7') });
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    expect(plan.items[0]).toMatchObject({ status: 'duplicate', duplicateOf: { id: 'itm_test00001' } });
    expect((await applyImport(plan, { mode: 'merge' }, dst)).skipped).toBe(1);
    expect(await dst.items.count()).toBe(1);
    await applyImport(plan, { mode: 'merge', importDuplicates: new Set(['itm_test00007']) }, dst);
    expect(await dst.items.count()).toBe(2);
  });

  it('fusionar añade lo nuevo y no toca las prendas que solo existen en el dispositivo', async () => {
    const src = await newDb();
    await seed(src, [1, 2]);
    const exp = await exportBackup(src);
    const dst = await newDb();
    await seed(dst, [5]);
    await applyImport(await planImport(ok(await readBackup(exp.blob)).backup, dst), { mode: 'merge' }, dst);
    expect((await dst.items.toCollection().primaryKeys()).sort()).toEqual(['itm_test00001', 'itm_test00002', 'itm_test00005']);
  });

  it('conjuntos con el mismo ID y distinto contenido: se conserva el del dispositivo', async () => {
    const { exp, dst } = await setup();
    await dst.outfits.put({ ...outfit, favorite: false, notes: 'mío' });
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    expect(plan.others[0]).toMatchObject({ keepMine: 1 });
    await applyImport(plan, { mode: 'merge' }, dst);
    expect((await dst.outfits.get(outfit.id))?.notes).toBe('mío');
  });

  it('«reemplazar todo» exige escribir la confirmación y entonces deja exactamente la copia', async () => {
    const { exp, dst } = await setup();
    await seed(dst, [9]);
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    const before = await dump(dst);
    await expect(applyImport(plan, { mode: 'replace', confirmation: 'reemplazar' }, dst)).rejects.toBeInstanceOf(ImportError);
    expect(await dump(dst)).toEqual(before);
    await applyImport(plan, { mode: 'replace', confirmation: REPLACE_WORD }, dst);
    expect((await dst.items.toCollection().primaryKeys()).sort()).toEqual(['itm_test00001', 'itm_test00002', 'itm_test00003']);
  });

  it('si la escritura falla a mitad, no cambia nada (todo o nada)', async () => {
    const src = await newDb();
    await seed(src, [1, 2]);
    const exp = await exportBackup(src);
    const dst = await newDb();
    await seed(dst, [5]);
    const before = await dump(dst);
    const plan = await planImport(ok(await readBackup(exp.blob)).backup, dst);
    const orig = dst.blobs.bulkPut.bind(dst.blobs);
    dst.blobs.bulkPut = (() => Promise.reject(new DOMException('Simulado', 'QuotaExceededError'))) as unknown as typeof dst.blobs.bulkPut;
    await expect(applyImport(plan, { mode: 'merge' }, dst)).rejects.toThrow(/espacio|No se ha/);
    dst.blobs.bulkPut = orig;
    expect(await dump(dst)).toEqual(before);
  });
});

describe('archivos corruptos o incompatibles', () => {
  async function base() {
    const d = await newDb();
    await seed(d, [1, 2]);
    return (await exportBackup(d)).blob;
  }
  const fatalOf = async (b: Blob) => {
    const r = await readBackup(b);
    expect(r.ok).toBe(false);
    return (r as { fatal: string }).fatal;
  };

  it('archivo vacío, que no es ZIP o ZIP truncado', async () => {
    expect(await fatalOf(new Blob([]))).toMatch(/vacío/);
    expect(await fatalOf(new Blob(['hola, no soy un zip']))).toMatch(/no es un ZIP/);
    const full = new Uint8Array(await (await base()).arrayBuffer());
    expect(await fatalOf(new Blob([full.slice(0, full.length / 2)]))).toMatch(/dañado o incompleto/);
  });

  it('sin manifiesto, carpeta comprimida o manifiesto dañado', async () => {
    expect(await fatalOf(new Blob([zipSync({ 'otra.txt': strToU8('x') }) as BlobPart]))).toMatch(/no contiene manifest/);
    expect(await fatalOf(new Blob([zipSync({ 'carpeta/manifest.json': strToU8('{}') }) as BlobPart]))).toMatch(/carpeta/);
    expect(await fatalOf(new Blob([zipSync({ 'manifest.json': strToU8('{roto') }) as BlobPart]))).toMatch(/no es JSON/);
  });

  it('formato ajeno, versiones futuras y paquetes que no son copias', async () => {
    const b = await base();
    expect(await fatalOf(await tamper(b, (_, m) => (m.format = 'otra-app')))).toMatch(/no es una copia de Armario/);
    expect(await fatalOf(await tamper(b, (_, m) => (m.formatVersion = 2)))).toMatch(/formato 2.*Actualiza/);
    expect(await fatalOf(await tamper(b, (_, m) => (m.schemaVersion = 99)))).toMatch(/esquema de datos 99.*Actualiza/);
    expect(await fatalOf(await tamper(b, (_, m) => (m.kind = 'batch')))).toMatch(/lote/);
  });

  it('manifiesto incoherente con su contenido o con rutas peligrosas', async () => {
    const b = await base();
    expect(await fatalOf(await tamper(b, (_, m) => ((m.items as unknown[]).pop())))).toMatch(/incompleta o manipulada/);
    expect(await fatalOf(await tamper(b, (f) => (f['../fuera.txt'] = strToU8('x'))))).toMatch(/ruta no permitida/);
  });

  it('foto ausente, alterada o que no es imagen: problema concreto y la prenda se importa sin esa foto', async () => {
    const b = await base();
    for (const [mutate, msg] of [
      [(f: Record<string, Uint8Array>) => delete f['images/img_test00001.webp'], /falta el archivo/],
      [(f: Record<string, Uint8Array>) => (f['images/img_test00001.webp'] = webp('cambiada')), /dañada/],
      [(f: Record<string, Uint8Array>) => (f['images/img_test00001.webp'] = strToU8('no soy imagen')), /no es una imagen/],
    ] as const) {
      const r = ok(await readBackup(await tamper(b, (f) => mutate(f))));
      expect(r.problems.map((p) => `${p.subject}: ${p.message}`).join('\n')).toMatch(msg);
      const it = r.backup.items.find((i) => i.id === 'itm_test00001')!;
      expect(it.imageIds).toEqual([]);
      expect(r.warnings.join(' ')).toMatch(/sin 1 foto/);
    }
  });

  it('una ficha inválida se aparta con su motivo y el resto se puede restaurar', async () => {
    const b = await tamper(await base(), (_, m) => {
      ((m.items as Item[])[0] as unknown as { colors: unknown }).colors = { primary: 'azulito' };
    });
    const r = ok(await readBackup(b));
    expect(r.problems[0]).toMatchObject({ subject: 'Prenda «Prenda 1»' });
    expect(r.backup.items.map((i) => i.id)).toEqual(['itm_test00002']);
    expect(r.warnings.join(' ')).toMatch(/no pertenece a ninguna prenda válida/);
  });

  it('IDs repetidos, miniatura ausente y archivos extra', async () => {
    const b = await tamper(await base(), (f, m) => {
      (m.items as unknown[]).push((m.items as unknown[])[0]);
      (m.counts as Record<string, number>).items = 3;
      delete f['thumbs/img_test00002.webp'];
      f['images/sobrante.webp'] = webp('x');
    });
    const r = ok(await readBackup(b));
    expect(r.problems.map((p) => p.message).join(' ')).toMatch(/repetido/);
    expect(r.warnings.join(' ')).toMatch(/miniatura de img_test00002/);
    expect(r.warnings.join(' ')).toMatch(/no pertenece.*a la copia/);
    const img = r.backup.images.get('img_test00002')!;
    expect(canonical(Array.from(img.thumb.bytes))).toBe(canonical(Array.from(img.display.bytes)));
  });
});
