// Lectura y validación de una copia. NO escribe nada: produce una copia
// «comprobada» (solo con lo válido) más la lista de problemas encontrados.
import { unzipSync } from 'fflate';
import {
  FeedbackEventSchema,
  formatIssues,
  type FeedbackEvent,
  type ImageMeta,
  type Item,
  ItemSchema,
  KitSchema,
  type Kit,
  OutfitSchema,
  type Outfit,
  SCHEMA_VERSION,
  WearEntrySchema,
  type WearEntry,
} from '../domain/schema';
import type { VocabRecord } from '../db/db';
import type { z } from 'zod';
import {
  ALLOWED_EXTRA,
  BackupImageSchema,
  FORMAT,
  FORMAT_VERSION,
  HeaderSchema,
  LIMITS,
  sha256,
  sniffImage,
  upgradeManifest,
  VocabEntrySchema,
  type BackupHeader,
} from './format';

export interface ImageFiles {
  meta: ImageMeta;
  display: { bytes: Uint8Array; type: string };
  thumb: { bytes: Uint8Array; type: string };
  original?: { bytes: Uint8Array; type: string };
}

export interface Problem {
  /** Qué se ve afectado: «Prenda «Camisa…»», «Foto img_…», «Conjunto out_…». */
  subject: string;
  message: string;
}

export interface ParsedBackup {
  header: BackupHeader;
  items: Item[];
  images: Map<string, ImageFiles>;
  outfits: Outfit[];
  wearLog: WearEntry[];
  feedback: FeedbackEvent[];
  kits: Kit[];
  vocab: VocabRecord[];
  /** Tamaño total de las fotos válidas (para estimar el tiempo de escritura). */
  imageBytes: number;
}

export type ReadResult =
  | { ok: false; fatal: string }
  | { ok: true; backup: ParsedBackup; problems: Problem[]; warnings: string[] };

const fatal = (msg: string): ReadResult => ({ ok: false, fatal: msg });

function nameOf(raw: unknown): string {
  const r = raw as { name?: unknown; id?: unknown };
  return typeof r?.name === 'string' ? `«${r.name}»` : typeof r?.id === 'string' ? r.id : '(sin identificador)';
}

/** Valida una lista de registros uno a uno: los inválidos se apartan con su motivo. */
function validateList<T>(raw: unknown, schema: z.ZodType<T>, label: string, problems: Problem[]): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push({ subject: label, message: 'la lista no tiene el formato esperado; se ignora' });
    return [];
  }
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const p = schema.safeParse(r);
    if (!p.success) {
      problems.push({ subject: `${label} ${nameOf(r)}`, message: formatIssues(p.error).join('; ') });
      continue;
    }
    const id = (p.data as { id?: string }).id;
    if (id && seen.has(id)) {
      problems.push({ subject: `${label} ${nameOf(r)}`, message: 'aparece repetido en la copia; se usa el primero' });
      continue;
    }
    if (id) seen.add(id);
    out.push(p.data);
  }
  return out;
}

