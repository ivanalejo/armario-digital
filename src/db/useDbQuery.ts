import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { logError } from '../platform/errorLog';
import { timeouts } from '../platform/timeouts';

export type QueryStatus = 'loading' | 'slow' | 'ready' | 'error';

export interface QueryState<T> {
  status: QueryStatus;
  data?: T;
  error?: Error;
  retry: () => void;
}

/**
 * Consulta reactiva con estados diferenciados. A diferencia de `useLiveQuery`,
 * nunca deja la pantalla en «Cargando…» sin explicación: pasa a «lenta» tras
 * unos segundos (con diagnóstico) y captura los errores en lugar de romper la app.
 */
export function useDbQuery<T>(query: () => Promise<T>, deps: readonly unknown[], context: string): QueryState<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<QueryState<T>, 'retry'>>({ status: 'loading' });

  useEffect(() => {
    let settled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    const slow = setTimeout(() => {
      if (!settled) {
        logError(context, new Error(`La consulta lleva más de ${timeouts().slow / 1000} s sin responder`));
        setState((s) => (s.status === 'loading' ? { status: 'slow' } : s));
      }
    }, timeouts().slow);
    const sub = liveQuery(query).subscribe({
      next: (data) => {
        settled = true;
        setState({ status: 'ready', data });
      },
      error: (err: unknown) => {
        settled = true;
        logError(context, err);
        setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      },
    });
    return () => {
      clearTimeout(slow);
      sub.unsubscribe();
    };
    // `query` cambia en cada render; las dependencias reales las pasa quien llama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
}
