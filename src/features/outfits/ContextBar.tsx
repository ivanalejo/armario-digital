import { OCCASIONS, TEMPS, type Temp } from '../../engine';
import { Chip } from '../../ui/Chips';
import { setOutfitContext, useOutfitContext } from './context';

/** Ocasión y clima: dos filas de toques, sin formularios. */
export function ContextBar() {
  const ctx = useOutfitContext();
  return (
    <div className="ctxbar">
      <div className="chips chips--scroll" role="group" aria-label="Ocasión">
        {OCCASIONS.map((o) => (
          <Chip key={o.id} on={ctx.occasionId === o.id} onClick={() => setOutfitContext({ occasionId: o.id })}>
            {o.label}
          </Chip>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Tiempo">
        {TEMPS.map((t) => (
          <Chip key={t.id} on={ctx.weather.temp === t.id} onClick={() => setOutfitContext({ weather: { ...ctx.weather, temp: t.id as Temp } })}>
            {t.label}
          </Chip>
        ))}
        <Chip on={ctx.weather.rain} onClick={() => setOutfitContext({ weather: { ...ctx.weather, rain: !ctx.weather.rain } })}>
          Lluvia
        </Chip>
      </div>
    </div>
  );
}
