import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImageMetaSchema, ItemSchema, formatIssues } from './schema';
import { resolveColor, cutAttrsFor } from './vocabulary';

// Los ejemplos JSON de la documentación deben validar contra el código:
// así documento y esquema no pueden divergir sin que falle un test.
const doc = readFileSync(new URL('../../docs/IMPORT_EXPORT.md', import.meta.url), 'utf8');
const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!));
const backup = blocks.find((b) => b.kind === 'backup');

const base = {
  id: 'itm_01jae4k8d2x7q9m3v5t1b6c0wz',
  name: 'Camiseta blanca',
  categoryId: 'top',
  subcategoryId: 'tshirt',
  status: 'available',
  isDraft: false,
  favorite: false,
  createdAt: '2026-10-11T10:00:00Z',
  updatedAt: '2026-10-11T10:00:00Z',
  colors: { primary: 'white', secondary: [] },
  imageIds: [],
};

const errors = (data: unknown) => {
  const r = ItemSchema.safeParse(data);
  return r.success ? [] : formatIssues(r.error);
};

describe('ejemplos de la documentación', () => {
  it('el backup de ejemplo contiene 3 prendas válidas', () => {
    expect(backup.items).toHaveLength(3);
    for (const item of backup.items) expect(errors(item)).toEqual([]);
  });
  it('las imágenes del ejemplo tienen metadatos válidos salvo el hash abreviado', () => {
    for (const { path: _p, thumbPath: _t, displaySha256: _d, thumbSha256: _ts, ...img } of backup.images) {
      const r = ImageMetaSchema.safeParse({ ...img, sha256: 'a'.repeat(64) });
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    }
  });
  it('cada imageId de las prendas existe en images', () => {
    const ids = new Set(backup.images.map((i: { id: string }) => i.id));
    for (const it of backup.items) for (const id of it.imageIds) expect(ids.has(id)).toBe(true);
  });
});

describe('ItemSchema', () => {
  it('acepta una prenda mínima', () => expect(errors(base)).toEqual([]));

  it('distingue desconocido (ausente) de inexistente (null)', () => {
    const r = ItemSchema.parse({ ...base, brand: null });
    expect(r.brand).toBeNull();
    expect('material' in r).toBe(false);
  });

  it('exige subcategoría y color principal salvo en borradores', () => {
    const { subcategoryId: _s, colors: _c, ...rest } = base;
    expect(errors(rest).join()).toMatch(/subcategoría/);
    expect(errors({ ...rest, isDraft: true })).toEqual([]);
  });

  it('rechaza una subcategoría de otra categoría', () => {
    expect(errors({ ...base, subcategoryId: 'jeans' }).join()).toMatch(/no pertenece/);
  });

  it('rechaza campos desconocidos (p. ej. el antiguo "fit" en la raíz)', () => {
    expect(errors({ ...base, fit: 'slim' }).length).toBeGreaterThan(0);
  });

  it('valida atributos de corte según el tipo de prenda', () => {
    expect(errors({ ...base, cut: { fit: 'oversized', sleeve: 'short', neckline: null } })).toEqual([]);
    expect(errors({ ...base, cut: { leg: 'slim' } }).join()).toMatch(/no se aplica/);
    expect(errors({ ...base, cut: { fit: 'enorme' } }).join()).toMatch(/no válido/);
  });

  it('usa los valores de `length` propios de cada categoría', () => {
    const jeans = { ...base, categoryId: 'bottom', subcategoryId: 'jeans', cut: { length: 'ankle', leg: 'tapered' } };
    expect(errors(jeans)).toEqual([]);
    expect(errors({ ...base, cut: { length: 'ankle' } }).join()).toMatch(/no válido/);
  });

  it('inseam solo para pantalones cortos y leg no para ellos', () => {
    const shorts = { ...base, categoryId: 'bottom', subcategoryId: 'shorts' };
    expect(errors({ ...shorts, cut: { inseam: 'mid' } })).toEqual([]);
    expect(errors({ ...shorts, cut: { leg: 'slim' } }).join()).toMatch(/no se aplica/);
  });

  it('valida las marcas de estimado', () => {
    expect(errors({ ...base, cut: { fit: 'slim' }, estimated: ['cut.fit', 'colors.primary'] })).toEqual([]);
    expect(errors({ ...base, estimated: ['pattern'] }).join()).toMatch(/no tiene valor/);
    expect(errors({ ...base, estimated: ['inventado'] }).join()).toMatch(/no es un campo/);
  });

  it('rechaza formalidad invertida y colores repetidos', () => {
    expect(errors({ ...base, formality: { min: 4, max: 2 } }).length).toBe(1);
    expect(errors({ ...base, colors: { primary: 'white', secondary: ['white'] } }).join()).toMatch(/principal/);
  });
});

describe('vocabulario', () => {
  it('resuelve alias de color al ID canónico', () => {
    expect(resolveColor('Azul oscuro')).toBe('navy');
    expect(resolveColor('NAVY')).toBe('navy');
    expect(resolveColor('azul marino')).toBe('navy');
    expect(resolveColor('Caqui')).toBe('olive');
    expect(resolveColor('azulito')).toBeUndefined();
  });

  it('cada tipo de prenda tiene claves de corte únicas', () => {
    for (const cat of ['top', 'bottom', 'outerwear', 'footwear', 'accessory'] as const) {
      for (const sub of [undefined, 'jeans', 'shorts', 'boots', 'chinos', 'tshirt', 'coat']) {
        const keys = cutAttrsFor(cat, sub).map((a) => a.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});
