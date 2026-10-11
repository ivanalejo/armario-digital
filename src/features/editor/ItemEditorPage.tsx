import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { db } from '../../db/db';
import { ValidationError, saveItem, type PhotoSlot } from '../../db/items';
import { isEstimated } from '../../domain/catalog';
import {
  CATEGORIES,
  COLORS,
  FORMALITY,
  PATTERNS,
  SEASONS,
  SEASON_IDS,
  STATUSES,
  STYLES,
  WARMTH,
  type CategoryId,
  type ColorId,
  type SeasonId,
  type StyleId,
  cutAttrsFor,
  subcategoriesOf,
} from '../../domain/vocabulary';
import { Chip, ChipGroup } from '../../ui/Chips';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { PhotoManager } from './PhotoManager';
import {
  type FormState,
  confirmAll,
  finalize,
  formFromItem,
  missingForCompletion,
  newForm,
  setField,
  toggleFormality,
  toggleInList,
} from './formState';

const colorOptions = COLORS.map((c) => ({ id: c.id as ColorId, label: c.label, swatch: c.hex }));

function Field({ label, path, estimated, children }: { label: string; path?: string; estimated?: boolean; children: ReactNode }) {
  return (
    <div className="field" data-path={path}>
      <div className="field__label">
        {label}
        {estimated && <span className="dot-estimated" title="Estimado: pendiente de confirmar" aria-label="estimado" />}
      </div>
      {children}
    </div>
  );
}

/** Texto con tres estados: desconocido (vacío), «no tiene» (null) o valor. */
function TriText({ value, onChange, noneLabel, placeholder }: { value: string | null | undefined; onChange: (v: string | null | undefined) => void; noneLabel: string; placeholder: string }) {
  return (
    <div className="row">
      <input
        className="input"
        value={value ?? ''}
        placeholder={value === null ? noneLabel : placeholder}
        disabled={value === null}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
      <Chip on={value === null} onClick={() => onChange(value === null ? undefined : null)}>
        {noneLabel}
      </Chip>
    </div>
  );
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section__body">{children}</div>
    </details>
  );
}

