// Diagnóstico de solo lectura. Funciona aunque la base de datos no responda:
// cada comprobación tiene su propio tiempo límite. No modifica ni borra datos
// del inventario. El informe no incluye nombres ni fotos: solo IDs y recuentos.
import { useCallback, useEffect, useState } from 'react';
import { db, DB_NAME } from '../../db/db';
import { checkConsistency, type ConsistencyReport } from '../../db/health';
import { SCHEMA_VERSION } from '../../domain/schema';
import { clearErrors, readErrors, type ErrorEntry } from '../../platform/errorLog';
import { getStorageStatus, type StorageStatus } from '../../platform/storage';
import { withTimeout } from '../../platform/timeouts';
import { PageHeader } from '../../ui/PageHeader';

type Check<T> = { state: 'running' } | { state: 'ok'; value: T } | { state: 'fail'; error: string };

const run = async <T,>(p: () => Promise<T>, ms = 6000): Promise<Check<T>> => {
  try {
    return { state: 'ok', value: await withTimeout(p(), ms, `sin respuesta en ${ms / 1000} s`) };
  } catch (err) {
    return { state: 'fail', error: (err as Error).message };
  }
};

/** Abre la base de datos con la API nativa (sin Dexie) para distinguir si el fallo es de IndexedDB o de la app. */
function rawOpen(): Promise<{ version: number; stores: string[] }> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const d = req.result;
      const out = { version: d.version, stores: [...d.objectStoreNames] };
      d.close();
      resolve(out);
    };
    req.onerror = () => reject(req.error ?? new Error('error al abrir'));
    req.onblocked = () => reject(new Error('apertura bloqueada por otra conexión'));
  });
}

interface Report {
  env: Record<string, string>;
  storage: Check<StorageStatus>;
  raw: Check<{ version: number; stores: string[] }>;
  dexie: Check<number>;
  consistency: Check<ConsistencyReport>;
  errors: ErrorEntry[];
}

function Status({ c }: { c: Check<unknown> }) {
  if (c.state === 'running') return <span className="muted">comprobando…</span>;
  return c.state === 'ok' ? <span className="ok">correcto</span> : <span className="bad">fallo: {c.error}</span>;
}

export function DiagnosticsPage() {
  const [r, setR] = useState<Report>();
  const [copied, setCopied] = useState(false);

  const runAll = useCallback(async () => {
    setR(undefined);
    setCopied(false);
    const env = {
      app: `${__APP_VERSION__} (esquema v${SCHEMA_VERSION})`,
      fecha: new Date().toISOString(),
      navegador: navigator.userAgent,
      instalada: String(matchMedia('(display-mode: standalone)').matches),
      conexion: navigator.onLine ? 'en línea' : 'sin conexión',
      serviceWorker: navigator.serviceWorker?.controller ? 'activo' : 'no controla la página',
      origen: location.origin + location.pathname,
    };
    const [storage, raw, dexie, consistency] = await Promise.all([
      run(getStorageStatus),
      run(rawOpen),
      run(() => db.items.count()),
      run(() => checkConsistency(), 15000),
    ]);
    setR({ env, storage, raw, dexie, consistency, errors: readErrors() });
  }, []);

  useEffect(() => void runAll(), [runAll]);

  const text = r ? JSON.stringify(r, null, 2) : '';
  const c = r?.consistency.state === 'ok' ? r.consistency.value : undefined;

  return (
    <div className="page diag">
      <PageHeader title="Diagnóstico" onBack={() => history.back()} />
      <p className="hint">Solo lectura: nada de esta pantalla modifica o borra tus prendas.</p>

      {!r ? (
        <p className="muted" role="status">Comprobando…</p>
      ) : (
        <>
          <dl className="kvs">
            <div className="kv"><dt>Versión</dt><dd>{r.env.app}</dd></div>
            <div className="kv"><dt>IndexedDB (nativo)</dt><dd><Status c={r.raw} />{r.raw.state === 'ok' && ` · v${r.raw.value.version} · ${r.raw.value.stores.length} tablas`}</dd></div>
            <div className="kv"><dt>Lectura de prendas</dt><dd><Status c={r.dexie} />{r.dexie.state === 'ok' && ` · ${r.dexie.value} prendas`}</dd></div>
            <div className="kv"><dt>Coherencia</dt><dd>
              <Status c={r.consistency} />
              {c && ` · ${c.counts.items} prendas, ${c.counts.images} imágenes, ${c.counts.blobs} binarios`}
            </dd></div>
            <div className="kv"><dt>Almacenamiento</dt><dd>
              {r.storage.state === 'ok' ? `persistente: ${r.storage.value.persisted === null ? 'n/d' : r.storage.value.persisted ? 'sí' : 'no'}` : <Status c={r.storage} />}
            </dd></div>
            <div className="kv"><dt>Service worker</dt><dd>{r.env.serviceWorker}</dd></div>
          </dl>

          {c && (c.issues.length || c.invalidItems.length ? (
            <div className="notice notice--warn">
              <div>
                <strong>Incoherencias encontradas</strong> (no se ha cambiado nada):
                <ul>
                  {c.invalidItems.map((i) => <li key={i.id}>Ficha {i.id}: {i.issues.join('; ')}</li>)}
                  {c.issues.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            </div>
          ) : (
            <p className="notice">Sin incoherencias: todas las fichas, imágenes y binarios están enlazados correctamente.</p>
          ))}

          {(r.raw.state === 'fail' || r.dexie.state === 'fail') && (
            <div className="notice notice--error">
              <div>
                <strong>La base de datos no responde.</strong> Tus datos siguen en el dispositivo. Pasos seguros:
                <ol>
                  <li>Cierra la app desde la vista de Recientes y vuelve a abrirla.</li>
                  <li>Si sigue igual: Ajustes de Android → Aplicaciones → Chrome → <em>Forzar detención</em>. <strong>No</strong> uses «Borrar datos» ni «Borrar almacenamiento».</li>
                  <li>Si aun así falla, copia este informe y envíamelo.</li>
                </ol>
              </div>
            </div>
          )}

          <h2 className="h2">Últimos errores ({r.errors.length})</h2>
          {r.errors.length ? (
            <ul className="list small">
              {r.errors.slice(0, 10).map((e, i) => <li key={i}><strong>{e.context}</strong> · {new Date(e.at).toLocaleString('es-ES')}<br />{e.name}: {e.message}</li>)}
            </ul>
          ) : (
            <p className="muted small">Ninguno registrado.</p>
          )}

          <div className="row">
            <button type="button" className="btn btn--small" onClick={() => void runAll()}>Repetir comprobación</button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() =>
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? 'Informe copiado' : 'Copiar informe'}
            </button>
            {r.errors.length > 0 && (
              <button type="button" className="btn btn--small btn--ghost" onClick={() => { clearErrors(); void runAll(); }}>
                Vaciar registro de errores
              </button>
            )}
          </div>
          <details>
            <summary className="small">Ver informe completo</summary>
            <pre>{text}</pre>
          </details>
        </>
      )}
    </div>
  );
}
