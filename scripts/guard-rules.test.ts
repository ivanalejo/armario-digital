import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sin tipos
import { checkFile } from './guard-rules.mjs';

describe('protección del repositorio', () => {
  it.each([
    ['IMG_20261011_183012.jpg'],
    ['src/assets/foto.webp'],
    ['private/fotos/camisa.heic'],
    ['armario-backup-2026-10-11.armario.zip'],
    ['kit_01jaj.zip'],
    ['docs/foto.PNG'],
  ])('bloquea %s', (path) => {
    expect(checkFile(path)).not.toBeNull();
  });

  it.each([['public/icons/icon-192.png'], ['src/main.tsx'], ['docs/DATA_MODEL.md']])('permite %s', (path) => {
    expect(checkFile(path)).toBeNull();
  });

  it('bloquea manifiestos fuera de tests/fixtures', () => {
    const content = '{"format": "armario-digital", "items": []}';
    expect(checkFile('lote.json', { content })).not.toBeNull();
    expect(checkFile('tests/fixtures/packages/v1.json', { content })).toBeNull();
  });

  it('bloquea archivos grandes', () => {
    expect(checkFile('src/data.ts', { size: 2 * 1024 * 1024 })).not.toBeNull();
  });
});
