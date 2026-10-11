// Estado del formulario de prenda (lógica pura, sin React).
import { confirmPath, isComplete, suggestName } from '../../domain/catalog';
import type { Item } from '../../domain/schema';
import { type CategoryId, cutAttrsFor } from '../../domain/vocabulary';
import type { ItemInput } from '../../db/items';

export interface FormState {
  input: ItemInput;
  /** El usuario ha escrito el nombre: deja de proponerse automáticamente. */
  nameTouched: boolean;
}

export function newForm(categoryId: CategoryId = 'top'): FormState {
  return {
    input: { name: '', categoryId, status: 'available', isDraft: true, favorite: false },
    nameTouched: false,
  };
}

export function formFromItem(item: Item): FormState {
  const { createdAt: _c, updatedAt: _u, imageIds: _i, ...input } = item;
  return { input, nameTouched: true };
}

function withSuggestedName(f: FormState): FormState {
  if (f.nameTouched) return f;
  return { ...f, input: { ...f.input, name: suggestName(f.input.subcategoryId, f.input.colors?.primary) } };
}

/** Quita atributos de corte que ya no corresponden al tipo de prenda. */
function pruneCut(input: ItemInput): ItemInput {
  if (!input.cut) return input;
  const valid = new Set(cutAttrsFor(input.categoryId, input.subcategoryId).map((a) => a.key));
  const cut = Object.fromEntries(Object.entries(input.cut).filter(([k]) => valid.has(k)));
  const estimated = input.estimated?.filter((p) => !p.startsWith('cut.') || valid.has(p.slice(4)));
  return { ...input, cut, estimated: estimated?.length ? estimated : undefined };
}

/**
 * Asigna un valor por ruta ("brand", "colors.primary", "cut.leg").
 * `undefined` = desconocido (se elimina). Tocar un campo lo confirma.
 */
export function setField(f: FormState, path: string, value: unknown): FormState {
  const [head, key] = path.split('.') as [keyof ItemInput & string, string | undefined];
  let input: ItemInput = { ...f.input };
  if (key) {
    const obj = { ...((input[head] as Record<string, unknown> | undefined) ?? {}) };
    if (value === undefined) delete obj[key];
    else obj[key] = value;
    (input as Record<string, unknown>)[head] = Object.keys(obj).length ? obj : undefined;
  } else {
    (input as Record<string, unknown>)[head] = value;
  }
  input.estimated = confirmPath(input.estimated, path);
  if (head === 'categoryId') {
    input = pruneCut({ ...input, subcategoryId: undefined });
    input.estimated = confirmPath(input.estimated, 'subcategoryId');
  }
  if (head === 'subcategoryId') input = pruneCut(input);
  const next = { ...f, input, nameTouched: f.nameTouched || head === 'name' };
  return head === 'name' ? next : withSuggestedName(next);
}

export function confirmAll(f: FormState): FormState {
  return { ...f, input: { ...f.input, estimated: undefined } };
}

/** Selección de formalidad por toques: un toque fija un nivel, otro amplía el rango. */
export function toggleFormality(cur: ItemInput['formality'], level: number): ItemInput['formality'] {
  if (!cur) return { min: level, max: level };
  if (cur.min === level && cur.max === level) return undefined;
  if (level < cur.min) return { min: level, max: cur.max };
  if (level > cur.max) return { min: cur.min, max: level };
  return { min: level, max: level };
}

export function toggleInList<T>(list: readonly T[] | undefined, value: T, max = Infinity): T[] | undefined {
  const cur = list ?? [];
  if (cur.includes(value)) {
    const next = cur.filter((v) => v !== value);
    return next.length ? next : undefined;
  }
  return cur.length >= max ? cur.slice() : [...cur, value];
}

/** Ajustes finales antes de guardar: nombre por defecto y estado de borrador. */
export function finalize(f: FormState): ItemInput {
  const input = { ...f.input };
  if (!input.name.trim()) input.name = suggestName(input.subcategoryId, input.colors?.primary);
  input.isDraft = !isComplete(input);
  return input;
}

export function missingForCompletion(input: ItemInput): string[] {
  const out: string[] = [];
  if (!input.subcategoryId) out.push('tipo de prenda');
  if (!input.colors?.primary) out.push('color principal');
  return out;
}
