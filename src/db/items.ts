// Repositorio de prendas e imágenes. Toda escritura que toca varias tablas
// va en una única transacción: o se guarda todo o nada.
import { newId } from '../domain/ids';
import { type BlobVariant, type ImageMeta, type Item, ItemSchema, formatIssues } from '../domain/schema';
import type { ProcessedImage } from '../images/types';
import { type ArmarioDB, db as defaultDb } from './db';

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Datos no válidos:\n- ${issues.join('\n- ')}`);
    this.name = 'ValidationError';
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
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Blob)) {
      const inner = compact(v as Record<string, unknown>);
      if (Object.keys(inner).length) out[k] = inner;
    } else out[k] = v;
  }
  return out as T;
}

/**
 * Crea o actualiza una prenda con su lista final de fotos (en orden).
 * Las fotos existentes que no aparezcan en `photos` se eliminan.
 */
export async function saveItem(input: ItemInput, photos: PhotoSlot[], database: ArmarioDB = defaultDb): Promise<Item> {
  const now = new Date().toISOString();
  const existing = input.id ? await database.items.get(input.id) : undefined;
  if (input.id && !existing) throw new Error(`La prenda ${input.id} no existe`);
  const id = existing?.id ?? newId('itm');

  const newMetas: ImageMeta[] = [];
  const newBlobs: { imageId: string; variant: BlobVariant; blob: Blob }[] = [];
  const imageIds = photos.map((p) => {
    if (p.kind === 'existing') return p.imageId;
    const imageId = newId('img');
    const { display, thumb, ...meta } = p.image;
    newMetas.push({ id: imageId, itemId: id, createdAt: now, ...meta });
    newBlobs.push({ imageId, variant: 'display', blob: display }, { imageId, variant: 'thumb', blob: thumb });
    return imageId;
  });

  const previous = existing?.imageIds ?? [];
  for (const p of photos) {
    if (p.kind === 'existing' && !previous.includes(p.imageId)) {
      throw new Error(`La imagen ${p.imageId} no pertenece a esta prenda`);
    }
  }
  const removed = previous.filter((imgId) => !imageIds.includes(imgId));

  const candidate = compact({
    ...input,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    imageIds,
  });
  const parsed = ItemSchema.safeParse(candidate);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
  const item = compact(parsed.data);

  await database.transaction('rw', database.items, database.images, database.blobs, async () => {
    await database.items.put(item);
    if (newMetas.length) await database.images.bulkAdd(newMetas);
    if (newBlobs.length) await database.blobs.bulkAdd(newBlobs);
    if (removed.length) {
      await database.images.bulkDelete(removed);
      await database.blobs.where('imageId').anyOf(removed).delete();
    }
  });
  return item;
}

/** Cambios rápidos (favorito, estado) sin tocar fotos. */
export async function patchItem(
  id: string,
  changes: Partial<Pick<Item, 'favorite' | 'status'>>,
  database: ArmarioDB = defaultDb,
): Promise<Item> {
  return database.transaction('rw', database.items, async () => {
    const current = await database.items.get(id);
    if (!current) throw new Error(`La prenda ${id} no existe`);
    const parsed = ItemSchema.safeParse({ ...current, ...changes, updatedAt: new Date().toISOString() });
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
    await database.items.put(parsed.data);
    return parsed.data;
  });
}

/** Borra la prenda, sus imágenes y sus binarios. */
export async function deleteItem(id: string, database: ArmarioDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.items, database.images, database.blobs, async () => {
    const imageIds = (await database.images.where('itemId').equals(id).primaryKeys()) as string[];
    await database.blobs.where('imageId').anyOf(imageIds).delete();
    await database.images.bulkDelete(imageIds);
    await database.items.delete(id);
  });
}

export async function getBlob(imageId: string, variant: BlobVariant, database: ArmarioDB = defaultDb): Promise<Blob | undefined> {
  return (await database.blobs.get([imageId, variant]))?.blob;
}

/** ¿Esta foto original ya se importó antes? Devuelve la imagen que la contiene. */
export async function findImageBySourceHash(sha256: string, database: ArmarioDB = defaultDb): Promise<ImageMeta | undefined> {
  return database.images.where('source.sha256').equals(sha256).first();
}
