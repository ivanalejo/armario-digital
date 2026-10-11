// Esquemas Zod: fuente única de tipos y validación (DATA_MODEL.md, ADR-002).
import { z } from 'zod';
import { ID_PATTERN } from './ids';
import {
  CATEGORY_IDS,
  COLOR_IDS,
  ISSUE_TYPES,
  PATTERN_IDS,
  SEASON_IDS,
  STATUS_IDS,
  STYLE_IDS,
  SUBCATEGORY_IDS,
  SLOTS,
  cutAttrsFor,
  getSubcategory,
} from './vocabulary';

export const SCHEMA_VERSION = 1;

const idOf = (p: Parameters<typeof ID_PATTERN>[0]) =>
  z.string().regex(ID_PATTERN(p), `ID con formato inválido (se esperaba ${p}_…)`);
export const ItemIdSchema = idOf('itm');
export const ImageIdSchema = idOf('img');
const DateTime = z.iso.datetime({ offset: true });
const Level = z.number().int().min(1).max(5);
const unique = <T>(arr: T[]) => new Set(arr).size === arr.length;
const uniqueArray = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).refine(unique, 'Valores repetidos');

/** Campos que pueden marcarse como estimados (además de `cut.<atributo>`). */
export const ESTIMABLE_FIELDS = [
  'name', 'categoryId', 'subcategoryId', 'description', 'colors.primary', 'colors.secondary',
  'styles', 'formality', 'seasons', 'warmth', 'waterproof', 'pattern', 'material', 'brand',
] as const;

const ItemBase = z
  .object({
    id: ItemIdSchema,
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
    categoryId: z.enum(CATEGORY_IDS),
    subcategoryId: z.enum(SUBCATEGORY_IDS).optional(),
    status: z.enum(STATUS_IDS),
    isDraft: z.boolean(),
    favorite: z.boolean(),
    createdAt: DateTime,
    updatedAt: DateTime,
    colors: z
      .object({
        primary: z.enum(COLOR_IDS).optional(),
        secondary: uniqueArray(z.enum(COLOR_IDS)).max(4).optional(),
      })
      .strict()
      .optional(),
    description: z.string().max(280).optional(),
    styles: uniqueArray(z.enum(STYLE_IDS)).max(3).optional(),
    formality: z
      .object({ min: Level, max: Level })
      .strict()
      .refine((f) => f.min <= f.max, 'Formalidad: el mínimo no puede superar al máximo')
      .optional(),
    seasons: uniqueArray(z.enum(SEASON_IDS)).optional(),
    warmth: Level.optional(),
    waterproof: z.boolean().optional(),
    pattern: z.enum(PATTERN_IDS).optional(),
    material: z.string().trim().max(60).nullable().optional(),
    brand: z.string().trim().max(60).nullable().optional(),
    cut: z.record(z.string(), z.string().nullable()).optional(),
    comfort: Level.optional(),
    setId: z.string().max(40).optional(),
    tags: uniqueArray(z.string().trim().min(1).max(30)).max(20).optional(),
    notes: z.string().max(2000).optional(),
    acquiredAt: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/).optional(),
    imageIds: uniqueArray(ImageIdSchema).max(12),
    estimated: uniqueArray(z.string()).optional(),
    reviewNote: z.string().max(500).optional(),
    issues: z
      .array(
        z
          .object({ type: z.enum(ISSUE_TYPES), of: ItemIdSchema.optional(), note: z.string().max(300).optional() })
          .strict(),
      )
      .optional(),
    source: z
      .object({ kind: z.enum(['app', 'import']), batchId: z.string().max(64).optional() })
      .strict()
      .optional(),
  })
  .strict();

type ItemShape = z.infer<typeof ItemBase>;

function getPath(item: ItemShape, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), item);
}

/** Reglas que dependen de varios campos o del vocabulario. */
export function checkItemRules(item: ItemShape, addIssue: (path: (string | number)[], message: string) => void): void {
  const sub = item.subcategoryId ? getSubcategory(item.subcategoryId) : undefined;
  if (sub && sub.categoryId !== item.categoryId) {
    addIssue(['subcategoryId'], `La subcategoría "${sub.label}" no pertenece a la categoría elegida`);
  }
  if (!item.isDraft) {
    if (!item.subcategoryId) addIssue(['subcategoryId'], 'Falta la subcategoría (obligatoria salvo en borradores)');
    if (!item.colors?.primary) addIssue(['colors', 'primary'], 'Falta el color principal (obligatorio salvo en borradores)');
  }
  if (item.colors?.primary && item.colors.secondary?.includes(item.colors.primary)) {
    addIssue(['colors', 'secondary'], 'El color principal no puede repetirse como secundario');
  }
  const attrs = cutAttrsFor(item.categoryId, item.subcategoryId);
  for (const [key, value] of Object.entries(item.cut ?? {})) {
    const def = attrs.find((a) => a.key === key);
    if (!def) {
      const valid = attrs.map((a) => a.key).join(', ') || 'ninguno';
      addIssue(['cut', key], `El atributo de corte "${key}" no se aplica a este tipo de prenda (válidos: ${valid})`);
    } else if (value !== null && !def.values.some((v) => v.id === value)) {
      addIssue(['cut', key], `Valor "${value}" no válido para ${def.label} (válidos: ${def.values.map((v) => v.id).join(', ')})`);
    }
  }
  for (const path of item.estimated ?? []) {
    const isCut = path.startsWith('cut.');
    const known = isCut || (ESTIMABLE_FIELDS as readonly string[]).includes(path);
    if (!known) addIssue(['estimated'], `"${path}" no es un campo que pueda marcarse como estimado`);
    else if (getPath(item, path) === undefined) addIssue(['estimated'], `"${path}" está marcado como estimado pero no tiene valor`);
  }
}

