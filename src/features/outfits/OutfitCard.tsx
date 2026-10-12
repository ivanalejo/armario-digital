import { useEffect, useState } from 'react';
import { dismissOutfit, localDate, logWear, recordSwap, saveOutfit } from '../../db/outfits';
import { alternativesFor, type MainSlot, type Recommendation } from '../../engine';
import { logError } from '../../platform/errorLog';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';
import type { OutfitContextState } from './context';
import { OutfitBoard, scoreLabel } from './OutfitBoard';
import type { WardrobeData } from './useWardrobeData';

interface Props {
  rec: Recommendation;
  data: WardrobeData;
  ctx: OutfitContextState;
  variant?: 'hero' | 'normal';
  /** Solo en Inicio: pasar a la siguiente propuesta. */
  onNext?: () => void;
  testId?: string;
}

const SLOT_NAME: Record<MainSlot, string> = { outer: 'la capa exterior', mid: 'la capa intermedia', base: 'la parte de arriba', bottom: 'la parte de abajo', footwear: 'el calzado' };

export function OutfitCard({ rec, data, ctx, variant = 'normal', onNext, testId }: Props) {
  const [current, setCurrent] = useState(rec);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();
  const [dismissing, setDismissing] = useState(false);
  const [swapSlot, setSwapSlot] = useState<MainSlot>();

  // Si cambia la propuesta de fuera (otra, nueva ocasión…), se descarta la versión modificada.
  // Solo cuando cambia el conjunto (no cada vez que se recargan los datos tras guardar una señal).
  useEffect(() => {
    setCurrent(rec);
    setMsg(undefined);
    setError(undefined);
    setDismissing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.key]);
  const modified = current.key !== rec.key;

  const saved = data.outfits.find((o) => (o.key ?? '') === current.key);
  const wornToday = data.wearLog.some((w) => w.date === localDate() && current.pieces.every((p) => p.slot === 'accessory' || w.itemIds.includes(p.item.id)));

  async function act(what: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setMsg(ok);
    } catch (err) {
      logError(what, err);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const alternatives = swapSlot
    ? alternativesFor(current.slots, swapSlot, data.items, { occasionId: ctx.occasionId, weather: ctx.weather }, { wearLog: data.wearLog, feedback: data.feedback, savedOutfits: data.outfits })
    : [];

  return (
    <article className={`outfit-card outfit-card--${variant}`} data-testid={testId ?? 'outfit-card'} data-key={current.key}>
      <OutfitBoard pieces={current.pieces} size={variant === 'hero' ? 'hero' : 'normal'} onSwap={setSwapSlot} />

      <div className="outfit-card__body">
        <div className="outfit-card__score">
          <span className="score-pill">{Math.round(current.score)} · {scoreLabel(current.score)}</span>
          {modified && <span className="badge">Modificado</span>}
        </div>
        <ul className="reasons">
          {current.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {current.warnings.length > 0 && (
          <ul className="reasons reasons--warn">
            {current.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}

        {dismissing ? (
          <div className="actions" role="group" aria-label="Descartar">
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => void act('descartar', () => dismissOutfit(current.slots, ctx, 'not-today'), 'Oculta por hoy')}>
              Hoy no
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => void act('descartar', () => dismissOutfit(current.slots, ctx), 'Descartada: no volverá a proponerse en un tiempo')}>
              No me gusta
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setDismissing(false)}>Cancelar</button>
          </div>
        ) : (
          <div className="actions">
            {onNext && (
              <button type="button" className="btn btn--small" onClick={onNext} disabled={busy} data-testid="next-outfit">
                <Icon name="swap" size={16} /> Otra
              </button>
            )}
            <button
              type="button"
              className={`btn btn--small ${saved ? 'btn--on' : 'btn--ghost'}`}
              disabled={busy || !!saved}
              onClick={() => void act('guardar conjunto', () => saveOutfit(current, ctx), 'Guardado en tus conjuntos')}
              data-testid="save-outfit"
            >
              <Icon name="heart" size={16} filled={!!saved} /> {saved ? 'Guardado' : 'Guardar'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy || wornToday}
              onClick={() => void act('registrar uso', () => logWear(current.slots, { ...ctx, outfitId: saved?.id }), 'Anotado en tu historial de hoy')}
              data-testid="wear-outfit"
            >
              <Icon name="check" size={16} /> {wornToday ? 'Puesto hoy' : 'Me lo pongo'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setDismissing(true)} data-testid="dismiss-outfit">
              <Icon name="x" size={16} /> Descartar
            </button>
          </div>
        )}
        {msg && <p className="hint" role="status">{msg}</p>}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
      </div>

      {swapSlot && (
        <div className="sheet" role="dialog" aria-label={`Cambiar ${SLOT_NAME[swapSlot]}`}>
          <div className="sheet__head">
            <strong>Cambiar {SLOT_NAME[swapSlot]}</strong>
            <button type="button" className="icon-btn" onClick={() => setSwapSlot(undefined)} aria-label="Cerrar"><Icon name="x" /></button>
          </div>
          <div className="sheet__body">
            {alternatives.length === 0 && <p className="muted">No hay otras prendas disponibles para esta posición con la ocasión y el clima elegidos.</p>}
            {alternatives.map((a) => {
              const delta = Math.round(a.rec.score - current.score);
              return (
                <button
                  key={a.item?.id ?? 'none'}
                  type="button"
                  className="alt-row"
                  onClick={() => {
                    const from = current.slots[swapSlot];
                    setCurrent(a.rec);
                    setSwapSlot(undefined);
                    void recordSwap(a.rec.slots, swapSlot, from, ctx).catch((err: unknown) => logError('registrar cambio', err));
                  }}
                >
                  {a.item ? <Thumb imageId={a.item.imageIds[0]} alt="" className="alt-row__img" /> : <span className="alt-row__img alt-row__none"><Icon name="x" /></span>}
                  <span className="alt-row__name">{a.item?.name ?? `Sin ${SLOT_NAME[swapSlot].replace(/^(la|el) /, '')}`}</span>
                  <span className={`alt-row__delta ${delta >= 0 ? 'ok' : 'bad'}`}>{delta >= 0 ? `+${delta}` : delta}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
