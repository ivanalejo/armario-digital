import { db } from '../../db/db';
import { getSetting } from '../../db/settings';
import { useDbQuery } from '../../db/useDbQuery';
import type { LastExport } from '../../transfer/exportBackup';

export interface BackupStatus {
  last: LastExport | null;
  total: number;
  /** Prendas creadas o modificadas después de la última copia generada. */
  changed: number;
  daysSince: number | null;
}

export function useBackupStatus() {
  return useDbQuery<BackupStatus>(
    async () => {
      const [last, items] = await Promise.all([getSetting<LastExport | null>('lastExport', null), db.items.toArray()]);
      const changed = last ? items.filter((i) => i.updatedAt > last.at).length : items.length;
      const daysSince = last ? Math.floor((Date.now() - new Date(last.at).getTime()) / 86_400_000) : null;
      return { last, total: items.length, changed, daysSince };
    },
    [],
    'estado de copias',
  );
}

export function describeBackup(s: BackupStatus): { tone: 'ok' | 'warn'; text: string } {
  if (!s.last) {
    return s.total
      ? { tone: 'warn', text: 'Sin copia de seguridad: tus prendas solo están en este navegador.' }
      : { tone: 'ok', text: 'Aún no hay prendas que copiar.' };
  }
  const when = s.daysSince === 0 ? 'hoy' : s.daysSince === 1 ? 'ayer' : `hace ${s.daysSince} días`;
  const changes = s.changed ? ` · ${s.changed} prenda${s.changed > 1 ? 's' : ''} nueva${s.changed > 1 ? 's' : ''} o modificada${s.changed > 1 ? 's' : ''} desde entonces` : '';
  // «Generada», no «respaldada»: la app no puede saber si guardaste el archivo fuera del móvil.
  return { tone: s.changed || (s.daysSince ?? 0) > 14 ? 'warn' : 'ok', text: `Última copia generada ${when}${changes}.` };
}
