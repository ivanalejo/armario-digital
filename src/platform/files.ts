// Entrega de archivos generados en el dispositivo. Nada sale a la red: se
// descarga a la carpeta de descargas o se pasa a otra app con «Compartir».

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Margen amplio: en Android la descarga puede tardar en arrancar.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Chrome Android solo comparte ciertos tipos de archivo; si no admite ZIP, no se ofrece. */
export function canShareFile(blob: Blob, fileName: string): boolean {
  try {
    const file = new File([blob], fileName, { type: blob.type });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareFile(blob: Blob, fileName: string, title: string): Promise<'shared' | 'cancelled'> {
  const file = new File([blob], fileName, { type: blob.type });
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled';
    throw err;
  }
}
