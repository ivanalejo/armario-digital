// Inicio: panel personal para vestirse. Lo protagonista es la propuesta del día;
// el catálogo completo vive en Armario.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { catalogStats } from '../../domain/catalog';
import { evaluateOutfit, pickDaily } from '../../engine';
import { getStorageStatus, type StorageStatus } from '../../platform/storage';
import { Icon } from '../../ui/Icon';
import { LoadState } from '../../ui/LoadState';
import { Thumb } from '../../ui/Thumb';
import { ContextBar } from '../outfits/ContextBar';
import { readDailyKey, useOutfitContext, writeDailyKey } from '../outfits/context';
import { NotEnough } from '../outfits/NotEnough';
import { OutfitBoard } from '../outfits/OutfitBoard';
import { OutfitCard } from '../outfits/OutfitCard';
import { useRecommendations, useWardrobeData } from '../outfits/useWardrobeData';
import { setCatalogFilter } from '../wardrobe/filterStore';
import { localDate } from '../../db/outfits';

const today = () =>
  new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());

export function HomePage() {
  const q = useWardrobeData('cargar Inicio');
  const ctx = useOutfitContext();
  const result = useRecommendations(q.data, ctx);
  const [storage, setStorage] = useState<StorageStatus>();
  useEffect(() => void getStorageStatus().then(setStorage).catch(() => undefined), []);

  // La propuesta del día se recuerda (por día y contexto) para que no cambie cada vez que abres la app.
  const ctxKey = `${ctx.occasionId}|${ctx.weather.temp}|${ctx.weather.rain}`;
  const [chosen, setChosen] = useState(() => readDailyKey(ctxKey));
  useEffect(() => setChosen(readDailyKey(ctxKey)), [ctxKey]);
  // Si la elegida ya no es válida (descartada, prenda no disponible…), se elige otra entre las mejores.
  const shown = result?.outfits.find((o) => o.key === chosen) ?? (result ? pickDaily(result.outfits, `${localDate()}|${ctxKey}`) : undefined);
  // Se fija en cuanto se muestra: guardarla o valorarla cambia el ranking, pero no debe cambiar la de hoy.
  useEffect(() => {
    if (shown && shown.key !== chosen) {
      writeDailyKey(ctxKey, shown.key);
      setChosen(shown.key);
    }
  }, [shown, chosen, ctxKey]);

  if (q.status !== 'ready' || !q.data || !result) {
    return (
      <div className="page">
        <header className="today"><p className="today__date">{today()}</p><h1>¿Qué me pongo?</h1></header>
        <LoadState q={q} what="tus prendas" />
      </div>
    );
  }
  const data = q.data;
  const s = catalogStats(data.items);
  const recent = [...data.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  const next = () => {
    if (!shown) return;
    const i = result.outfits.findIndex((o) => o.key === shown.key);
    const n = result.outfits[(i + 1) % result.outfits.length]!;
    writeDailyKey(ctxKey, n.key);
    setChosen(n.key);
  };

  const saved = data.outfits.slice(0, 6).map((o) => ({ o, ev: evaluateOutfit(o.slots, data.items, { occasionId: o.occasionId ?? ctx.occasionId, weather: ctx.weather }) }));

  return (
    <div className="page page--home">
      <header className="today">
        <p className="today__date">{today()}</p>
        <h1>¿Qué me pongo?</h1>
      </header>

      {data.invalid.length > 0 && (
        <Link href="/diagnostico" className="notice notice--warn">
          {data.invalid.length} ficha{data.invalid.length > 1 ? 's' : ''} con datos no válidos no se muestra{data.invalid.length > 1 ? 'n' : ''}. No se ha borrado nada: ver diagnóstico.
        </Link>
      )}

      <section className="daily" aria-labelledby="daily-title">
        <h2 id="daily-title" className="h2">Tu outfit de hoy</h2>
        <ContextBar />
        {shown ? (
          <OutfitCard rec={shown} data={data} ctx={ctx} variant="hero" onNext={result.outfits.length > 1 ? next : undefined} testId="daily-outfit" />
        ) : (
          <NotEnough result={result} items={data.items} />
        )}
        {shown && (
          <Link href="/outfits" className="link-more">Ver más propuestas <Icon name="right" size={16} /></Link>
        )}
      </section>

      {saved.length > 0 && (
        <section aria-labelledby="saved-title">
          <div className="section-head">
            <h2 id="saved-title" className="h2">Tus conjuntos</h2>
            <Link href="/outfits/guardados" className="link-more">Ver todos <Icon name="right" size={16} /></Link>
          </div>
          <div className="strip">
            {saved.map(({ o, ev }) => (
              <Link key={o.id} href="/outfits/guardados" className="strip__card" aria-label="Conjunto guardado">
                <OutfitBoard pieces={ev.pieces} size="mini" />
                {o.rating && <span className="strip__rating">{'★'.repeat(o.rating)}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {s.total > 0 && <section className="stats-line" aria-label="Resumen del armario">
        <Link href="/armario" onClick={() => setCatalogFilter({})}><strong>{s.total}</strong> prendas</Link>
        <Link href="/armario" onClick={() => setCatalogFilter({ statuses: ['available'], drafts: 'exclude' })}><strong>{s.available}</strong> disponibles</Link>
        {s.drafts > 0 && <Link href="/armario" onClick={() => setCatalogFilter({ drafts: 'only' })}><strong>{s.drafts}</strong> borradores</Link>}
        {s.pendingReview > 0 && <Link href="/armario" onClick={() => setCatalogFilter({ pendingReview: true })}><strong>{s.pendingReview}</strong> por revisar</Link>}
      </section>}

      {recent.length > 0 && (
        <section aria-labelledby="recent-title">
          <div className="section-head">
            <h2 id="recent-title" className="h2 h2--small">Últimas incorporaciones</h2>
            <Link href="/armario" className="link-more" onClick={() => setCatalogFilter({})}>Ver armario <Icon name="right" size={16} /></Link>
          </div>
          <div className="strip strip--small">
            {recent.map((it) => (
              <Link key={it.id} href={`/prenda/${it.id}`} className="strip__item" aria-label={it.name}>
                <Thumb imageId={it.imageIds[0]} alt={it.name} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="backup-line">
        <Icon name="shield" size={16} /> Sin copia de seguridad todavía: tus prendas solo están en este navegador.
        {storage?.persisted === false && ' Almacenamiento persistente no concedido.'}
      </p>
    </div>
  );
}
