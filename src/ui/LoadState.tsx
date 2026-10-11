import { Link } from 'wouter';
import type { QueryState } from '../db/useDbQuery';

/** Estado de una consulta que aún no tiene datos: cargando, lenta o con error. */
export function LoadState({ q, what }: { q: QueryState<unknown>; what: string }) {
  if (q.status === 'loading') return <p className="muted" role="status">Cargando…</p>;
  if (q.status === 'ready') return null;
  const slow = q.status === 'slow';
  return (
    <div className="notice notice--error" role="alert">
      <p>
        <strong>{slow ? `La base de datos no responde al cargar ${what}.` : `No se han podido leer ${what}.`}</strong>
      </p>
      <p>
        {slow
          ? 'Tus datos no se han modificado. Suele deberse a otra ventana de la app que se ha quedado ocupada. Prueba a reintentar; si sigue igual, cierra la app desde Recientes y, si hace falta, fuerza la detención de Chrome (sin borrar sus datos).'
          : `Detalle: ${q.error?.message ?? 'error desconocido'}`}
      </p>
      <div className="row">
        <button type="button" className="btn btn--small" onClick={q.retry}>Reintentar</button>
        <Link href="/diagnostico" className="btn btn--small btn--ghost">Ver diagnóstico</Link>
      </div>
    </div>
  );
}