export function ItemEditorPage({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>();
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!id) {
      setForm(newForm());
      return;
    }
    void db.items.get(id).then((item) => {
      if (!item) return navigate('/armario', { replace: true });
      setForm(formFromItem(item));
      setPhotos(item.imageIds.map((imageId) => ({ kind: 'existing', imageId })));
    });
  }, [id, navigate]);

  if (!form) return <div className="page"><p className="muted">Cargando…</p></div>;
  const f = form.input;
  const est = (path: string) => isEstimated(f, path);
  const set = (path: string, value: unknown) => setForm((cur) => (cur ? setField(cur, path, value) : cur));
  const cutDefs = cutAttrsFor(f.categoryId, f.subcategoryId);
  const missing = missingForCompletion(f);
  const showWaterproof = f.categoryId === 'outerwear' || f.categoryId === 'footwear';

  async function onSave() {
    setErrors([]);
    setBusy(true);
    try {
      const saved = await saveItem(finalize(form!), photos);
      navigate(`/prenda/${saved.id}`, { replace: true });
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.issues : [(e as Error).message]);
      setBusy(false);
    }
  }

  return (
    <div className="page page--editor">
      <PageHeader title={id ? 'Editar prenda' : 'Nueva prenda'} onBack={() => history.back()} />

      <PhotoManager itemId={id} photos={photos} onChange={setPhotos} onBusy={setBusy} />

      {!!f.estimated?.length && (
        <div className="notice notice--estimated">
          <span><span className="dot-estimated" /> {f.estimated.length} datos estimados pendientes de confirmar.</span>
          <button type="button" className="btn btn--small" onClick={() => setForm(confirmAll(form))}>Confirmar todo</button>
        </div>
      )}

      <Field label="Nombre" path="name" estimated={est('name')}>
        <input className="input" value={f.name} maxLength={80} placeholder="Se propone automáticamente" onChange={(e) => set('name', e.target.value)} />
      </Field>

      <Field label="Categoría" path="categoryId" estimated={est('categoryId')}>
        <ChipGroup options={CATEGORIES} selected={[f.categoryId]} onToggle={(c: CategoryId) => set('categoryId', c)} />
      </Field>

      <Field label="Tipo" path="subcategoryId" estimated={est('subcategoryId')}>
        <ChipGroup
          options={subcategoriesOf(f.categoryId).map((s) => ({ id: s.id, label: s.label }))}
          selected={f.subcategoryId ? [f.subcategoryId] : []}
          onToggle={(s) => set('subcategoryId', f.subcategoryId === s ? undefined : s)}
        />
      </Field>

      <Field label="Color principal" path="colors.primary" estimated={est('colors.primary')}>
        <ChipGroup options={colorOptions} selected={f.colors?.primary ? [f.colors.primary] : []} onToggle={(c) => set('colors.primary', f.colors?.primary === c ? undefined : c)} />
      </Field>

      <Field label="Colores secundarios" path="colors.secondary" estimated={est('colors.secondary')}>
        <ChipGroup
          options={colorOptions.filter((c) => c.id !== f.colors?.primary)}
          selected={f.colors?.secondary ?? []}
          onToggle={(c) => set('colors.secondary', toggleInList(f.colors?.secondary, c, 4) ?? [])}
          extra={
            <Chip on={f.colors?.secondary?.length === 0} onClick={() => set('colors.secondary', f.colors?.secondary?.length === 0 ? undefined : [])}>
              Ninguno
            </Chip>
          }
        />
      </Field>

      {cutDefs.length > 0 && (
        <Section title="Corte y silueta">
          {cutDefs.map((a) => {
            const path = `cut.${a.key}`;
            const v = f.cut?.[a.key];
            return (
              <Field key={a.key} label={a.label} path={path} estimated={est(path)}>
                <ChipGroup
                  options={a.values.map((x) => ({ id: x.id, label: x.label }))}
                  selected={v ? [v] : []}
                  onToggle={(x) => set(path, v === x ? undefined : x)}
                  extra={<Chip on={v === null} onClick={() => set(path, v === null ? undefined : null)}>No aplica</Chip>}
                />
              </Field>
            );
          })}
        </Section>
      )}

      <Section title="Estilo y uso">
        <Field label="Estilos (hasta 3)" path="styles" estimated={est('styles')}>
          <ChipGroup options={STYLES} selected={f.styles ?? []} onToggle={(s: StyleId) => set('styles', toggleInList(f.styles, s, 3))} />
        </Field>
        <Field label="Formalidad" path="formality" estimated={est('formality')}>
          <ChipGroup
            options={FORMALITY.map((x) => ({ id: x.level, label: x.label }))}
            selected={f.formality ? FORMALITY.map((x) => x.level).filter((l) => l >= f.formality!.min && l <= f.formality!.max) : []}
            onToggle={(l) => set('formality', toggleFormality(f.formality, l))}
          />
          <p className="hint">Toca un nivel; toca otro para indicar un rango.</p>
        </Field>
        <Field label="Temporadas" path="seasons" estimated={est('seasons')}>
          <ChipGroup
            options={SEASONS}
            selected={f.seasons ?? []}
            onToggle={(s: SeasonId) => set('seasons', toggleInList(f.seasons, s))}
            extra={<Chip on={f.seasons?.length === 4} onClick={() => set('seasons', f.seasons?.length === 4 ? undefined : [...SEASON_IDS])}>Todo el año</Chip>}
          />
        </Field>
        <Field label="Abrigo" path="warmth" estimated={est('warmth')}>
          <ChipGroup options={WARMTH.map((w) => ({ id: w.level, label: w.label }))} selected={f.warmth ? [f.warmth] : []} onToggle={(w) => set('warmth', f.warmth === w ? undefined : w)} />
        </Field>
        <Field label="Estampado" path="pattern" estimated={est('pattern')}>
          <ChipGroup options={PATTERNS} selected={f.pattern ? [f.pattern] : []} onToggle={(p) => set('pattern', f.pattern === p ? undefined : p)} />
        </Field>
        {showWaterproof && (
          <Field label="Impermeable" path="waterproof" estimated={est('waterproof')}>
            <ChipGroup
              options={[{ id: 'yes', label: 'Sí' }, { id: 'no', label: 'No' }]}
              selected={f.waterproof === undefined ? [] : [f.waterproof ? 'yes' : 'no']}
              onToggle={(x) => {
                const v = x === 'yes';
                set('waterproof', f.waterproof === v ? undefined : v);
              }}
            />
          </Field>
        )}
      </Section>

      <Section title="Más detalles" open={false}>
        <Field label="Marca" path="brand" estimated={est('brand')}>
          <TriText value={f.brand} onChange={(v) => set('brand', v)} noneLabel="Sin marca" placeholder="Desconocida" />
        </Field>
        <Field label="Material" path="material" estimated={est('material')}>
          <TriText value={f.material} onChange={(v) => set('material', v)} noneLabel="No aplica" placeholder="Desconocido" />
        </Field>
        <Field label="Comodidad">
          <ChipGroup options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: String(n) }))} selected={f.comfort ? [f.comfort] : []} onToggle={(n) => set('comfort', f.comfort === n ? undefined : n)} />
        </Field>
        <Field label="Descripción" path="description" estimated={est('description')}>
          <textarea className="input" rows={2} maxLength={280} value={f.description ?? ''} onChange={(e) => set('description', e.target.value || undefined)} />
        </Field>
        <Field label="Notas personales">
          <textarea className="input" rows={3} maxLength={2000} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />
        </Field>
      </Section>

      <Field label="Estado">
        <ChipGroup options={STATUSES} selected={[f.status]} onToggle={(s) => set('status', s)} />
      </Field>
      <Field label="Favorita">
        <Chip on={f.favorite} onClick={() => set('favorite', !f.favorite)}>
          <Icon name="heart" size={16} filled={f.favorite} /> {f.favorite ? 'Sí' : 'No'}
        </Chip>
      </Field>

      {errors.length > 0 && (
        <div className="notice notice--error" role="alert">
          <strong>No se ha guardado:</strong>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="save-bar">
        {missing.length > 0 && <span className="hint">Se guardará como borrador: falta {missing.join(' y ')}.</span>}
        <button type="button" className="btn btn--wide" onClick={() => void onSave()} disabled={busy} data-testid="save-item">
          <Icon name="check" size={18} /> {busy ? 'Espera…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
