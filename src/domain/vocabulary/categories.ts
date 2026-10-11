// Categorías y subcategorías (DATA_MODEL.md §4.1).
// `slots`: posiciones del outfit en las que puede ir la subcategoría.

export const SLOTS = ['base', 'mid', 'outer', 'bottom', 'footwear', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

export const CATEGORIES = [
  { id: 'top', label: 'Parte superior' },
  { id: 'bottom', label: 'Parte inferior' },
  { id: 'outerwear', label: 'Prenda exterior' },
  { id: 'footwear', label: 'Calzado' },
  { id: 'accessory', label: 'Accesorio' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export interface SubcategoryDef {
  id: string;
  label: string;
  categoryId: CategoryId;
  slots: readonly Slot[];
}

export const SUBCATEGORIES = [
  { id: 'tshirt', label: 'Camiseta', categoryId: 'top', slots: ['base'] },
  { id: 'polo', label: 'Polo', categoryId: 'top', slots: ['base'] },
  { id: 'shirt', label: 'Camisa', categoryId: 'top', slots: ['base'] },
  { id: 'overshirt', label: 'Sobrecamisa', categoryId: 'top', slots: ['mid', 'outer'] },
  { id: 'sweatshirt', label: 'Sudadera', categoryId: 'top', slots: ['base', 'mid'] },
  { id: 'hoodie', label: 'Sudadera con capucha', categoryId: 'top', slots: ['base', 'mid'] },
  { id: 'sweater', label: 'Jersey', categoryId: 'top', slots: ['base', 'mid'] },
  { id: 'cardigan', label: 'Cárdigan', categoryId: 'top', slots: ['mid'] },
  { id: 'sport-top', label: 'Camiseta técnica', categoryId: 'top', slots: ['base'] },
  { id: 'jeans', label: 'Vaqueros', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'chinos', label: 'Chinos', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'trousers', label: 'Pantalón de vestir', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'joggers', label: 'Chándal / jogger', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'shorts', label: 'Pantalón corto', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'sport-shorts', label: 'Corto deportivo', categoryId: 'bottom', slots: ['bottom'] },
  { id: 'blazer', label: 'Americana', categoryId: 'outerwear', slots: ['mid'] },
  { id: 'jacket', label: 'Chaqueta / cazadora', categoryId: 'outerwear', slots: ['outer'] },
  { id: 'coat', label: 'Abrigo', categoryId: 'outerwear', slots: ['outer'] },
  { id: 'parka', label: 'Parka', categoryId: 'outerwear', slots: ['outer'] },
  { id: 'puffer', label: 'Plumífero', categoryId: 'outerwear', slots: ['outer'] },
  { id: 'raincoat', label: 'Impermeable', categoryId: 'outerwear', slots: ['outer'] },
  { id: 'gilet', label: 'Chaleco', categoryId: 'outerwear', slots: ['mid'] },
  { id: 'sneakers', label: 'Zapatillas', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'sport-shoes', label: 'Zapatillas deportivas', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'shoes', label: 'Zapatos', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'loafers', label: 'Mocasines', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'boots', label: 'Botas', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'sandals', label: 'Sandalias / chanclas', categoryId: 'footwear', slots: ['footwear'] },
  { id: 'belt', label: 'Cinturón', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'watch', label: 'Reloj', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'cap', label: 'Gorra / sombrero', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'scarf', label: 'Bufanda', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'bag', label: 'Bolso / mochila', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'sunglasses', label: 'Gafas de sol', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'tie', label: 'Corbata', categoryId: 'accessory', slots: ['accessory'] },
  { id: 'other-accessory', label: 'Otro complemento', categoryId: 'accessory', slots: ['accessory'] },
] as const satisfies readonly SubcategoryDef[];

export type SubcategoryId = (typeof SUBCATEGORIES)[number]['id'];
export const SUBCATEGORY_IDS = SUBCATEGORIES.map((s) => s.id) as [SubcategoryId, ...SubcategoryId[]];

const subById = new Map<string, SubcategoryDef>(SUBCATEGORIES.map((s) => [s.id, s]));
export const getSubcategory = (id: string): SubcategoryDef | undefined => subById.get(id);
export const subcategoriesOf = (categoryId: CategoryId): SubcategoryDef[] =>
  SUBCATEGORIES.filter((s) => s.categoryId === categoryId);
export const categoryLabel = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const subcategoryLabel = (id: string): string => subById.get(id)?.label ?? id;
