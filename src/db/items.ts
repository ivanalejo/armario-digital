// Repositorio de prendas e imágenes. Toda escritura que toca varias tablas
// va en una única transacción con tiempo límite: o se guarda todo o nada, y
// si IndexedDB no responde la transacción se aborta para no dejarla abierta.
import Dexie, { type Transaction } from 'dexie';
import { newId } from '../domain/ids';
import { type BlobRecord, type BlobVariant, type ImageMeta, type Item, ItemSchema, formatIssues } from '../domain/schema';
import type { ProcessedImage } from '../images/types';
import { logError } from '../platform/errorLog';
import { TimeoutError, timeouts, withTimeout } from '../platform/timeouts';
import { type ArmarioDB, db as defaultDb } from './db';

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Datos no válidos:\n- ${issues.join('\n- ')}`);
    this.name = 'ValidationError';
  }
}

/** Error de base de datos con un mensaje comprensible para la interfaz. */
export class DbError extends Error {
  constructor(
    message: string,
    public readonly kind: 'timeout' | 'quota' | 'closed' | 'other',
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

function toDbError(err: unknown, action: string): Error {
  if (err instanceof ValidationError || err instanceof DbError) return err;
  const name = (err as { name?: string })?.name ?? '';
  const inner = (err as { inner?: { name?: string } })?.inner?.name ?? '';
  if (err instanceof TimeoutError) {
    return new DbError(
      `La base de datos no ha respondido al ${action}. No se ha guardado nada y tus datos anteriores no se han tocado. Vuelve a intentarlo; si se repite, cierra la app por completo y ábrela de nuevo.`,
      'timeout',
      err,
    );
  }
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return new DbError(`No hay espacio suficiente en el dispositivo para ${action}. No se ha guardado nada.`, 'quota', err);
  }
  if (name === 'DatabaseClosedError' || name === 'InvalidStateError') {
    return new DbError(`La base de datos se ha cerrado (¿otra ventana de la app abierta?). Recarga la app y vuelve a intentarlo.`, 'closed', err);
  }
  return new DbError(`Error de la base de datos al ${action}: ${(err as Error)?.message ?? String(err)}`, 'other', err);
}

/** Transacción de escritura con tiempo límite. Si vence, se aborta para liberar el bloqueo. */
async function writeTx<T>(
  database: ArmarioDB,
  tables: Dexie.Table[],
  action: string,
  body: () => Promise<T>,
): Promise<T> {
  let tx: Transaction | undefined;
  const run = database.transaction('rw', tables, (t) => {
    tx = t;
    return body();
  });
  try {
    return await withTimeout(run, timeouts().db, 'timeout');
  } catch (err) {
    if (err instanceof TimeoutError) {
      run.catch(() => {}); // el rechazo por el aborto ya está gestionado aquí
      try {
        tx?.abort();
      } catch {
        /* ya terminada */
      }
    }
    const e = toDbError(err, action);
    if (!(e instanceof ValidationError)) logError(`guardar (${action})`, err);
    throw e;
  }
}

/** Foto en la lista de edición: una ya guardada o una nueva recién procesada. */
export type PhotoSlot =
  | { kind: 'existing'; imageId: string }
  | { kind: 'new'; key: string; image: ProcessedImage };

export type ItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'imageIds'> & { id?: string };

/** Elimina claves con `undefined` para respetar «ausente = desconocido». */
export function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Blob) && !(v instanceof ArrayBuffer)) {
      const inner = compact(v as Record<string, unknown>);
      if (Object.keys(inner).length) out[k] = inner;
    } else out[k] = v;
  }
  return out as T;
}

async function blobToRecord(imageId: string, variant: BlobVariant, blob: Blob): Promise<BlobRecord> {
  const data = await withTimeout(blob.arrayBuffer(), timeouts().image, 'No se pudo leer la imagen procesada.');
  return { imageId, variant, data, type: blob.type };
}

/**
 * Crea o actualiza una prenda con su lista final de fotos (en orden).
 * Las fotos existentes que no aparezcan en `photos` se eliminan.
 */
export async function saveItem(input: ItemInput, photos: PhotoSlot[], database: ArmarioDB = defaultDb): Promise<Item> {
  const now = new Date().toISOString();
  const id = input.id ?? newId('itm');

  // Todo lo asíncrono que no es IndexedDB se hace ANTES de abrir la transacción.
  const newMetas: ImageMeta[] = [];
  const newBlobs: BlobRecord[] = [];
  const imageIds: string[] = [];
  for (const p of photos) {
    if (p.kind === 'existing') {
      imageIds.push(p.imageId);
      continue;
    }
    const imageId = newId('img');
    const { display, thumb, ...meta } = p.image;
    newMetas.push({ id: imageId, itemId: id, createdAt: now, ...meta });
    newBlobs.push(await blobToRecord(imageId, 'display', display), await blobToRecord(imageId, 'thumb', thumb));
    imageIds.push(imageId);
  }

  return writeTx(database, [database.items, database.images, database.blobs], 'guardar la prenda', async () => {
    const existing = input.id ? await database.items.get(input.id) : undefined;
    if (input.id && !existing) throw new ValidationError([`La prenda ${input.id} no existe`]);
    const previous = existing?.imageIds ?? [];
    for (const p of photos) {
      if (p.kind === 'existing' && !previous.includes(p.imageId)) {
        throw new ValidationError([`La imagen ${p.imageId} no pertenece a esta prenda`]);
      }
    }
    const removed = previous.filter((imgId) => !imageIds.includes(imgId));
    const parsed = ItemSchema.safeParse(
      compact({ ...input, id, createdAt: existing?.createdAt ?? now, updatedAt: now, imageIds }),
    );
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
    const item = compact(parsed.data);

    await database.items.put(item);
    if (newMetas.length) await database.images.bulkAdd(newMetas);
    if (newBlobs.length) await database.blobs.bulkAdd(newBlobs);
    if (removed.length) {
      await database.images.bulkDelete(removed);
      await database.blobs.where('imageId').anyOf(removed).delete();
    }
    return item;
  });
}

/** Cambios rápidos (favorito, estado) sin tocar fotos. */
export async function patchItem(
  id: string,
  changes: Partial<Pick<Item, 'favorite' | 'status'>>,
  database: ArmarioDB = defaultDb,
): Promise<Item> {
  return writeTx(database, [database.items], 'actualizar la prenda', async () => {
    const current = await database.items.get(id);
    if (!current) throw new ValidationError([`La prenda ${id} no existe`]);
    const parsed = ItemSchema.safeParse({ ...current, ...changes, updatedAt: new Date().toISOString() });
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
    await database.items.put(parsed.data);
    return parsed.data;
  });
}

/** Borra la prenda, sus imágenes y sus binarios. */
export async function deleteItem(id: string, database: ArmarioDB = defaultDb): Promise<void> {
  await writeTx(database, [database.items, database.images, database.blobs], 'borrar la prenda', async () => {
    const imageIds = (await database.images.where('itemId').equals(id).primaryKeys()) as string[];
    await database.blobs.where('imageId').anyOf(imageIds).delete();
    await database.images.bulkDelete(imageIds);
    await database.items.delete(id);
  });
}

/** Convierte un registro (formato actual o de v0.1.0) en Blob para mostrarlo. */
export function recordToBlob(rec: BlobRecord | undefined): Blob | undefined {
  if (!rec) return undefined;
  if (rec.data) return new Blob([rec.data], { type: rec.type ?? 'image/webp' });
  return rec.blob;
}

export async function getBlob(imageId: string, variant: BlobVariant, database: ArmarioDB = defaultDb): Promise<Blob | undefined> {
  const rec = await withTimeout(database.blobs.get([imageId, variant]), timeouts().db, 'La imagen no se ha podido leer a tiempo.');
  return recordToBlob(rec);
}

/** ¿Esta foto original ya se importó antes? Devuelve la imagen que la contiene. */
export async function findImageBySourceHash(sha256: string, database: ArmarioDB = defaultDb): Promise<ImageMeta | undefined> {
  return withTimeout(database.images.where('source.sha256').equals(sha256).first(), timeouts().db, 'timeout');
}
