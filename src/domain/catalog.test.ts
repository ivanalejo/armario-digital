import { describe, expect, it } from 'vitest';
import { catalogStats, confirmPath, filterItems, isComplete, suggestName } from './catalog';
import type { Item } from './schema';

let n = 0;
function item(p: Partial<Item>): Item {
  n++;
  return {
    id: `itm_test${String(n).padStart(4, '0')}`,
    name: 'Prenda',
    categoryId: 'top',
    subcategoryId: 'tshirt',
    status: 'available',
    isDraft: false,
    favorite: false,
    createdAt: `2026-10-${String(10 + n).padStart(2, '0')}T10:00:00Z`,
    updatedAt: '2026-10-11T10:00:00Z',
    colors: { primary: 'white' },
    imageIds: [],
    ...p,
  };
}

const camisa = item({ name: 'Camisa Oxford', subcategoryId: 'shirt', colors: { primary: 'light-blue' }, brand: 'Uniqlo', formality: { min: 3, max: 4 }, styles: ['classic'], seasons: ['spring', 'autumn'] });
const vaqueros = item({ name: 'Vaqueros oscuros', categoryId: 'bottom', subcategoryId: 'jeans', colors: { primary: 'navy' }, formality: { min: 2, max: 3 } });
const sucia = item({ name: 'Polo verde', subcategoryId: 'polo', colors: { primary: 'green' }, status: 'laundry', favorite: true });
const baja = item({ name: 'Camiseta vieja', status: 'retired' });
const borrador = item({ name: 'Borrador', isDraft: true, subcategoryId: undefined, colors: undefined, estimated: ['name'] });
const all = [camisa, vaqueros, sucia, baja, borrador];

describe('filterItems', () => {
  it('oculta las prendas dadas de baja por defecto y ordena por alta más reciente', () => {
    const r = filterItems(all);
    expect(r.map((i) => i.id)).toEqual([borrador, sucia, vaqueros, camisa].map((i) => i.id));
  });
  it('busca por texto sin tildes ni mayúsculas, en nombre, marca y categoría', () => {
    expect(filterItems(all, { text: 'OXFORD' })).toEqual([camisa]);
    expect(filterItems(all, { text: 'uniqlo camisa' })).toEqual([camisa]);
    expect(filterItems(all, { text: 'parte inferior' })).toEqual([vaqueros]);
  });
  it('busca colores por alias', () => {
    expect(filterItems(all, { text: 'azul oscuro' })).toEqual([vaqueros]);
    expect(filterItems(all, { text: 'celeste' })).toEqual([camisa]);
  });
  it('filtra por categoría, color, estilo, temporada, estado, formalidad y favoritos', () => {
    expect(filterItems(all, { categoryId: 'bottom' })).toEqual([vaqueros]);
    expect(filterItems(all, { colorIds: ['green'] })).toEqual([sucia]);
    expect(filterItems(all, { styleIds: ['classic'] })).toEqual([camisa]);
    expect(filterItems(all, { seasonIds: ['autumn'] })).toEqual([camisa]);
    expect(filterItems(all, { statuses: ['laundry'] })).toEqual([sucia]);
    expect(filterItems(all, { formality: 4 })).toEqual([camisa]);
    expect(filterItems(all, { favorites: true })).toEqual([sucia]);
  });
  it('filtra borradores y pendientes de revisión', () => {
    expect(filterItems(all, { drafts: 'only' })).toEqual([borrador]);
    expect(filterItems(all, { drafts: 'exclude' })).not.toContain(borrador);
    expect(filterItems(all, { pendingReview: true })).toEqual([borrador]);
  });
});

describe('utilidades de ficha', () => {
  it('isComplete requiere subcategoría y color principal', () => {
    expect(isComplete(camisa)).toBe(true);
    expect(isComplete(borrador)).toBe(false);
  });
  it('confirmPath quita la marca de estimado (y las de sus subcampos)', () => {
    expect(confirmPath(['cut.fit', 'colors.primary'], 'cut.fit')).toEqual(['colors.primary']);
    expect(confirmPath(['colors.primary', 'colors.secondary'], 'colors')).toBeUndefined();
    expect(confirmPath(undefined, 'x')).toBeUndefined();
  });
  it('suggestName combina subcategoría y color', () => {
    expect(suggestName('shirt', 'light-blue')).toBe('Camisa azul claro');
    expect(suggestName()).toBe('Prenda');
  });
  it('catalogStats', () => {
    expect(catalogStats(all)).toEqual({ total: 4, available: 2, drafts: 1, pendingReview: 1, favorites: 1 });
  });
});
