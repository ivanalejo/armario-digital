// Comprobaciones de solo lectura: carga tolerante a registros inválidos y
// detección de incoherencias. Nada de aquí modifica ni borra datos.
import { type Item, ItemSchema, formatIssues } from '../domain/schema';
import { type ArmarioDB, db as defaultDb } from './db';

export interface InvalidRecord {
  id: string;
  issues: string[];
}

export interface LoadedItems {
  items: Item[];
  invalid: InvalidRecord[];
}

/** Lee las prendas separando las válidas de las que tienen problemas, para que una ficha rota no impida ver el resto. */
export async function loadItems(database: ArmarioDB = defaultDb): Promise<LoadedItems> {
  const raw = (await database.items.toArray()) as unknown[];
  const items: Item[] = [];
  const invalid: InvalidRecord[] = [];
  for (const r of raw) {
    const parsed = ItemSchema.safeParse(r);
    if (parsed.success) items.push(parsed.data);
    else invalid.push({ id: String((r as { id?: unknown })?.id ?? '¿sin id?'), issues: formatIssues(parsed.error) });
  }
  return { items, invalid };
}

export interface ConsistencyReport {
  counts: Record<string, number>;
  invalidItems: InvalidRecord[];
  issues: string[];
}

/** Revisa referencias entre prendas, imágenes y binarios. Solo informa. */
export async function checkConsistency(database: ArmarioDB = defaultDb): Promise<ConsistencyReport> {
  const [{ items, invalid }, images, blobKeys] = await Promise.all([
    loadItems(database),
    database.images.toArray(),
    database.blobs.toCollection().primaryKeys() as Promise<[string, string][]>,
  ]);
  const issues: string[] = [];
  const imageById = new Map(images.map((i) => [i.id, i]));
  const itemIds = new Set([...items.map((i) => i.id), ...invalid.map((i) => i.id)]);
  const variants = new Map<string, Set<string>>();
  for (const [imageId, variant] of blobKeys) {
    if (!variants.has(imageId)) variants.set(imageId, new Set());
    variants.get(imageId)!.add(variant);
  }
  for (const it of items) {
    for (const imgId of it.imageIds) {
      const img = imageById.get(imgId);
      if (!img) issues.push(`Prenda ${it.id}: referencia la imagen ${imgId}, que no existe`);
      else if (img.itemId !== it.id) issues.push(`Prenda ${it.id}: la imagen ${imgId} pertenece a ${img.itemId}`);
    }
  }
  for (const img of images) {
    if (!itemIds.has(img.itemId)) issues.push(`Imagen ${img.id}: su prenda ${img.itemId} no existe (huérfana)`);
    const v = variants.get(img.id);
    if (!v?.has('display')) issues.push(`Imagen ${img.id}: falta el binario display`);
    if (!v?.has('thumb')) issues.push(`Imagen ${img.id}: falta la miniatura`);
  }
  for (const imageId of variants.keys()) {
    if (!imageById.has(imageId)) issues.push(`Binario de ${imageId}: sin registro de imagen (huérfano)`);
  }
  return {
    counts: { items: items.length + invalid.length, images: images.length, blobs: blobKeys.length },
    invalidItems: invalid,
    issues,
  };
}
