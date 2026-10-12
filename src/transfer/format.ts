// Formato de copia de seguridad «paquete Armario» (docs/IMPORT_EXPORT.md).
// Versionado en dos ejes:
//  - formatVersion: estructura del ZIP y del manifiesto.
//  - schemaVersion: modelo de datos de las entidades (DATA_MODEL.md).
// La app lee todas las versiones anteriores (migraciones encadenadas) y escribe siempre la actual.
import { z } from 'zod';
import { ImageMetaSchema, SCHEMA_VERSION } from '../domain/schema';

export const FORMAT = 'armario-digital';
export const FORMAT_VERSION = 1;

export const LIMITS = {
  fileBytes: 1024 * 1024 * 1024, // 1 GB
  manifestBytes: 20 * 1024 * 1024,
  imageBytes: 20 * 1024 * 1024,
  entries: 20_000,
};

export const HASH_RE = /^[0-9a-f]{64}$/;
export const PATH_RE = /^(images|thumbs|originals)\/[a-z0-9_]{6,60}\.(webp|jpg|png)$/;
/** Archivos que pueden acompañar al manifiesto sin estar referenciados. */
export const ALLOWED_EXTRA = new Set(['README.txt']);

const Hash = z.string().regex(HASH_RE, 'huella SHA-256 no válida');
const FilePath = z.string().regex(PATH_RE, 'ruta de archivo no permitida');

/** Cada foto del manifiesto: metadatos de la base de datos + rutas y huellas de sus archivos. */
export const BackupImageSchema = ImageMetaSchema.extend({
  path: FilePath,
  displaySha256: Hash,
  thumbPath: FilePath.optional(),
  thumbSha256: Hash.optional(),
  originalPath: FilePath.optional(),
  originalSha256: Hash.optional(),
}).strict();
export type BackupImage = z.infer<typeof BackupImageSchema>;

export const HeaderSchema = z
  .object({
    format: z.string(),
    formatVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    kind: z.string(),
    createdAt: z.string(),
    generator: z.object({ name: z.string(), version: z.string().optional() }).loose(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .loose();
export type BackupHeader = z.infer<typeof HeaderSchema>;

export const VocabEntrySchema = z
  .object({
    kind: z.enum(['category', 'subcategory', 'style']),
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(80),
    parentId: z.string().max(60).optional(),
    slots: z.array(z.string()).optional(),
    custom: z.literal(true),
  })
  .strict();

/**
 * Migraciones del manifiesto: formatVersion n → n + 1. Hoy solo existe la v1.
 * Cuando cambie el formato se añade aquí la conversión de la anterior y un
 * fixture de la versión vieja en tests/fixtures/packages/, para que siga importándose.
 */
const MIGRATIONS: Record<number, (m: Record<string, unknown>) => Record<string, unknown>> = {};

export function upgradeManifest(m: Record<string, unknown>): Record<string, unknown> {
  let cur = m;
  while ((cur.formatVersion as number) < FORMAT_VERSION) {
    const step = MIGRATIONS[cur.formatVersion as number];
    if (!step) throw new Error(`No hay migración desde el formato ${String(cur.formatVersion)}`);
    cur = step(cur);
  }
  return cur;
}

export const CURRENT = { format: FORMAT, formatVersion: FORMAT_VERSION, schemaVersion: SCHEMA_VERSION };

export function extFor(mime: string): 'webp' | 'jpg' | 'png' {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'webp';
}

/** Reconoce el formato por los primeros bytes (no por la extensión). */
export function sniffImage(b: Uint8Array): 'image/webp' | 'image/jpeg' | 'image/png' | undefined {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return undefined;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** JSON con claves ordenadas: para comparar registros sin depender del orden de los campos. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
