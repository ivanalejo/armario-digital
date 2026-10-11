import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { db } from '../../db/db';
import { deleteItem, patchItem } from '../../db/items';
import { useDbQuery } from '../../db/useDbQuery';
import { ItemSchema, formatIssues } from '../../domain/schema';
import { LoadState } from '../../ui/LoadState';
import { logError } from '../../platform/errorLog';
import { useState } from 'react';
import { isEstimated } from '../../domain/catalog';
import {
  FORMALITY,
  PATTERNS,
  SEASONS,
  STATUSES,
  STYLES,
  WARMTH,
  categoryLabel,
  cutAttrsFor,
  cutValueLabel,
  getColor,
  labelOf,
  subcategoryLabel,
  type StatusId,
} from '../../domain/vocabulary';
import { ChipGroup } from '../../ui/Chips';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { Thumb } from '../../ui/Thumb';

const UNKNOWN = <span className="muted">Desconocido</span>;

function Row({ label, est, children }: { label: string; est?: boolean; children: ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}{est && <span className="dot-estimated" title="Estimado" />}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const colorChip = (id: string) => {
  const c = getColor(id);
  return (
    <span key={id} className="color-tag">
      <span className="swatch" style={{ background: c?.hex }} /> {c?.label ?? id}
    </span>
  );
};

export function ItemDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const q = useDbQuery(() => db.items.get(id), [id], 'cargar ficha');
  const [actionError, setActionError] = useState<string>();

  if (q.status !== 'ready') {
    return (
      <div className="page">
        <PageHeader title="Prenda" onBack={() => history.back()} />
        <LoadState q={q} what="la prenda" />
      </div>
    );
  }
  const parsed = q.data ? ItemSchema.safeParse(q.data) : undefined;
  if (parsed && !parsed.success) {
    return (
      <div className="page">
        <PageHeader title="Ficha con problemas" onBack={() => history.back()} />
        <div className="notice notice--warn">
          <p>Esta ficha tiene datos no válidos y no se puede mostrar. No se ha modificado ni borrado nada.</p>
          <ul>{formatIssues(parsed.error).map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      </div>
    );
  }
  const item = parsed?.data;
  if (!item) {
    return (
      <div className="page">
        <PageHeader title="Prenda no encontrada" onBack={() => navigate('/armario')} />
        <p>Puede que se haya eliminado.</p>
      </div>
    );
  }
  const est = (p: string) => isEstimated(item, p);
  const text = (v: string | null | undefined, none: string) => (v === null ? <span className="muted">{none}</span> : v ?? UNKNOWN);

  async function act(what: string, fn: () => Promise<unknown>) {
    setActionError(undefined);
    try {
      await fn();
    } catch (err) {
      logError(what, err);
      setActionError((err as Error).message);
    }
  }

  async function onDelete() {
    if (!confirm(`¿Eliminar «${item!.name}» y sus fotos? No se puede deshacer.`)) return;
    await act('borrar prenda', async () => {
      await deleteItem(item!.id);
      navigate('/armario', { replace: true });
    });
  }

  const cutDefs = cutAttrsFor(item.categoryId, item.subcategoryId);

  return (
    <div className="page page--detail">
      <PageHeader
        title={item.name}
        onBack={() => history.back()}
        actions={
          <>
            <button type="button" className="icon-btn" onClick={() => void act('favorito', () => patchItem(item.id, { favorite: !item.favorite }))} aria-label={item.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}>
              <Icon name="heart" filled={item.favorite} />
            </button>
            <Link href={`/prenda/${item.id}/editar`} className="icon-btn" aria-label="Editar"><Icon name="edit" /></Link>
          </>
        }
      />

      <div className="gallery">
        {item.imageIds.length ? (
          item.imageIds.map((imgId, i) => <Thumb key={imgId} imageId={imgId} variant="display" alt={`${item.name}, foto ${i + 1}`} className="gallery__img" />)
        ) : (
          <div className="gallery__empty"><Icon name="image" size={40} /><span>Sin fotos</span></div>
        )}
      </div>

      {actionError && <p className="notice notice--error" role="alert">{actionError}</p>}
      {item.isDraft && <p className="notice notice--warn">Borrador: completa el tipo de prenda y el color principal.</p>}
      {!!item.estimated?.length && (
        <p className="notice notice--estimated"><span className="dot-estimated" /> Hay datos estimados. Edita la prenda para confirmarlos o corregirlos.</p>
      )}
      {item.issues?.map((iss, i) => <p key={i} className="notice notice--warn">Incidencia: {iss.note ?? iss.type}</p>)}

      <div className="field">
        <div className="field__label">Estado</div>
        <ChipGroup options={STATUSES} selected={[item.status]} onToggle={(s: StatusId) => void act('cambiar estado', () => patchItem(item.id, { status: s }))} />
      </div>

      <dl className="kvs">
        <Row label="Tipo" est={est('subcategoryId')}>{categoryLabel(item.categoryId)} · {item.subcategoryId ? subcategoryLabel(item.subcategoryId) : UNKNOWN}</Row>
        <Row label="Color principal" est={est('colors.primary')}>{item.colors?.primary ? colorChip(item.colors.primary) : UNKNOWN}</Row>
        <Row label="Secundarios" est={est('colors.secondary')}>
          {item.colors?.secondary === undefined ? UNKNOWN : item.colors.secondary.length ? item.colors.secondary.map(colorChip) : <span className="muted">Ninguno</span>}
        </Row>
        {cutDefs.map((a) => {
          const v = item.cut?.[a.key];
          return (
            <Row key={a.key} label={a.label} est={est(`cut.${a.key}`)}>
              {v === undefined ? UNKNOWN : v === null ? <span className="muted">No aplica</span> : cutValueLabel(a.key, v, item.categoryId, item.subcategoryId)}
            </Row>
          );
        })}
        <Row label="Estilos" est={est('styles')}>{item.styles?.map((s) => labelOf(STYLES, s)).join(', ') || UNKNOWN}</Row>
        <Row label="Formalidad" est={est('formality')}>
          {item.formality
            ? [item.formality.min, item.formality.max].filter((v, i, a) => a.indexOf(v) === i).map((l) => FORMALITY[l - 1]?.label).join(' – ')
            : UNKNOWN}
        </Row>
        <Row label="Temporadas" est={est('seasons')}>{item.seasons?.length === 4 ? 'Todo el año' : item.seasons?.map((s) => labelOf(SEASONS, s)).join(', ') || UNKNOWN}</Row>
        <Row label="Abrigo" est={est('warmth')}>{item.warmth ? WARMTH[item.warmth - 1]?.label : UNKNOWN}</Row>
        <Row label="Estampado" est={est('pattern')}>{item.pattern ? labelOf(PATTERNS, item.pattern) : UNKNOWN}</Row>
        {(item.categoryId === 'outerwear' || item.categoryId === 'footwear') && (
          <Row label="Impermeable" est={est('waterproof')}>{item.waterproof === undefined ? UNKNOWN : item.waterproof ? 'Sí' : 'No'}</Row>
        )}
        <Row label="Marca" est={est('brand')}>{text(item.brand, 'Sin marca')}</Row>
        <Row label="Material" est={est('material')}>{text(item.material, 'No aplica')}</Row>
        {item.description && <Row label="Descripción">{item.description}</Row>}
        {item.notes && <Row label="Notas">{item.notes}</Row>}
        <Row label="Alta">{new Date(item.createdAt).toLocaleDateString('es-ES')}</Row>
      </dl>

      <button type="button" className="btn btn--danger btn--wide" onClick={() => void onDelete()} data-testid="delete-item">
        <Icon name="trash" size={18} /> Eliminar prenda
      </button>
    </div>
  );
}
