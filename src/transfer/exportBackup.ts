// Exportación de la copia completa a un .armario.zip, sin salir del dispositivo.
// Las fotos se leen tal como están guardadas: ArrayBuffer + tipo (v0.1.1) o
// Blob (registros de v0.1.0). Se escriben sin recomprimir (método STORE).
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { type ArmarioDB, db as defaultDb } from '../db/db';
import { setSetting } from '../db/settings';
import { type BlobRecord, ItemSchema } from '../domain/schema';
import { type BackupImage, CURRENT, extFor, sha256 } from './format';

export interface ExportCounts {
  items: number;
  images: number;
  outfits: number;
  wearLog: number;
  feedback: number;
  kits: number;
  vocab: number;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  createdAt: string;
  counts: ExportCounts;
  bytes: number;
  warnings: string[];
}

export interface LastExport {
  at: string;
  fileName: string;
  counts: ExportCounts;
  bytes: number;
}

async function bytesOf(rec: BlobRecord): Promise<{ bytes: Uint8Array; type: string } | undefined> {
  if (rec.data) return { bytes: new Uint8Array(rec.data), type: rec.type ?? 'image/webp' };
  if (rec.blob) return { bytes: new Uint8Array(await rec.blob.arrayBuffer()), type: rec.blob.type || 'image/webp' };
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const backupFileName = (d: Date) =>
  `armario-copia-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.armario.zip`;

const README = `Copia de seguridad de Armario Digital.

Contiene tus prendas, fotos, conjuntos e historial. Guárdala fuera del móvil
(Drive, ordenador…). Para restaurarla: Armario Digital → Ajustes → Copias de
seguridad → Restaurar copia.

No modifiques ni descomprimas y vuelvas a comprimir este archivo: la app
comprueba la integridad de cada foto y rechazaría una copia alterada.
`;

export async function exportBackup(
  database: ArmarioDB = defaultDb,
  opts: { appVersion?: string; onProgress?: (done: number, total: number) => void; now?: Date } = {},
): Promise<ExportResult> {
  const now = opts.now ?? new Date();
  const warnings: string[] = [];
  // Lectura consistente de todo en una transacción de solo lectura.
  const data = await database.transaction(
    'r',
    [database.items, database.images, database.outfits, database.wearLog, database.feedback, database.kits, database.vocab],
    async () => ({
      items: (await database.items.toArray()) as unknown[],
      images: await database.images.toArray(),
      outfits: await database.outfits.toArray(),
      wearLog: await database.wearLog.toArray(),
      feedback: await database.feedback.toArray(),
      kits: await database.kits.toArray(),
      vocab: await database.vocab.toArray(),
    }),
  );

  const invalid = data.items.filter((i) => !ItemSchema.safeParse(i).success).length;
  if (invalid) warnings.push(`${invalid} ficha${invalid > 1 ? 's' : ''} con datos no válidos se incluye${invalid > 1 ? 'n' : ''} tal cual (al restaurar se indicará el problema).`);

  const chunks: Uint8Array[] = [];
  let fail: (e: Error) => void = () => {};
  let finish: () => void = () => {};
  const finished = new Promise<void>((res, rej) => {
    finish = res;
    fail = rej;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    chunks.push(chunk);
    if (final) finish();
  });
  const stored = (path: string, bytes: Uint8Array) => {
    const f = new ZipPassThrough(path);
    f.mtime = now;
    zip.add(f);
    f.push(bytes, true);
  };

  const images: BackupImage[] = [];
  let i = 0;
  for (const meta of data.images) {
    opts.onProgress?.(i++, data.images.length);
    const recs = await database.blobs.where('imageId').equals(meta.id).toArray();
    const byVariant = new Map(recs.map((r) => [r.variant, r]));
    const display = byVariant.get('display') ? await bytesOf(byVariant.get('display')!) : undefined;
    if (!display) {
      warnings.push(`La foto ${meta.id} no tiene imagen guardada y no se ha podido incluir.`);
      continue;
    }
    const entry: BackupImage = {
      ...meta,
      path: `images/${meta.id}.${extFor(display.type)}`,
      displaySha256: await sha256(display.bytes),
    };
    stored(entry.path, display.bytes);
    const thumb = byVariant.get('thumb') ? await bytesOf(byVariant.get('thumb')!) : undefined;
    if (thumb) {
      entry.thumbPath = `thumbs/${meta.id}.${extFor(thumb.type)}`;
      entry.thumbSha256 = await sha256(thumb.bytes);
      stored(entry.thumbPath, thumb.bytes);
    }
    const original = byVariant.get('original') ? await bytesOf(byVariant.get('original')!) : undefined;
    if (original) {
      entry.originalPath = `originals/${meta.id}.${extFor(original.type)}`;
      entry.originalSha256 = await sha256(original.bytes);
      stored(entry.originalPath, original.bytes);
    }
    images.push(entry);
  }
  opts.onProgress?.(data.images.length, data.images.length);

  const counts: ExportCounts = {
    items: data.items.length,
    images: images.length,
    outfits: data.outfits.length,
    wearLog: data.wearLog.length,
    feedback: data.feedback.length,
    kits: data.kits.length,
    vocab: data.vocab.length,
  };
  const manifest = {
    ...CURRENT,
    kind: 'backup',
    createdAt: now.toISOString(),
    generator: { name: 'armario-app', version: opts.appVersion ?? 'dev' },
    counts,
    items: data.items,
    images,
    outfits: data.outfits,
    wearLog: data.wearLog,
    feedback: data.feedback,
    kits: data.kits,
    vocab: data.vocab,
  };
  const m = new ZipDeflate('manifest.json', { level: 6 });
  m.mtime = now;
  zip.add(m);
  m.push(strToU8(JSON.stringify(manifest, null, 1)), true);
  stored('README.txt', strToU8(README));
  zip.end();
  await finished;

  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  const result: ExportResult = { blob, fileName: backupFileName(now), createdAt: now.toISOString(), counts, bytes: blob.size, warnings };
  // Solo constancia de que se GENERÓ: la app no puede saber si guardaste el archivo.
  await setSetting('lastExport', { at: result.createdAt, fileName: result.fileName, counts, bytes: result.bytes } satisfies LastExport, database);
  return result;
}
