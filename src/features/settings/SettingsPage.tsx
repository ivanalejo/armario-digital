import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { db } from '../../db/db';
import { useDbQuery } from '../../db/useDbQuery';
import { SCHEMA_VERSION } from '../../domain/schema';
import { formatBytes, getStorageStatus, requestPersistence, type StorageStatus } from '../../platform/storage';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';

export function SettingsPage() {
  const [st, setSt] = useState<StorageStatus>();
  const [asked, setAsked] = useState<boolean | null>();
  const cq = useDbQuery(async () => ({ items: await db.items.count(), images: await db.images.count() }), [], 'contar en Ajustes');
  const counts = cq.data;
  const refresh = () => void getStorageStatus().then(setSt).catch(() => undefined);
  useEffect(refresh, []);

  const persistLabel =
    !st?.supported || st.persisted === null ? 'No disponible en este navegador' : st.persisted ? 'Concedido' : 'No concedido';

  return (
    <div className="page">
      <PageHeader title="Ajustes" />

      <section className="panel">
        <h2 className="h2">Almacenamiento</h2>
        <dl className="kvs">
          <div className="kv"><dt>Persistente</dt><dd data-testid="persist-status">{persistLabel}</dd></div>
          <div className="kv"><dt>Espacio usado</dt><dd>{formatBytes(st?.usage ?? null)} de {formatBytes(st?.quota ?? null)} (estimación del navegador)</dd></div>
          <div className="kv"><dt>Contenido</dt><dd>{counts ? `${counts.items} prendas · ${counts.images} fotos` : cq.status === 'loading' ? '…' : 'sin respuesta de la base de datos'}</dd></div>
        </dl>
        {st?.persisted === false && (
          <>
            <button type="button" className="btn btn--small" onClick={() => void requestPersistence().then((r) => { setAsked(r); refresh(); })}>
              Solicitar almacenamiento persistente
            </button>
            {asked === false && <p className="hint">El navegador lo ha denegado. Suele concederse al instalar la app en la pantalla de inicio y usarla con frecuencia.</p>}
          </>
        )}
        <p className="hint">«Persistente» reduce el riesgo de que Chrome borre los datos por falta de espacio, pero no los protege si borras los datos del sitio, desinstalas la app, cambias de navegador o pierdes el móvil.</p>
      </section>

      <section className="panel">
        <h2 className="h2">Copias de seguridad</h2>
        <p className="notice notice--warn">Todavía no se ha generado ninguna exportación: tus datos no están respaldados. La exportación e importación de copias (.armario.zip) llegan en la Fase 2.</p>
        <div className="row">
          <button type="button" className="btn btn--ghost" disabled>Exportar copia</button>
          <button type="button" className="btn btn--ghost" disabled>Importar</button>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2"><Icon name="shield" size={18} /> Privacidad</h2>
        <ul className="list">
          <li>Prendas, fotos e historial se guardan solo en este navegador (IndexedDB).</li>
          <li>La app no envía datos a ningún servidor: sin cuentas, analítica ni servicios externos. Su política de seguridad bloquea cualquier conexión a otros dominios.</li>
          <li>Las fotos se reducen y se guardan sin metadatos EXIF ni ubicación GPS. La foto original de tu galería no se modifica.</li>
          <li>Los datos están ligados a este navegador y a esta dirección web. Borrar los datos del sitio en Chrome también afecta a otras apps publicadas en ivanalejo.github.io.</li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="h2">Diagnóstico</h2>
        <p className="hint">Comprueba la base de datos, la coherencia de las fichas y los últimos errores. Solo lectura: no modifica tus datos.</p>
        <Link href="/diagnostico" className="btn btn--ghost">Abrir diagnóstico</Link>
      </section>

      <p className="muted small">Armario Digital {__APP_VERSION__} · esquema v{SCHEMA_VERSION}</p>
    </div>
  );
}
