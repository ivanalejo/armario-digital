import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { deleteOutfit, deleteWear, localDate, logWear, rateOutfit } from '../../db/outfits';
import type { Outfit } from '../../domain/schema';
import { evaluateOutfit, getOccasion } from '../../engine';
import { logError } from '../../platform/errorLog';
import { Icon } from '../../ui/Icon';
import { LoadState } from '../../ui/LoadState';
import { PageHeader } from '../../ui/PageHeader';
import { Thumb } from '../../ui/Thumb';
import { ContextBar } from './ContextBar';
import { useOutfitContext } from './context';
import { NotEnough } from './NotEnough';
import { OutfitBoard } from './OutfitBoard';
import { OutfitCard } from './OutfitCard';
import { useRecommendations, useWardrobeData, type WardrobeData } from './useWardrobeData';

type Tab = 'explorar' | 'guardados' | 'historial';

function Tabs({ tab }: { tab: Tab }) {
  const items: { id: Tab; label: string; href: string }[] = [
    { id: 'explorar', label: 'Explorar', href: '/outfits' },
    { id: 'guardados', label: 'Guardados', href: '/outfits/guardados' },
    { id: 'historial', label: 'Historial', href: '/outfits/historial' },
  ];
  return (
    <nav className="tabs" aria-label="Secciones de outfits">
      {items.map((t) => (
        <Link key={t.id} href={t.href} className={`tabs__item${tab === t.id ? ' is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Explore({ data, withItem }: { data: WardrobeData; withItem?: string }) {
  const ctx = useOutfitContext();
  const [, navigate] = useLocation();
  const [shown, setShown] = useState(5);
  const pinned = withItem ? data.items.find((i) => i.id === withItem) : undefined;
  const result = useRecommendations(data, ctx, pinned ? [pinned.id] : undefined);
  if (!result) return null;
  return (
    <>
      <ContextBar />
      {pinned && (
        <div className="pinned">
          <Thumb imageId={pinned.imageIds[0]} alt="" className="pinned__img" />
          <span>Combinando con <strong>{pinned.name}</strong></span>
          <button type="button" className="icon-btn" onClick={() => navigate('/outfits')} aria-label="Quitar prenda fijada"><Icon name="x" /></button>
        </div>
      )}
      {result.notices.map((n) => <p key={n} className="notice notice--warn">{n}</p>)}
      {result.status !== 'ok' ? (
        <NotEnough result={result} items={data.items} />
      ) : (
        <>
          <p className="muted small">{result.outfits.length} propuestas para {getOccasion(ctx.occasionId).label.toLowerCase()}, ordenadas por puntuación.</p>
          {result.outfits.slice(0, shown).map((r) => <OutfitCard key={r.key} rec={r} data={data} ctx={ctx} />)}
          {shown < result.outfits.length && (
            <button type="button" className="btn btn--ghost btn--wide" onClick={() => setShown((n) => n + 5)}>Ver más propuestas</button>
          )}
        </>
      )}
    </>
  );
}

function Stars({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="stars" role="group" aria-label="Valoración">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`stars__btn${value && n <= value ? ' is-on' : ''}`} onClick={() => onChange(n)} aria-label={`${n} estrella${n > 1 ? 's' : ''}`} aria-pressed={value === n}>
          <Icon name="star" size={20} filled={!!value && n <= value} />
        </button>
      ))}
    </div>
  );
}

function SavedCard({ outfit, data }: { outfit: Outfit; data: WardrobeData }) {
  const ctx = useOutfitContext();
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const ev = useMemo(
    () => evaluateOutfit(outfit.slots, data.items, { occasionId: outfit.occasionId ?? ctx.occasionId, weather: outfit.weather ?? ctx.weather }, { wearLog: data.wearLog, savedOutfits: data.outfits }),
    [outfit, data, ctx],
  );
  const wornToday = data.wearLog.some((w) => w.outfitId === outfit.id && w.date === localDate());
  const run = (what: string, fn: () => Promise<unknown>, ok?: string) => {
    setError(undefined);
    fn().then(() => ok && setMsg(ok)).catch((err: unknown) => {
      logError(what, err);
      setError((err as Error).message);
    });
  };
  return (
    <article className="outfit-card" data-testid="saved-outfit">
      <OutfitBoard pieces={ev.pieces} size="compact" />
      <div className="outfit-card__body">
        <div className="outfit-card__score">
          <span className="muted small">
            {outfit.occasionId ? getOccasion(outfit.occasionId).label : 'Sin ocasión'} · guardado el {new Date(outfit.createdAt).toLocaleDateString('es-ES')}
          </span>
        </div>
        <Stars value={outfit.rating} onChange={(v) => run('valorar', () => rateOutfit(outfit.id, v))} />
        {ev.problems.length > 0 && <ul className="reasons reasons--warn">{ev.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="actions">
          <button type="button" className="btn btn--small btn--ghost" disabled={wornToday || ev.problems.length > 0} onClick={() => run('registrar uso', () => logWear(outfit.slots, { occasionId: outfit.occasionId ?? ctx.occasionId, weather: outfit.weather ?? ctx.weather, outfitId: outfit.id }), 'Anotado en tu historial de hoy')}>
            <Icon name="check" size={16} /> {wornToday ? 'Puesto hoy' : 'Me lo pongo'}
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm('¿Quitar este conjunto de guardados? El historial se conserva.') && run('borrar conjunto', () => deleteOutfit(outfit.id))}>
            <Icon name="trash" size={16} /> Quitar
          </button>
        </div>
        {msg && <p className="hint" role="status">{msg}</p>}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

function Saved({ data }: { data: WardrobeData }) {
  if (!data.outfits.length) {
    return (
      <div className="empty">
        <Icon name="heart" size={44} />
        <p>Aún no has guardado ningún conjunto.</p>
        <Link href="/outfits" className="btn btn--small">Explorar propuestas</Link>
      </div>
    );
  }
  const sorted = [...data.outfits].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.createdAt.localeCompare(a.createdAt));
  return <>{sorted.map((o) => <SavedCard key={o.id} outfit={o} data={data} />)}</>;
}

function History({ data }: { data: WardrobeData }) {
  const byId = new Map(data.items.map((i) => [i.id, i]));
  if (!data.wearLog.length) {
    return (
      <div className="empty">
        <Icon name="check" size={44} />
        <p>Cuando pulses «Me lo pongo», el conjunto quedará anotado aquí.</p>
      </div>
    );
  }
  return (
    <ul className="history">
      {data.wearLog.map((w) => (
        <li key={w.id} className="history__row" data-testid="wear-entry">
          <div className="history__date">
            <strong>{new Date(`${w.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
            {w.occasionId && <span className="muted small">{getOccasion(w.occasionId).label}</span>}
          </div>
          <div className="history__thumbs">
            {w.itemIds.map((id) => {
              const it = byId.get(id);
              return it ? (
                <Link key={id} href={`/prenda/${id}`} aria-label={it.name}><Thumb imageId={it.imageIds[0]} alt={it.name} /></Link>
              ) : (
                <span key={id} className="thumb thumb--empty" title="Prenda eliminada" />
              );
            })}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Borrar del historial"
            onClick={() => confirm('¿Borrar esta entrada del historial?') && void deleteWear(w.id).catch((err: unknown) => logError('borrar historial', err))}
          >
            <Icon name="trash" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OutfitsPage({ tab = 'explorar', withItem }: { tab?: Tab; withItem?: string }) {
  const q = useWardrobeData('cargar Outfits');
  return (
    <div className="page">
      <PageHeader title="Outfits" />
      <Tabs tab={tab} />
      {q.status !== 'ready' || !q.data ? (
        <LoadState q={q} what="tus conjuntos" />
      ) : tab === 'guardados' ? (
        <Saved data={q.data} />
      ) : tab === 'historial' ? (
        <History data={q.data} />
      ) : (
        <Explore data={q.data} withItem={withItem} />
      )}
    </div>
  );
}

