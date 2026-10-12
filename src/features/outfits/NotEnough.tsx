import { Link } from 'wouter';
import type { Item } from '../../domain/schema';
import { getOccasion, type RecommendResult } from '../../engine';
import { Icon } from '../../ui/Icon';
import { setCatalogFilter } from '../wardrobe/filterStore';
import { useOutfitContext } from './context';

/** Estado vacío útil: explica qué falta para poder proponer conjuntos. Nunca inventa prendas. */
export function NotEnough({ result, items }: { result: RecommendResult; items: readonly Item[] }) {
  const ctx = useOutfitContext();
  const drafts = items.filter((i) => i.isDraft).length;
  const occ = getOccasion(ctx.occasionId).label.toLowerCase();

  if (!items.length) {
    return (
      <div className="empty-card" data-testid="outfit-empty">
        <Icon name="sparkles" size={40} />
        <h2>Tu armario aún está vacío</h2>
        <p>Añade al menos una parte de arriba, una de abajo y un calzado, y te propondré conjuntos con lo que ya tienes.</p>
        <Link href="/nueva" className="btn">Añadir prenda</Link>
        <Link href="/copias/restaurar" className="btn btn--ghost" data-testid="empty-restore">¿Móvil nuevo? Restaurar una copia</Link>
      </div>
    );
  }
  if (result.status === 'insufficient') {
    return (
      <div className="empty-card" data-testid="outfit-empty">
        <Icon name="sparkles" size={40} />
        <h2>Aún no puedo montar un conjunto completo</h2>
        <p>Para {occ} me falta:</p>
        <ul className="list">
          {result.missing.map((m) => (
            <li key={m.slot}>
              {m.label}
              {m.unusable > 0 && <span className="muted"> — tienes {m.unusable}, pero no están disponibles, son borradores o no encajan con esta ocasión o este tiempo</span>}
            </li>
          ))}
        </ul>
        <div className="row">
          <Link href="/nueva" className="btn btn--small">Añadir prenda</Link>
          {drafts > 0 && (
            <Link href="/armario" className="btn btn--small btn--ghost" onClick={() => setCatalogFilter({ drafts: 'only' })}>
              Completar {drafts} borrador{drafts > 1 ? 'es' : ''}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="empty-card" data-testid="outfit-empty">
      <Icon name="sparkles" size={40} />
      <h2>Ninguna combinación me convence</h2>
      <p>Con la ocasión «{occ}» y el tiempo elegido no encuentro conjuntos con una puntuación mínima, o ya los has descartado. Prueba con otra ocasión o añade más prendas.</p>
    </div>
  );
}
