import { useState } from 'react';
import { Link } from 'wouter';
import { canShareFile, downloadBlob, shareFile } from '../../platform/files';
import { logError } from '../../platform/errorLog';
import { formatBytes } from '../../platform/storage';
import { exportBackup, type ExportResult } from '../../transfer/exportBackup';
import { Icon } from '../../ui/Icon';
import { plural } from '../../ui/plural';
import { describeBackup, useBackupStatus } from './useBackupStatus';

/** Exporta la copia y la ofrece para guardar. Reutilizable en Ajustes y en la restauración. */
export function ExportButton({ label = 'Crear copia de seguridad', ghost = false }: { label?: string; ghost?: boolean }) {
  const [busy, setBusy] = useState<string>();
  const [result, setResult] = useState<ExportResult>();
  const [error, setError] = useState<string>();

  async function run() {
    setError(undefined);
    setResult(undefined);
    setBusy('Preparando…');
    try {
      const r = await exportBackup(undefined, {
        appVersion: __APP_VERSION__,
        onProgress: (d, t) => setBusy(t ? `Copiando fotos ${d} de ${t}…` : 'Preparando…'),
      });
      setResult(r);
      downloadBlob(r.blob, r.fileName); // se guarda directamente en Descargas
    } catch (err) {
      logError('exportar copia', err);
      setError(`No se ha podido crear la copia: ${(err as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="backup-export">
      <button type="button" className={`btn ${ghost ? 'btn--ghost' : ''}`} onClick={() => void run()} disabled={!!busy} data-testid="export-backup">
        <Icon name="shield" size={18} /> {busy ?? label}
      </button>
      {result && (
        <div className="notice notice--ok" role="status" data-testid="export-result">
          <div>
            <strong>Copia generada: {result.fileName}</strong>
            <br />
            {plural(result.counts.items, 'prenda')} · {plural(result.counts.images, 'foto')} · {plural(result.counts.outfits, 'conjunto')} · {formatBytes(result.bytes)}
            <br />
            Se ha descargado en la carpeta <em>Descargas</em>. Guárdala fuera del móvil (Drive, ordenador…): si solo está en el móvil, no te protege si lo pierdes.
            {result.warnings.map((w) => <span key={w} className="hint"><br />{w}</span>)}
          </div>
          <div className="row">
            <button type="button" className="btn btn--small btn--ghost" onClick={() => downloadBlob(result.blob, result.fileName)}>Descargar de nuevo</button>
            {canShareFile(result.blob, result.fileName) && (
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => void shareFile(result.blob, result.fileName, 'Copia de Armario Digital').catch((e: unknown) => setError((e as Error).message))}
              >
                Compartir…
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </div>
  );
}

export function BackupPanel() {
  const st = useBackupStatus();
  const d = st.data ? describeBackup(st.data) : undefined;
  return (
    <section className="panel" aria-labelledby="backup-title">
      <h2 id="backup-title" className="h2"><Icon name="shield" size={18} /> Copias de seguridad</h2>
      {d && <p className={`notice ${d.tone === 'warn' ? 'notice--warn' : ''}`} data-testid="backup-status">{d.text}</p>}
      <ExportButton />
      <p className="hint">
        La copia es un archivo <code>.armario.zip</code> con todas tus prendas, fotos, conjuntos e historial. Se crea en el móvil y no se envía a ningún sitio.
      </p>
      <Link href="/copias/restaurar" className="btn btn--ghost" data-testid="open-restore">
        <Icon name="swap" size={18} /> Restaurar o importar una copia
      </Link>
    </section>
  );
}

/** Aviso compacto para Inicio. */
export function BackupReminder() {
  const st = useBackupStatus();
  if (!st.data) return null;
  if (!st.data.total && !st.data.last) return null; // armario vacío: no hay nada que copiar
  const d = describeBackup(st.data);
  if (d.tone === 'ok' && st.data.last) return <p className="backup-line"><Icon name="shield" size={16} /> {d.text}</p>;
  return (
    <Link href="/ajustes" className="backup-line backup-line--warn" data-testid="backup-reminder">
      <Icon name="shield" size={16} /> {d.text} Crear copia →
    </Link>
  );
}
