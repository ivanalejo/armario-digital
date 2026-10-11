import { useRef, useState } from 'react';
import { db } from '../../db/db';
import { findImageBySourceHash, getBlob, type PhotoSlot } from '../../db/items';
import { ImageError, processImage } from '../../images/process';
import type { ProcessOptions, ProcessedImage } from '../../images/types';
import { logError } from '../../platform/errorLog';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';
import { CropDialog } from './CropDialog';

export const MAX_PHOTOS = 12;

interface Props {
  itemId?: string;
  photos: PhotoSlot[];
  onChange: (photos: PhotoSlot[]) => void;
  /** Avisa al editor de que hay fotos procesándose (para no guardar a medias). */
  onProcessing?: (processing: boolean) => void;
}

/** Trabajo de procesado: lo que hay que hacer con una foto. */
interface Job {
  source: Blob;
  opts?: ProcessOptions;
  replaceAt?: number;
  keepSource?: ProcessedImage['source'];
}
interface Failure extends Job {
  message: string;
}

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function PhotoManager({ itemId, photos, onChange, onProcessing }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<Job>();
  const [working, setWorking] = useState(false);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [notice, setNotice] = useState<string>();

  async function duplicateNotice(img: ProcessedImage): Promise<string | undefined> {
    const sha = img.source?.sha256;
    if (!sha) return undefined;
    try {
      const found = await findImageBySourceHash(sha);
      if (found && found.itemId !== itemId) {
        const other = await db.items.get(found.itemId);
        return `Esta foto ya se usó en «${other?.name ?? found.itemId}». Comprueba que no sea la misma prenda.`;
      }
    } catch {
      /* el aviso de duplicado es opcional: si la consulta falla, se sigue */
    }
    return undefined;
  }

  /**
   * Procesa una lista de trabajos de uno en uno. Un fallo no detiene los demás
   * y nunca deja la interfaz en «Procesando…»: el estado se restablece siempre.
   */
  async function runJobs(jobs: Job[]) {
    setNotice(undefined);
    setWorking(true);
    onProcessing?.(true);
    let next = photos;
    const failed: Failure[] = [];
    const notices: string[] = [];
    try {
      for (const job of jobs) {
        try {
          const image = await processImage(job.source, job.opts);
          if (job.keepSource) image.source = job.keepSource; // recorte de una foto ya guardada: misma huella del original
          else {
            const dup = await duplicateNotice(image);
            if (dup) notices.push(dup);
          }
          const slot: PhotoSlot = { kind: 'new', key: newKey(), image };
          next = [...next];
          if (job.replaceAt !== undefined && job.replaceAt < next.length) next[job.replaceAt] = slot;
          else if (next.length < MAX_PHOTOS) next.push(slot);
          onChange(next);
          setSelected(job.replaceAt ?? next.length - 1);
        } catch (err) {
          logError('procesar foto', err);
          failed.push({ ...job, message: err instanceof ImageError ? err.message : `No se pudo procesar la foto: ${(err as Error).message}` });
        }
      }
    } finally {
      setFailures(failed);
      setNotice(notices[0]);
      setWorking(false);
      onProcessing?.(false);
    }
  }

  function onCamera(files: FileList | null) {
    const f = files?.[0];
    if (f) setPending({ source: f });
  }

  function onGallery(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    if (list.length === 1) return setPending({ source: list[0]! });
    void runJobs(list.map((source) => ({ source })));
  }

  async function recrop(i: number) {
    const slot = photos[i];
    if (!slot) return;
    try {
      if (slot.kind === 'new') return setPending({ source: slot.image.display, replaceAt: i, keepSource: slot.image.source });
      const [blob, meta] = await Promise.all([getBlob(slot.imageId, 'display'), db.images.get(slot.imageId)]);
      if (!blob) return setNotice('No se ha encontrado la imagen guardada para recortarla.');
      setPending({ source: blob, replaceAt: i, keepSource: meta?.source });
    } catch (err) {
      logError('recortar foto', err);
      setNotice(`No se ha podido abrir la foto para recortarla: ${(err as Error).message}`);
    }
  }

  function confirmCrop(opts: ProcessOptions) {
    const job = { ...pending!, opts };
    setPending(undefined);
    void runJobs([job]);
  }

  function move(i: number, to: number) {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [s] = next.splice(i, 1);
    next.splice(to, 0, s!);
    onChange(next);
    setSelected(to);
  }

  function remove(i: number) {
    onChange(photos.filter((_, j) => j !== i));
    setSelected(Math.max(0, i - 1));
  }

  const sel = photos[selected];
  const full = photos.length >= MAX_PHOTOS;

  return (
    <section className="photos">
      <div className="photos__main">
        {sel ? (
          <Thumb
            key={sel.kind === 'new' ? sel.key : sel.imageId}
            {...(sel.kind === 'new' ? { blob: sel.image.display } : { imageId: sel.imageId, variant: 'display' as const })}
            alt={`Foto ${selected + 1}`}
            className="photos__img"
          />
        ) : (
          <div className="photos__empty">
            <Icon name="camera" size={40} />
            <p>Añade al menos una foto</p>
          </div>
        )}
        {working && <div className="photos__busy" role="status">Procesando…</div>}
      </div>

      {sel && (
        <div className="photos__toolbar" aria-label="Acciones de la foto">
          <button type="button" className="icon-btn" onClick={() => move(selected, selected - 1)} disabled={selected === 0 || working} aria-label="Mover a la izquierda">
            <Icon name="left" />
          </button>
          <button type="button" className="icon-btn" onClick={() => move(selected, 0)} disabled={selected === 0 || working} aria-label="Usar como principal" title="Usar como principal">
            <Icon name="star" filled={selected === 0} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void recrop(selected)} disabled={working} aria-label="Recortar o girar">
            <Icon name="crop" />
          </button>
          <button type="button" className="icon-btn" onClick={() => replaceRef.current?.click()} disabled={working} aria-label="Sustituir foto">
            <Icon name="swap" />
          </button>
          <button type="button" className="icon-btn icon-btn--danger" onClick={() => remove(selected)} disabled={working} aria-label="Eliminar foto">
            <Icon name="trash" />
          </button>
          <button type="button" className="icon-btn" onClick={() => move(selected, selected + 1)} disabled={selected >= photos.length - 1 || working} aria-label="Mover a la derecha">
            <Icon name="right" />
          </button>
        </div>
      )}

      <div className="photos__strip">
        {photos.map((p, i) => (
          <button
            key={p.kind === 'new' ? p.key : p.imageId}
            type="button"
            className={`photos__chip${i === selected ? ' photos__chip--on' : ''}`}
            onClick={() => setSelected(i)}
            aria-label={`Ver foto ${i + 1}${i === 0 ? ' (principal)' : ''}`}
          >
            <Thumb {...(p.kind === 'new' ? { blob: p.image.thumb } : { imageId: p.imageId })} alt="" />
          </button>
        ))}
        <button type="button" className="photos__add" onClick={() => camRef.current?.click()} disabled={full || working} aria-label="Hacer foto">
          <Icon name="camera" />
        </button>
        <button type="button" className="photos__add" onClick={() => galRef.current?.click()} disabled={full || working} aria-label="Elegir de la galería">
          <Icon name="image" />
        </button>
      </div>

      {failures.length > 0 && (
        <div className="notice notice--error" role="alert">
          <ul>{failures.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
          <div className="row">
            <button type="button" className="btn btn--small" onClick={() => void runJobs(failures)} disabled={working}>
              Reintentar foto{failures.length > 1 ? 's' : ''}
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setFailures([])}>Descartar</button>
          </div>
        </div>
      )}
      {notice && <p className="notice notice--warn" role="status">{notice}</p>}

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onCamera(e.target.files); e.target.value = ''; }} data-testid="input-camera" />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onGallery(e.target.files); e.target.value = ''; }} data-testid="input-gallery" />
      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPending({ source: f, replaceAt: selected });
          e.target.value = '';
        }}
      />

      {pending && <CropDialog source={pending.source} onConfirm={confirmCrop} onCancel={() => setPending(undefined)} />}
    </section>
  );
}
