// Reglas que impiden que datos personales del armario lleguen a Git.
// Las usan el hook pre-commit, la CI y los tests.

export const MAX_FILE_BYTES = 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?|dng|raw)$/i;
const ARCHIVE_EXT = /\.(zip|7z|rar|tar|gz|tgz)$/i;
const ALLOWED_IMAGE_DIRS = ['public/icons/'];
const FIXTURE_DIR = 'tests/fixtures/';

/**
 * @param {string} path ruta relativa con separador '/'
 * @param {{ size?: number, content?: string }} info
 * @returns {string | null} motivo del rechazo o null si se permite
 */
export function checkFile(path, info = {}) {
  const p = path.replace(/\\/g, '/');
  if (p.startsWith('private/')) return 'la carpeta private/ es solo para datos locales';
  if (IMAGE_EXT.test(p) && !ALLOWED_IMAGE_DIRS.some((d) => p.startsWith(d))) {
    return 'imagen fuera de public/icons/ (¿una foto del armario?)';
  }
  if (ARCHIVE_EXT.test(p)) return 'archivo comprimido (¿una copia de seguridad o un kit?)';
  if (/\.armario\.(zip|json)$/i.test(p)) return 'paquete de Armario Digital';
  if (info.size !== undefined && info.size > MAX_FILE_BYTES) return `archivo de más de ${MAX_FILE_BYTES / 1024} KB`;
  if (
    info.content !== undefined &&
    /\.json$/i.test(p) &&
    !p.startsWith(FIXTURE_DIR) &&
    /"format"\s*:\s*"armario-digital"/.test(info.content)
  ) {
    return 'manifiesto o patch de Armario Digital fuera de tests/fixtures/';
  }
  return null;
}