export const ItemSchema = ItemBase.superRefine((item, ctx) =>
  checkItemRules(item, (path, message) => ctx.addIssue({ code: 'custom', path, message })),
);
export type Item = z.infer<typeof ItemSchema>;

export const ImageSourceSchema = z
  .object({
    name: z.string().max(255).optional(),
    bytes: z.number().int().nonnegative().optional(),
    lastModified: z.number().int().nonnegative().optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict();

export const ImageMetaSchema = z
  .object({
    id: ImageIdSchema,
    itemId: ItemIdSchema,
    mime: z.enum(['image/webp', 'image/jpeg']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: DateTime,
    source: ImageSourceSchema.optional(),
  })
  .strict();
export type ImageMeta = z.infer<typeof ImageMetaSchema>;

export const BLOB_VARIANTS = ['display', 'thumb', 'original'] as const;
export type BlobVariant = (typeof BLOB_VARIANTS)[number];
export interface BlobRecord {
  imageId: string;
  variant: BlobVariant;
  blob: Blob;
}

// --- Entidades de fases posteriores (definidas ya para que DB y copias las soporten) ---

const SlotsSchema = z
  .object({
    base: ItemIdSchema.optional(),
    mid: ItemIdSchema.optional(),
    outer: ItemIdSchema.optional(),
    bottom: ItemIdSchema.optional(),
    footwear: ItemIdSchema.optional(),
    accessories: z.array(ItemIdSchema).max(5).optional(),
  })
  .strict();

export const OutfitSchema = z
  .object({
    id: idOf('out'),
    name: z.string().max(80).optional(),
    slots: SlotsSchema,
    occasionId: z.string().max(40).optional(),
    origin: z.enum(['generated', 'manual']),
    scoreSnapshot: z
      .object({ total: z.number(), breakdown: z.record(z.string(), z.number()), weightsVersion: z.number().int() })
      .optional(),
    favorite: z.boolean(),
    createdAt: DateTime,
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type Outfit = z.infer<typeof OutfitSchema>;

export const WearEntrySchema = z
  .object({
    id: idOf('wear'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    itemIds: z.array(ItemIdSchema).min(1),
    outfitId: idOf('out').optional(),
    occasionId: z.string().max(40).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();
export type WearEntry = z.infer<typeof WearEntrySchema>;

export const FeedbackEventSchema = z
  .object({
    id: idOf('fb'),
    at: DateTime,
    target: z.enum(['outfit', 'item', 'pair']),
    kind: z.enum(['rating', 'like', 'dislike', 'favorite', 'unfavorite', 'dismiss', 'worn', 'swap']),
    value: z.number().min(1).max(5).optional(),
    itemIds: z.array(ItemIdSchema).min(1),
    outfit: z.object({ slots: SlotsSchema, key: z.string().max(400) }).strict().optional(),
    slot: z.enum([...SLOTS, 'accessories']).optional(),
    replacedItemId: ItemIdSchema.optional(),
    reason: z.enum(['not-today', 'style', 'colors', 'fit', 'formality', 'weather', 'other']).optional(),
    context: z
      .object({ occasionId: z.string().optional(), weather: z.enum(['hot', 'mild', 'cold']).optional(), rain: z.boolean().optional() })
      .strict()
      .optional(),
    source: z.enum(['recommender', 'manual']),
  })
  .strict();
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

export const KitSchema = z
  .object({
    id: idOf('kit'),
    createdAt: DateTime,
    itemIds: z.array(ItemIdSchema).min(1),
    checks: z.record(z.string(), z.string().regex(/^[A-Z0-9]{4}$/)),
    parts: z.number().int().min(1),
    status: z.enum(['exported', 'applied', 'partial', 'cancelled']),
    appliedAt: DateTime.optional(),
  })
  .strict();
export type Kit = z.infer<typeof KitSchema>;

/** Convierte errores de Zod en mensajes legibles: "colors.primary: …". */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}
