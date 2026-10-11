// Tiempos límite: ninguna operación de imagen o de base de datos puede dejar
// la interfaz esperando para siempre.

export interface Timeouts {
  /** Cada paso del procesado de una foto (leer, decodificar, codificar). */
  image: number;
  /** Una transacción de escritura en IndexedDB. */
  db: number;
  /** Tiempo tras el que una consulta se considera «lenta» y se ofrece diagnóstico. */
  slow: number;
}

const DEFAULTS: Timeouts = { image: 30_000, db: 20_000, slow: 8_000 };

/** Los tests e2e pueden acortarlos con `globalThis.__ARMARIO_TIMEOUTS__`. */
export function timeouts(): Timeouts {
  const override = (globalThis as { __ARMARIO_TIMEOUTS__?: Partial<Timeouts> }).__ARMARIO_TIMEOUTS__;
  return { ...DEFAULTS, ...override };
}

export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

/**
 * Rechaza si `promise` no termina en `ms`. No cancela la operación subyacente:
 * quien llama debe abortarla si puede (p. ej. una transacción).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
