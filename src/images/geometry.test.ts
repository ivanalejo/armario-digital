import { describe, expect, it } from 'vitest';
import { clampCrop, fitWithin, normalizeRotation, rotatedSize } from './geometry';

describe('geometría de imagen', () => {
  it('reduce al lado mayor sin ampliar nunca', () => {
    expect(fitWithin(4000, 3000, 1600)).toMatchObject({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 400)).toMatchObject({ width: 300, height: 400 });
    expect(fitWithin(800, 600, 1600)).toMatchObject({ width: 800, height: 600, scale: 1 });
  });
  it('normaliza rotaciones y calcula el tamaño rotado', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(rotatedSize(4000, 3000, 90)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(4000, 3000, 180)).toEqual({ width: 4000, height: 3000 });
  });
  it('ajusta el recorte a los límites', () => {
    expect(clampCrop(undefined, 100, 50)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(clampCrop({ x: -5, y: 10, width: 200, height: 100 }, 100, 50)).toEqual({ x: 0, y: 10, width: 100, height: 40 });
  });
});
