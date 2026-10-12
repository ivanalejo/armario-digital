import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docBackupExample, parseJsonBlocks } from './docExamples';

describe('lectura de ejemplos de la documentación', () => {
  const md = '# T\n\n```json\n{ "kind": "backup", "items": [], "images": [] }\n```\n\ntexto\n\n```json\n{ "a": 1 }\n```\n';

  it('encuentra los mismos bloques con LF, CRLF (Windows, core.autocrlf) y CR', () => {
    const lf = parseJsonBlocks(md);
    expect(lf).toEqual([{ kind: 'backup', items: [], images: [] }, { a: 1 }]);
    expect(parseJsonBlocks(md.replace(/\n/g, '\r\n'))).toEqual(lf);
    expect(parseJsonBlocks(md.replace(/\n/g, '\r'))).toEqual(lf);
  });

  it('el ejemplo real de IMPORT_EXPORT.md se encuentra también si el archivo tiene CRLF', () => {
    const real = readFileSync(new URL('../../docs/IMPORT_EXPORT.md', import.meta.url), 'utf8');
    const lf = parseJsonBlocks(real.replace(/\r\n/g, '\n'));
    expect(parseJsonBlocks(real.replace(/\r?\n/g, '\r\n'))).toEqual(lf);
    expect(lf.some((b) => b.kind === 'backup')).toBe(true);
    expect(docBackupExample().items.length).toBeGreaterThan(0);
  });

  it('falla con un mensaje claro si no hay bloques o uno no es JSON', () => {
    expect(() => parseJsonBlocks('sin bloques', 'doc')).toThrow(/doc: no se ha encontrado ningún bloque/);
    expect(() => parseJsonBlocks('```json\n{ roto\n```\n', 'doc')).toThrow(/doc: el bloque json n.º 1 no es JSON válido/);
  });
});
