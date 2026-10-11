import type { ReactNode } from 'react';

interface Option<T extends string | number> {
  id: T;
  label: ReactNode;
  swatch?: string;
  title?: string;
}

interface ChipGroupProps<T extends string | number> {
  options: readonly Option<T>[];
  selected: readonly T[];
  onToggle: (id: T) => void;
  label?: string;
  /** Chip extra al final (p. ej. «No aplica»). */
  extra?: ReactNode;
}

export function ChipGroup<T extends string | number>({ options, selected, onToggle, label, extra }: ChipGroupProps<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={String(o.id)}
            type="button"
            className={`chip${on ? ' chip--on' : ''}${o.swatch ? ' chip--swatch' : ''}`}
            aria-pressed={on}
            title={o.title}
            onClick={() => onToggle(o.id)}
          >
            {o.swatch && <span className="swatch" style={{ background: o.swatch }} />}
            {o.label}
          </button>
        );
      })}
      {extra}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip chip--muted${on ? ' chip--on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
