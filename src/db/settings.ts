import { type ArmarioDB, db as defaultDb } from './db';

export async function getSetting<T>(key: string, fallback: T, database: ArmarioDB = defaultDb): Promise<T> {
  const rec = await database.settings.get(key);
  return rec === undefined ? fallback : (rec.value as T);
}

export async function setSetting(key: string, value: unknown, database: ArmarioDB = defaultDb): Promise<void> {
  await database.settings.put({ key, value });
}
