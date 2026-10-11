// IDs de entidad (DATA_MODEL.md §2). Opacos, estables y nunca reutilizados.

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

/** ULID en minúsculas: 10 caracteres de tiempo + 16 aleatorios (ordenable por fecha). */
export function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let rand = '';
  for (const b of bytes) rand += CROCKFORD[b % 32];
  return time + rand;
}

export type IdPrefix = 'itm' | 'img' | 'out' | 'wear' | 'fb' | 'kit';
export const newId = (prefix: IdPrefix): string => `${prefix}_${ulid()}`;

export const ID_PATTERN = (prefix: IdPrefix): RegExp => new RegExp(`^${prefix}_[a-z0-9_]{6,48}$`);
