// Restaurar o importar una copia: elegir archivo → comprobar (sin escribir nada)
// → revisar resumen, conflictos y duplicados → restaurar en una sola operación.
import { useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { logError } from '../../platform/errorLog';
import { formatBytes } from '../../platform/storage';
import { applyImport, type ImportPlan, type ImportReport, planImport, REPLACE_WORD } from '../../transfer/importBackup';
import { readBackup, type Problem } from '../../transfer/readBackup';
import { Chip } from '../../ui/Chips';
import { Icon } from '../../ui/Icon';
import { plural } from '../../ui/plural';
import { PageHeader } from '../../ui/PageHeader';
import { Thumb } from '../../ui/Thumb';
import { ExportButton } from './BackupPanel';

type Step =
  | { kind: 'pick' }
  | { kind: 'reading'; name: string }
  | { kind: 'fatal'; name: string; message: string }
  | { kind: 'review'; name: string; size: number; plan: ImportPlan; problems: Problem[]; warnings: string[] }
  | { kind: 'applying' }
  | { kind: 'done'; report: ImportReport };

function BackupThumb({ plan, imageId, alt }: { plan: ImportPlan; imageId?: string; alt: string }) {
  const img = imageId ? plan.backup.images.get(imageId) : undefined;
  const blob = useMemo(() => (img ? new Blob([img.thumb.bytes as BlobPart], { type: img.thumb.type }) : undefined), [img]);
  return <Thumb blob={blob} alt={alt} className="restore-row__img" />;
}

function Review({ step, onDone, onRestart }: { step: Extract<Step, { kind: 'review' }>; onDone: (r: ImportReport) => void; onRestart: () => void }) {
  const { plan } = step;
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [useBackup, setUseBackup] = useState<Set<string>>(new Set());
  const [importDup, setImportDup] = useState<Set<string>>(new Set());
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const by = (s: string) => plan.items.filter((p) => p.status === s);
  const fresh = by('new');
  const same = by('same');
  const conflicts = by('conflict');
  const dups = by('duplicate');
  const blocked = by('blocked');
  const h = plan.backup.header;
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    fn(n);
  };
  const willAdd = mode === 'replace' ? plan.items.length : fresh.length + useBackup.size + importDup.size;
  const canApply = mode === 'merge' || word === REPLACE_WORD;

  async function apply() {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await applyImport(plan, { mode, useBackup, importDuplicates: importDup, confirmation: word }));
    } catch (err) {
      logError('restaurar copia', err);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="restore" data-testid="restore-review">
      <div className="notice">
        <div>
          <strong>{step.name}</strong> · {formatBytes(step.size)}
          <br />
          Copia del {new Date(h.createdAt).toLocaleString('es-ES')}{h.generator.version ? ` · Armario Digital ${h.generator.version}` : ''}
          <br />
          {plural(plan.backup.items.length, 'prenda')} · {plural(plan.backup.images.size, 'foto')} · {plural(plan.backup.outfits.length, 'conjunto')} · {plural(plan.backup.wearLog.length, 'uso registrado', 'usos registrados')}
        </div>
      </div>

      <dl className="kvs">
        <div className="kv"><dt>Nuevas</dt><dd data-testid="count-new">{fresh.length}</dd></div>
        <div className="kv"><dt>Ya están (sin cambios)</dt><dd data-testid="count-same">{same.length}</dd></div>
        <div className="kv"><dt>Modificadas en este dispositivo</dt><dd data-testid="count-conflict">{conflicts.length}</dd></div>
        <div className="kv"><dt>Posibles duplicados</dt><dd data-testid="count-dup">{dups.length}</dd></div>
        {blocked.length > 0 && <div className="kv"><dt>No se pueden importar</dt><dd>{blocked.length}</dd></div>}
        {plan.others.filter((o) => o.add + o.same + o.keepMine > 0).map((o) => (
          <div key={o.label} className="kv"><dt>{o.label}</dt><dd>{o.add} nuevos · {o.same} ya están{o.keepMine ? ` · ${o.keepMine} distintos (se conserva el tuyo)` : ''}</dd></div>
        ))}
      </dl>

      {(step.problems.length > 0 || blocked.length > 0) && (
        <details className="notice notice--warn" open={step.problems.length < 6}>
          <summary><strong>{step.problems.length + blocked.length} elemento{step.problems.length + blocked.length > 1 ? 's' : ''} no se importará{step.problems.length + blocked.length > 1 ? 'n' : ''}</strong> (el resto sí)</summary>
          <ul data-testid="restore-problems">
            {step.problems.map((p, i) => <li key={i}>{p.subject}: {p.message}</li>)}
            {blocked.map((b) => <li key={b.item.id}>«{b.item.name}»: {b.reason}</li>)}
          </ul>
        </details>
      )}
      {step.warnings.length > 0 && (
        <details className="notice">
          <summary>{step.warnings.length} aviso{step.warnings.length > 1 ? 's' : ''}</summary>
          <ul>{step.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      <div className="field">
        <div className="field__label">¿Cómo restaurar?</div>
        <div className="chips">
          <Chip on={mode === 'merge'} onClick={() => setMode('merge')}>Añadir a lo que tengo</Chip>
          <Chip on={mode === 'replace'} onClick={() => setMode('replace')}>Reemplazar todo</Chip>
        </div>
        <p className="hint">
          {mode === 'merge'
            ? 'Se añade lo nuevo. Lo que ya tienes no se toca salvo que lo elijas abajo, prenda a prenda.'
            : `Se borrará todo lo de este dispositivo (${plan.localItems} prendas, sus fotos, conjuntos e historial) y quedará exactamente lo de la copia.`}
        </p>
      </div>

      {mode === 'merge' && conflicts.length > 0 && (
        <section className="field">
          <div className="field__label">Prendas modificadas en este dispositivo</div>
          <p className="hint">Por defecto se conserva tu versión actual. Marca las que quieras recuperar tal como estaban en la copia.</p>
          {conflicts.map((c) => (
            <label key={c.item.id} className="restore-row">
              <BackupThumb plan={plan} imageId={c.item.imageIds[0]} alt="" />
              <span className="restore-row__text">
                <strong>{c.item.name}</strong>
                {c.existing && c.existing.name !== c.item.name && <span className="muted small">En el dispositivo: «{c.existing.name}»</span>}
              </span>
              <input type="checkbox" checked={useBackup.has(c.item.id)} onChange={() => toggle(useBackup, c.item.id, setUseBackup)} aria-label={`Usar la versión de la copia de ${c.item.name}`} />
            </label>
          ))}
        </section>
      )}

      {mode === 'merge' && dups.length > 0 && (
        <section className="field">
          <div className="field__label">Posibles duplicados</div>
          <p className="hint">Tienen la misma foto que una prenda que ya tienes, pero otro identificador. Por defecto no se importan.</p>
          {dups.map((c) => (
            <label key={c.item.id} className="restore-row">
              <BackupThumb plan={plan} imageId={c.item.imageIds[0]} alt="" />
              <span className="restore-row__text">
                <strong>{c.item.name}</strong>
                <span className="muted small">Igual que «{c.duplicateOf?.name}»</span>
              </span>
              <input type="checkbox" checked={importDup.has(c.item.id)} onChange={() => toggle(importDup, c.item.id, setImportDup)} aria-label={`Importar igualmente ${c.item.name}`} />
            </label>
          ))}
        </section>
      )}

      {mode === 'replace' && (
        <section className="field">
          {plan.localItems > 0 && (
            <div className="notice notice--warn">
              <div>
                Antes de reemplazar, guarda una copia de lo que tienes ahora por si necesitas volver atrás.
                <ExportButton label="Copiar lo actual primero" ghost />
              </div>
            </div>
          )}
          <label className="field__label" htmlFor="replace-word">Escribe {REPLACE_WORD} para confirmar</label>
          <input id="replace-word" className="input" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </section>
      )}

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="save-bar">
        <button type="button" className="btn btn--wide" disabled={busy || !canApply || (mode === 'merge' && willAdd === 0 && plan.others.every((o) => o.add === 0))} onClick={() => void apply()} data-testid="apply-restore">
          <Icon name="check" size={18} />
          {busy ? 'Restaurando…' : mode === 'replace' ? 'Reemplazar todo por la copia' : willAdd ? `Restaurar ${willAdd} prenda${willAdd > 1 ? 's' : ''}` : 'Restaurar lo nuevo'}
        </button>
        <button type="button" className="btn btn--ghost btn--wide" onClick={onRestart} disabled={busy}>Elegir otro archivo</button>
      </div>
    </div>
  );
}

export function RestorePage() {
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStep({ kind: 'reading', name: file.name });
    try {
      const r = await readBackup(file);
      if (!r.ok) return setStep({ kind: 'fatal', name: file.name, message: r.fatal });
      const plan = await planImport(r.backup);
      setStep({ kind: 'review', name: file.name, size: file.size, plan, problems: r.problems, warnings: r.warnings });
    } catch (err) {
      logError('leer copia', err);
      setStep({ kind: 'fatal', name: file.name, message: `No se ha podido leer el archivo: ${(err as Error).message}` });
    }
  }

  const restart = () => {
    setStep({ kind: 'pick' });
    if (input.current) input.current.value = '';
  };

  return (
    <div className="page">
      <PageHeader title="Restaurar copia" onBack={() => history.back()} />
      <input ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="restore-input" />

      {step.kind === 'pick' && (
        <div className="empty-card">
          <Icon name="shield" size={40} />
          <h2>Elige tu archivo .armario.zip</h2>
          <p>Primero se comprueba la copia sin cambiar nada. Después verás qué se va a añadir y decidirás.</p>
          <button type="button" className="btn" onClick={() => input.current?.click()} data-testid="pick-backup">Elegir archivo</button>
          <p className="hint">En un móvil nuevo: instala la app, abre esta pantalla y elige la copia desde Drive o Descargas.</p>
        </div>
      )}
      {step.kind === 'reading' && <p className="muted" role="status">Comprobando «{step.name}»…</p>}
      {step.kind === 'fatal' && (
        <div className="notice notice--error" role="alert" data-testid="restore-fatal">
          <div>
            <strong>No se puede restaurar «{step.name}»</strong>
            <br />
            {step.message}
            <br />
            No se ha cambiado nada.
          </div>
          <button type="button" className="btn btn--small" onClick={restart}>Elegir otro archivo</button>
        </div>
      )}
      {step.kind === 'review' && <Review step={step} onDone={(report) => setStep({ kind: 'done', report })} onRestart={restart} />}
      {step.kind === 'done' && (
        <div className="empty-card" data-testid="restore-done">
          <Icon name="check" size={40} />
          <h2>Copia restaurada</h2>
          <p>
            {plural(step.report.added, 'prenda añadida', 'prendas añadidas')} · {step.report.replaced} recuperadas de la copia · {step.report.skipped} sin cambios u omitidas
            {step.report.others.outfits ? ` · ${step.report.others.outfits} conjuntos` : ''}
            {step.report.others.wearLog ? ` · ${step.report.others.wearLog} usos` : ''}
          </p>
          <p className={step.report.consistency.issues.length ? 'notice notice--warn' : 'muted small'}>
            {step.report.consistency.issues.length ? `Revisa el diagnóstico: ${step.report.consistency.issues.length} incoherencias.` : 'Comprobación de coherencia: correcta.'}
          </p>
          <Link href="/armario" className="btn">Ver mi armario</Link>
        </div>
      )}
    </div>
  );
}
