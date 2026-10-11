import { describe, expect, it } from 'vitest';
import { confirmAll, finalize, newForm, setField, toggleFormality, toggleInList } from './formState';

describe('formulario de prenda', () => {
  it('propone el nombre hasta que el usuario lo escribe', () => {
    let f = newForm('top');
    f = setField(f, 'subcategoryId', 'shirt');
    f = setField(f, 'colors.primary', 'navy');
    expect(f.input.name).toBe('Camisa azul marino');
    f = setField(f, 'name', 'Mi camisa');
    f = setField(f, 'colors.primary', 'white');
    expect(f.input.name).toBe('Mi camisa');
  });

  it('cambiar de categoría limpia la subcategoría y los cortes que no aplican', () => {
    let f = newForm('bottom');
    f = setField(f, 'subcategoryId', 'jeans');
    f = setField(f, 'cut.leg', 'tapered');
    f = setField(f, 'cut.rise', 'mid');
    f = { ...f, input: { ...f.input, estimated: ['cut.leg', 'cut.rise'] } };
    f = setField(f, 'subcategoryId', 'shorts');
    expect(f.input.cut).toEqual({ rise: 'mid' });
    expect(f.input.estimated).toEqual(['cut.rise']);
    f = setField(f, 'categoryId', 'top');
    expect(f.input.subcategoryId).toBeUndefined();
    expect(f.input.cut).toEqual({});
  });

  it('editar un campo estimado lo confirma; confirmAll los confirma todos', () => {
    let f = newForm('top');
    f = { ...f, input: { ...f.input, colors: { primary: 'grey' }, pattern: 'solid', estimated: ['colors.primary', 'pattern'] } };
    f = setField(f, 'colors.primary', 'charcoal');
    expect(f.input.estimated).toEqual(['pattern']);
    expect(confirmAll(f).input.estimated).toBeUndefined();
  });

  it('undefined elimina el dato (desconocido) y null lo marca como inexistente', () => {
    let f = newForm('top');
    f = setField(f, 'brand', null);
    expect(f.input.brand).toBeNull();
    f = setField(f, 'brand', undefined);
    expect(f.input.brand).toBeUndefined();
    f = setField(f, 'cut.neckline', null);
    expect(f.input.cut).toEqual({ neckline: null });
  });

  it('finalize marca como borrador si falta lo obligatorio', () => {
    let f = newForm('top');
    expect(finalize(f)).toMatchObject({ isDraft: true, name: 'Prenda' });
    f = setField(f, 'subcategoryId', 'polo');
    f = setField(f, 'colors.primary', 'navy');
    expect(finalize(f).isDraft).toBe(false);
  });

  it('formalidad por toques y listas con máximo', () => {
    expect(toggleFormality(undefined, 3)).toEqual({ min: 3, max: 3 });
    expect(toggleFormality({ min: 3, max: 3 }, 4)).toEqual({ min: 3, max: 4 });
    expect(toggleFormality({ min: 3, max: 4 }, 2)).toEqual({ min: 2, max: 4 });
    expect(toggleFormality({ min: 3, max: 3 }, 3)).toBeUndefined();
    expect(toggleInList(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
    expect(toggleInList(['a'], 'a')).toBeUndefined();
  });
});
