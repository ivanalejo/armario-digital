// Registro local de errores (últimos 30) para el diagnóstico.
// Va en localStorage y no en IndexedDB a propósito: tiene que funcionar
// precisamente cuando la base de datos no responde. Nunca sale del dispositivo.

export interface ErrorEntry {
  at: string;
  context: string;
  name: string;
  message: string;
  stack?: string;
}

const KEY = 'armario-digital:errors';
const MAX = 30;
const listeners = new Set<(e: ErrorEntry) => void>();

export function readErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorEntry[];
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento local: nada que borrar */
  }
}

export function logError(context: string, err: unknown): ErrorEntry {
  const e = err instanceof Error ? err : new Error(String(err));
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    context,
    name: e.name,
    message: e.message.slice(0, 500),
    stack: e.stack?.split('\n').slice(0, 6).join('\n'),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...readErrors()].slice(0, MAX)));
  } catch {
    /* localStorage lleno o bloqueado: el error se sigue mostrando en pantalla */
  }
  console.error(`[armario] ${context}:`, err);
  listeners.forEach((l) => l(entry));
  return entry;
}

export function onError(listener: (e: ErrorEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Captura errores asíncronos no gestionados para que no pasen inadvertidos. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => logError('error no capturado', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError('promesa rechazada sin gestionar', ev.reason));
}
