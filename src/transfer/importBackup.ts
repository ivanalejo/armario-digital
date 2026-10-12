// Plan de importación (comparación con lo que ya hay, sin escribir) y aplicación
// en UNA transacción: o se restaura todo lo elegido o no cambia nada.
import type { Table, Transaction } from 'dexie';
import { type ArmarioDB, db as defaultDb } from '../db/db';
import { checkConsistency, type ConsistencyReport } from '../db/health';
import type { BlobRecord, ImageMeta, Item } from '../domain/schema';
import { logError } from '../platform/errorLog';
import { TimeoutError, timeouts, withTimeout } from '../platform/timeouts';
import { canonical } from './format';
import type { ParsedBackup } from './readBackup';

export type ItemStatus = 'new' | 'same' | 'conflict' | 'duplicate' | 'blocked';

export interface ItemPlan {
  item: Item;
  status: ItemStatus;
  /** Ficha actual con el mismo ID (en conflictos). */
  existing?: Item;
  /** Prenda existente con una foto idéntica (posibles duplicados). */
  duplicateOf?: Item;
  reason?: string;
}

export interface OtherPlan {
  label: string;
  add: number;
  same: number;
  /** Mismo ID pero contenido distinto: se conserva el del dispositivo (salvo «reemplazar todo»). */
  keepMine: number;
}

export interface ImportPlan {
  backup: ParsedBackup;
  items: ItemPlan[];
  others: OtherPlan[];
  /** Hay datos en este dispositivo (para advertir antes de «reemplazar todo»). */
  localItems: number;
}

export interface ImportChoices {
  mode: 'merge' | 'replace';
  /** Conflictos: por defecto se mantiene la versión del dispositivo. */
  useBackup?: ReadonlySet<string>;
  /** Posibles duplicados: por defecto no se importan. */
  importDuplicates?: ReadonlySet<string>;
  /** Para «reemplazar todo» hay que escribir exactamente esta palabra. */
  confirmation?: string;
}

export const REPLACE_WORD = 'REEMPLAZAR';

export interface ImportReport {
  added: number;
  replaced: number;
  skipped: number;
  others: Record<string, number>;
  consistency: ConsistencyReport;
}

export class ImportError extends Error {
  override name = 'ImportError';
}

const imageSetKey = (it: Item, metaOf: (id: string) => ImageMeta | undefined) =>
  it.imageIds.map((id) => metaOf(id)?.sha256 ?? id).join(',');

export async function planImport(backup: ParsedBackup, database: ArmarioDB = defaultDb): Promise<ImportPlan> {
  const [localItems, localImages] = await Promise.all([database.items.toArray(), database.images.toArray()]);
  const byId = new Map(localItems.map((i) => [i.id, i]));
  const imageById = new Map(localImages.map((i) => [i.id, i]));
  const itemByImageHash = new Map<string, Item>();
  for (const img of localImages) {
    const owner = byId.get(img.itemId);
    if (owner) itemByImageHash.set(img.sha256, owner);
  }
  const backupMeta = (id: string) => backup.images.get(id)?.meta;

  const items: ItemPlan[] = backup.items.map((item) => {
    const existing = byId.get(item.id);
    // Una foto de la copia con el mismo ID que una foto de OTRA prenda local: no se toca.
    const clash = item.imageIds.find((id) => {
      const local = imageById.get(id);
      return local && local.itemId !== item.id;
    });
    if (clash) return { item, status: 'blocked', reason: `su foto ${clash} ya existe en otra prenda de este dispositivo` };
    if (existing) {
      const same =
        canonical(existing) === canonical(item) &&
        imageSetKey(existing, (id) => imageById.get(id)) === imageSetKey(item, backupMeta);
      return same ? { item, status: 'same' } : { item, status: 'conflict', existing };
    }
    const dup = item.imageIds.map((id) => backupMeta(id)?.sha256).find((h) => h && itemByImageHash.has(h));
    if (dup) return { item, status: 'duplicate', duplicateOf: itemByImageHash.get(dup) };
    return { item, status: 'new' };
  });

  const compare = async <T extends { id: string }>(label: string, list: T[], table: Table<T, string>): Promise<OtherPlan> => {
    const local = new Map((await table.toArray()).map((r) => [r.id, r]));
    let add = 0;
    let same = 0;
    let keepMine = 0;
    for (const r of list) {
      const l = local.get(r.id);
      if (!l) add++;
      else if (canonical(l) === canonical(r)) same++;
      else keepMine++;
    }
    return { label, add, same, keepMine };
  };
  const vocabLocal = new Set((await database.vocab.toArray()).map((v) => `${v.kind}:${v.id}`));
  const others: OtherPlan[] = [
    await compare('Conjuntos guardados', backup.outfits, database.outfits),
    await compare('Registros de uso', backup.wearLog, database.wearLog),
    await compare('Valoraciones y descartes', backup.feedback, database.feedback),
    await compare('Kits de catalogación', backup.kits, database.kits),
    { label: 'Vocabulario propio', add: backup.vocab.filter((v) => !vocabLocal.has(`${v.kind}:${v.id}`)).length, same: backup.vocab.filter((v) => vocabLocal.has(`${v.kind}:${v.id}`)).length, keepMine: 0 },
  ];
  return { backup, items, others, localItems: localItems.length };
}

