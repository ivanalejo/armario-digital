// Estado real del almacenamiento del navegador. Nunca se asume nada:
// se muestra lo que el navegador responde.

export interface StorageStatus {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const s = navigator.storage;
  if (!s) return { supported: false, persisted: null, usage: null, quota: null };
  const [persisted, est] = await Promise.all([
    s.persisted ? s.persisted().catch(() => null) : Promise.resolve(null),
    s.estimate ? s.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return { supported: true, persisted, usage: est?.usage ?? null, quota: est?.quota ?? null };
}

/** Pide almacenamiento persistente. Devuelve lo que conceda el navegador (puede ser false). */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
