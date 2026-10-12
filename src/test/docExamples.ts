// Lee los ejemplos JSON de la documentación para validarlos contra el código.
// En Windows, Git suele extraer los archivos con fin de línea CRLF
// (core.autocrlf=true). Se normaliza a LF antes de buscar los bloques: si no,
// ningún bloque coincide y los tests fallan con «undefined» en vez de validar.
import { readFileSync } from 'node:fs';

export type DocJson = Record<string, unknown>;
export interface DocBackupExample extends DocJson {
  kind: 'backup';
  items: (DocJson & { imageIds: string[] })[];
  images: (DocJson & { id: string })[];
}

/** Bloques ```json de un texto Markdown con fin de línea LF, CRLF o CR, ya parseados. */
export function parseJsonBlocks(markdown: string, label = 'documento'): DocJson[] {
  const text = markdown.replace(/\r\n?/g, '\n');
  const blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m, i) => {
    try {
      return JSON.parse(m[1]!) as DocJson;
    } catch (err) {
      throw new Error(`${label}: el bloque json n.º ${i + 1} no es JSON válido (${(err as Error).message})`, { cause: err });
    }
  });
  if (!blocks.length) throw new Error(`${label}: no se ha encontrado ningún bloque \`\`\`json`);
  return blocks;
}

/** Todos los bloques ```json de `docs/<name>`. */
export function docJsonBlocks(name: string): DocJson[] {
  return parseJsonBlocks(readFileSync(new URL(`../../docs/${name}`, import.meta.url), 'utf8'), `docs/${name}`);
}

/** El manifiesto de copia de ejemplo de IMPORT_EXPORT.md (`kind: "backup"`). */
export function docBackupExample(): DocBackupExample {
  const backup = docJsonBlocks('IMPORT_EXPORT.md').find((b) => b.kind === 'backup');
  if (!backup) throw new Error('docs/IMPORT_EXPORT.md: falta el ejemplo con "kind": "backup"');
  if (!Array.isArray(backup.items) || !Array.isArray(backup.images)) {
    throw new Error('docs/IMPORT_EXPORT.md: el ejemplo de copia no tiene las listas "items" e "images"');
  }
  return backup as DocBackupExample;
}