export async function readBackup(file: Blob): Promise<ReadResult> {
  if (file.size === 0) return fatal('El archivo está vacío.');
  if (file.size > LIMITS.fileBytes) return fatal('El archivo supera 1 GB: no parece una copia de Armario Digital.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return fatal('El archivo no es una copia válida: no es un ZIP. Elige el archivo .armario.zip que generó la app.');
  }

  // 1) Descompresión con límites (evita archivos manipulados o «bombas» ZIP).
  let files: Record<string, Uint8Array>;
  let unsafePath: string | undefined;
  let tooBig: string | undefined;
  let entries = 0;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        entries++;
        if (f.name.includes('..') || f.name.startsWith('/') || f.name.includes('\\')) {
          unsafePath = f.name;
          return false;
        }
        if (f.name.endsWith('/')) return false;
        const limit = f.name === 'manifest.json' ? LIMITS.manifestBytes : LIMITS.imageBytes;
        if (f.originalSize > limit) {
          tooBig = f.name;
          return false;
        }
        return entries <= LIMITS.entries;
      },
    });
  } catch {
    return fatal('El ZIP está dañado o incompleto (¿se cortó la descarga?). Vuelve a copiar el archivo original.');
  }
  if (unsafePath) return fatal(`La copia contiene una ruta no permitida (${unsafePath}). Puede estar manipulada.`);
  if (tooBig) return fatal(`El archivo ${tooBig} es demasiado grande para una copia de Armario Digital.`);
  if (entries > LIMITS.entries) return fatal('La copia contiene demasiados archivos.');

  // 2) Manifiesto
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) {
    const nested = Object.keys(files).find((n) => n.endsWith('/manifest.json'));
    return fatal(
      nested
        ? 'manifest.json no está en la raíz del ZIP: parece que se ha comprimido la carpeta en lugar de su contenido.'
        : 'El ZIP no contiene manifest.json: no es una copia de Armario Digital.',
    );
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
  } catch {
    return fatal('manifest.json está dañado (no es JSON válido).');
  }
  const head = HeaderSchema.safeParse(raw);
  if (!head.success || raw.format !== FORMAT) return fatal('El archivo no es una copia de Armario Digital (cabecera no reconocida).');
  const h = head.data;
  if (h.formatVersion > FORMAT_VERSION) {
    return fatal(`Esta copia usa el formato ${h.formatVersion} y esta versión de la app solo entiende hasta el ${FORMAT_VERSION}. Actualiza la app y vuelve a intentarlo.`);
  }
  if (h.schemaVersion > SCHEMA_VERSION) {
    return fatal(`Esta copia usa el esquema de datos ${h.schemaVersion} y esta versión de la app solo entiende hasta el ${SCHEMA_VERSION}. Actualiza la app y vuelve a intentarlo.`);
  }
  if (h.kind !== 'backup') {
    return fatal(`Este archivo es un ${h.kind === 'batch' ? 'lote' : h.kind === 'patch' ? 'resultado del kit' : `paquete «${h.kind}»`} de catalogación, no una copia de seguridad. Su importación aún no está disponible.`);
  }
  try {
    raw = upgradeManifest(raw);
  } catch (e) {
    return fatal(`No se puede convertir esta copia antigua: ${(e as Error).message}`);
  }

  const problems: Problem[] = [];
  const warnings: string[] = [];
  const count = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0);
  for (const k of ['items', 'images', 'outfits', 'wearLog', 'feedback']) {
    if (h.counts[k] !== undefined && h.counts[k] !== count(k)) {
      return fatal(`La copia está incompleta o manipulada: el resumen indica ${h.counts[k]} registros en «${k}» pero contiene ${count(k)}.`);
    }
  }
  if (h.generator.version) warnings.push(`Copia generada el ${new Date(h.createdAt).toLocaleString('es-ES')} con Armario Digital ${h.generator.version}.`);

  // 3) Fotos: metadatos, archivos presentes, formato real e integridad (SHA-256).
  const images = new Map<string, ImageFiles>();
  const referenced = new Set(['manifest.json']);
  let imageBytes = 0;
  for (const entry of validateList(raw.images, BackupImageSchema, 'Foto', problems)) {
    for (const p of [entry.path, entry.thumbPath, entry.originalPath]) if (p) referenced.add(p);
    const disp = files[entry.path];
    if (!disp) {
      problems.push({ subject: `Foto ${entry.id}`, message: `falta el archivo ${entry.path} en el ZIP` });
      continue;
    }
    const type = sniffImage(disp);
    if (!type) {
      problems.push({ subject: `Foto ${entry.id}`, message: 'el archivo no es una imagen válida' });
      continue;
    }
    if ((await sha256(disp)) !== entry.displaySha256) {
      problems.push({ subject: `Foto ${entry.id}`, message: 'la imagen está dañada (no coincide su huella de integridad)' });
      continue;
    }
    let thumb = { bytes: disp, type };
    const t = entry.thumbPath ? files[entry.thumbPath] : undefined;
    if (t && sniffImage(t) && (!entry.thumbSha256 || (await sha256(t)) === entry.thumbSha256)) thumb = { bytes: t, type: sniffImage(t)! };
    else warnings.push(`La miniatura de ${entry.id} falta o está dañada: se usará la foto completa.`);
    const o = entry.originalPath ? files[entry.originalPath] : undefined;
    const original = o && sniffImage(o) && (!entry.originalSha256 || (await sha256(o)) === entry.originalSha256) ? { bytes: o, type: sniffImage(o)! } : undefined;
    const { path: _p, displaySha256: _d, thumbPath: _t, thumbSha256: _ts, originalPath: _o, originalSha256: _os, ...meta } = entry;
    images.set(entry.id, { meta, display: { bytes: disp, type }, thumb, ...(original ? { original } : {}) });
    imageBytes += disp.length + thumb.bytes.length + (original?.bytes.length ?? 0);
  }

  // 4) Prendas: cada una se valida por separado; las fotos dañadas se quitan de la ficha.
  const items: Item[] = [];
  for (const it of validateList(raw.items, ItemSchema, 'Prenda', problems)) {
    const okIds = it.imageIds.filter((id) => images.get(id)?.meta.itemId === it.id);
    const lost = it.imageIds.length - okIds.length;
    if (lost) warnings.push(`«${it.name}» se importará sin ${lost} foto${lost > 1 ? 's' : ''} que falta${lost > 1 ? 'n' : ''} o está${lost > 1 ? 'n' : ''} dañada${lost > 1 ? 's' : ''}.`);
    items.push(lost ? { ...it, imageIds: okIds } : it);
  }
  const itemIds = new Set(items.map((i) => i.id));
  for (const [id, img] of images) {
    if (!itemIds.has(img.meta.itemId)) {
      images.delete(id);
      warnings.push(`La foto ${id} no pertenece a ninguna prenda válida de la copia: se ignora.`);
    }
  }

  const extra = Object.keys(files).filter((n) => !referenced.has(n) && !ALLOWED_EXTRA.has(n));
  if (extra.length) warnings.push(`${extra.length} archivo${extra.length > 1 ? 's' : ''} del ZIP no pertenece${extra.length > 1 ? 'n' : ''} a la copia y se ignora${extra.length > 1 ? 'n' : ''}.`);

  return {
    ok: true,
    problems,
    warnings,
    backup: {
      header: h,
      items,
      images,
      outfits: validateList(raw.outfits, OutfitSchema, 'Conjunto', problems),
      wearLog: validateList(raw.wearLog, WearEntrySchema, 'Registro de uso', problems),
      feedback: validateList(raw.feedback, FeedbackEventSchema, 'Valoración', problems),
      kits: validateList(raw.kits, KitSchema, 'Kit', problems),
      vocab: validateList(raw.vocab, VocabEntrySchema, 'Vocabulario', problems) as VocabRecord[],
      imageBytes,
    },
  };
}
