import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { loadItems } from '../../db/health';
import { useDbQuery } from '../../db/useDbQuery';
import { LoadState } from '../../ui/LoadState';
import { DEFAULT_STATUSES, filterItems } from '../../domain/catalog';
import type { Item } from '../../domain/schema';
import {
  CATEGORIES,
  COLORS,
  FORMALITY,
  SEASONS,
  STATUSES,
  STYLES,
  type ColorId,
  type SeasonId,
  type StatusId,
  type StyleId,
} from '../../domain/vocabulary';
import { Chip, ChipGroup } from '../../ui/Chips';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';
import { toggleInList } from '../editor/formState';
import { activeFilterCount, setCatalogFilter, useCatalogFilter } from './filterStore';

export function ItemCard({ item }: { item: Item }) {
  const flags: string[] = [];
  if (item.isDraft) flags.push('Borrador');
  if (item.status !== 'available') flags.push(STATUSES.find((s) => s.id === item.status)?.label ?? item.status);
  return (
    <Link href={`/prenda/${item.id}`} className="card" data-testid="item-card">
      <Thumb imageId={item.imageIds[0]} alt={item.name} className="card__img" />
      <div className="card__body">
        <span className="card__name">{item.name}</span>
        <span className="card__meta">
          {item.favorite && <Icon name="heart" size={14} filled label="Favorita" />}
          {(item.estimated?.length || item.issues?.length) ? <span className="dot-estimated" title="Pendiente de revisar" /> : null}
          {flags.map((f) => <span key={f} className="badge">{f}</span>)}
        </span>
      </div>
    </Link>
  );
}

function FilterPanel({ onClose }: { onClose: () => void }) {
  const f = useCatalogFilter();
  const set = (patch: Partial<typeof f>) => setCatalogFilter((cur) => ({ ...cur, ...patch }));
  const statuses = f.statuses ?? DEFAULT_STATUSES;
  return (
    <div className="sheet" role="dialog" aria-label="Filtros">
      <div className="sheet__head">
        <strong>Filtros</strong>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setCatalogFilter({ text: f.text, categoryId: f.categoryId })}>Limpiar</button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar filtros"><Icon name="x" /></button>
      </div>
      <div className="sheet__body">
        <div className="field"><div className="field__label">Color</div>
          <ChipGroup options={COLORS.map((c) => ({ id: c.id as ColorId, label: c.label, swatch: c.hex }))} selected={f.colorIds ?? []} onToggle={(c) => set({ colorIds: toggleInList(f.colorIds, c) })} />
        </div>
        <div className="field"><div className="field__label">Estilo</div>
          <ChipGroup options={STYLES} selected={f.styleIds ?? []} onToggle={(s: StyleId) => set({ styleIds: toggleInList(f.styleIds, s) })} />
        </div>
        <div className="field"><div className="field__label">Temporada</div>
          <ChipGroup options={SEASONS} selected={f.seasonIds ?? []} onToggle={(s: SeasonId) => set({ seasonIds: toggleInList(f.seasonIds, s) })} />
        </div>
        <div className="field"><div className="field__label">Formalidad</div>
          <ChipGroup options={FORMALITY.map((x) => ({ id: x.level, label: x.label }))} selected={f.formality ? [f.formality] : []} onToggle={(l) => set({ formality: f.formality === l ? undefined : l })} />
        </div>
        <div className="field"><div className="field__label">Estado</div>
          <ChipGroup
            options={STATUSES}
            selected={statuses}
            onToggle={(s: StatusId) => {
              const next = toggleInList(statuses, s) ?? [];
              const isDefault = next.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((d) => next.includes(d));
              set({ statuses: isDefault ? undefined : next });
            }}
          />
        </div>
        <div className="field"><div className="field__label">Mostrar</div>
          <div className="chips">
            <Chip on={!!f.favorites} onClick={() => set({ favorites: !f.favorites || undefined })}>Solo favoritas</Chip>
            <Chip on={!!f.pendingReview} onClick={() => set({ pendingReview: !f.pendingReview || undefined })}>Pendientes de revisar</Chip>
            <Chip on={f.drafts === 'only'} onClick={() => set({ drafts: f.drafts === 'only' ? undefined : 'only' })}>Solo borradores</Chip>
            <Chip on={f.drafts === 'exclude'} onClick={() => set({ drafts: f.drafts === 'exclude' ? undefined : 'exclude' })}>Sin borradores</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WardrobePage() {
  const q = useDbQuery(() => loadItems(), [], 'cargar Armario');
  const items = q.data?.items;
  const invalid = q.data?.invalid ?? [];
  const f = useCatalogFilter();
  const [panel, setPanel] = useState(false);
  const shown = useMemo(() => (items ? filterItems(items, f) : []), [items, f]);
  const nFilters = activeFilterCount(f);

  return (
    <div className="page">
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Buscar: «camisa azul», «uniqlo»…"
            value={f.text ?? ''}
            onChange={(e) => setCatalogFilter((cur) => ({ ...cur, text: e.target.value || undefined }))}
            aria-label="Buscar prendas"
          />
        </label>
        <button type="button" className="icon-btn icon-btn--badge" onClick={() => setPanel(true)} aria-label="Filtros">
          <Icon name="filter" />
          {nFilters > 0 && <span className="badge badge--count">{nFilters}</span>}
        </button>
      </div>
      <div className="chips chips--scroll">
        <Chip on={!f.categoryId} onClick={() => setCatalogFilter((cur) => ({ ...cur, categoryId: undefined }))}>Todo</Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} on={f.categoryId === c.id} onClick={() => setCatalogFilter((cur) => ({ ...cur, categoryId: cur.categoryId === c.id ? undefined : c.id }))}>
            {c.label}
          </Chip>
        ))}
      </div>

      {invalid.length > 0 && (
        <Link href="/diagnostico" className="notice notice--warn">
          {invalid.length} ficha{invalid.length > 1 ? 's' : ''} con datos no válidos no se muestra{invalid.length > 1 ? 'n' : ''} (no se ha borrado nada). Ver diagnóstico.
        </Link>
      )}
      {items === undefined ? (
        <LoadState q={q} what="tus prendas" />
      ) : items.length === 0 && invalid.length === 0 ? (
        <div className="empty">
          <Icon name="hanger" size={48} />
          <p>Tu armario está vacío.</p>
          <Link href="/nueva" className="btn">Añadir la primera prenda</Link>
        </div>
      ) : (
        <>
          <p className="muted small" aria-live="polite">{shown.length} de {items.length} prendas</p>
          <div className="grid">{shown.map((it) => <ItemCard key={it.id} item={it} />)}</div>
          {shown.length === 0 && <p className="empty">Ninguna prenda coincide con la búsqueda o los filtros.</p>}
        </>
      )}
      {panel && <FilterPanel onClose={() => setPanel(false)} />}
    </div>
  );
}