const toBuffer = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

export async function applyImport(plan: ImportPlan, choices: ImportChoices, database: ArmarioDB = defaultDb): Promise<ImportReport> {
  const replace = choices.mode === 'replace';
  if (replace && choices.confirmation !== REPLACE_WORD) {
    throw new ImportError(`Para reemplazar todo escribe ${REPLACE_WORD}. No se ha cambiado nada.`);
  }
  const { backup } = plan;

  // Qué prendas se escriben y cuáles sustituyen a una existente.
  const toWrite: Item[] = [];
  const replacing: Item[] = [];
  let skipped = 0;
  for (const p of plan.items) {
    // Al reemplazar todo se vacía la base de datos: no queda nada con lo que chocar.
    const take =
      replace ||
      p.status === 'new' ||
        (p.status === 'conflict' && choices.useBackup?.has(p.item.id)) ||
        (p.status === 'duplicate' && choices.importDuplicates?.has(p.item.id));
    if (!take) {
      skipped++;
      continue;
    }
    toWrite.push(p.item);
    if (!replace && p.status === 'conflict') replacing.push(p.existing!);
  }

  // Todo lo que no es IndexedDB se prepara antes de abrir la transacción.
  const metas: ImageMeta[] = [];
  const blobs: BlobRecord[] = [];
  for (const it of toWrite) {
    for (const id of it.imageIds) {
      const img = backup.images.get(id);
      if (!img) continue;
      metas.push(img.meta);
      blobs.push({ imageId: id, variant: 'display', data: toBuffer(img.display.bytes), type: img.display.type });
      blobs.push({ imageId: id, variant: 'thumb', data: toBuffer(img.thumb.bytes), type: img.thumb.type });
      if (img.original) blobs.push({ imageId: id, variant: 'original', data: toBuffer(img.original.bytes), type: img.original.type });
    }
  }
  const othersCount: Record<string, number> = {};
  const tables = [database.items, database.images, database.blobs, database.outfits, database.wearLog, database.feedback, database.kits, database.vocab];
  // Tiempo límite proporcional al tamaño (mínimo 30 s).
  const ms = Math.max(30_000, timeouts().db, Math.round(backup.imageBytes / 1024 / 1024) * 1000);

  let tx: Transaction | undefined;
  const run = database.transaction('rw', tables, async (t) => {
    tx = t;
    if (replace) for (const table of tables) await table.clear();
    for (const old of replacing) {
      const oldImages = (await database.images.where('itemId').equals(old.id).primaryKeys()) as string[];
      await database.blobs.where('imageId').anyOf(oldImages).delete();
      await database.images.bulkDelete(oldImages);
    }
    if (toWrite.length) await database.items.bulkPut(toWrite);
    if (metas.length) await database.images.bulkPut(metas);
    if (blobs.length) await database.blobs.bulkPut(blobs);
    // Resto de datos: se añade lo nuevo; con el mismo ID se conserva lo del dispositivo.
    const addMissing = async <T extends { id: string }>(key: string, list: T[], table: Table<T, string>) => {
      const existing = new Set((await table.toCollection().primaryKeys()) as string[]);
      const fresh = list.filter((r) => !existing.has(r.id));
      if (fresh.length) await table.bulkAdd(fresh);
      othersCount[key] = fresh.length;
    };
    await addMissing('outfits', backup.outfits, database.outfits);
    await addMissing('wearLog', backup.wearLog, database.wearLog);
    await addMissing('feedback', backup.feedback, database.feedback);
    await addMissing('kits', backup.kits, database.kits);
    const vocabKeys = new Set((await database.vocab.toArray()).map((v) => `${v.kind}:${v.id}`));
    const freshVocab = backup.vocab.filter((v) => !vocabKeys.has(`${v.kind}:${v.id}`));
    if (freshVocab.length) await database.vocab.bulkAdd(freshVocab);
    othersCount.vocab = freshVocab.length;
  });
  try {
    await withTimeout(run, ms, 'timeout');
  } catch (err) {
    if (err instanceof TimeoutError) {
      run.catch(() => {});
      try {
        tx?.abort();
      } catch {
        /* ya terminada */
      }
    }
    logError('importar copia', err);
    const name = (err as { name?: string; inner?: { name?: string } })?.name;
    if (err instanceof TimeoutError) throw new ImportError('La base de datos no ha respondido a tiempo. No se ha importado nada; vuelve a intentarlo con la app recién abierta.');
    if (name === 'QuotaExceededError' || (err as { inner?: { name?: string } }).inner?.name === 'QuotaExceededError') {
      throw new ImportError('No hay espacio suficiente en el dispositivo. No se ha importado nada.');
    }
    throw new ImportError(`No se ha podido importar y no se ha cambiado nada: ${(err as Error).message}`);
  }
  return {
    added: toWrite.length - replacing.length,
    replaced: replacing.length,
    skipped,
    others: othersCount,
    consistency: await checkConsistency(database),
  };
}
