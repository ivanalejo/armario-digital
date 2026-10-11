import { useRef, useState } from 'react';
import { db } from '../../db/db';
import { findImageBySourceHash, getBlob, type PhotoSlot } from '../../db/items';
import { ImageError, processImage } from '../../images/process';
import type { ProcessOptions, ProcessedImage } from '../../images/types';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';
import { CropDialog } from './CropDialog';

export const MAX_PHOTOS = 12;

interface Props {
  itemId?: string;
  photos: PhotoSlot[];
  onChange: (photos: PhotoSlot[]) => void;
  onBusy?: (busy: boolean) => void;
}

/** Qué hacer con la foto cuando termine el recorte. */
type Pending = { source: Blob; replaceAt?: number; keepSource?: ProcessedImage['source'] };

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function PhotoManager({ itemId, photos, onChange, onBusy }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<Pending>();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string>();

  const busy = (b: boolean) => {
    setWorking(b);
    onBusy?.(b);
  };

  async function warnIfDuplicate(img: ProcessedImage) {
    const sha = img.source?.sha256;
    if (!sha) return;
    const found = await findImageBySourceHash(sha);
    if (found && found.itemId !== itemId) {
      const other = await db.items.get(found.itemId);
      setNotice(`Esta foto ya se usó en «${other?.name ?? found.itemId}». Comprueba que no sea la misma prenda.`);
    }
  }

  async function processInto(list: PhotoSlot[], source: Blob, opts: ProcessOptions, at?: number, keepSource?: ProcessedImage['source']) {
    const image = await processImage(source, opts);
    if (keepSource) image.source = keepSource; // recorte de una foto ya guardada: conserva la huella del original
    else await warnIfDuplicate(image);
    const slot: PhotoSlot = { kind: 'new', key: newKey(), image };
    const next = [...list];
    if (at !== undefined) next[at] = slot;
    else next.push(slot);
    return next;
  }

  async function run(task: () => Promise<void>) {
    setNotice(undefined);
    busy(true);
    try {
      await task();
    } catch (e) {
      setNotice(e instanceof ImageError ? e.message : `No se pudo procesar la foto: ${(e as Error).message}`);
    } finally {
      busy(false);
    }
  }

  function onCamera(files: FileList | null) {
    const f = files?.[0];
    if (f) setPending({ source: f });
  }

  function onGallery(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_PHOTOS - photos.length);
    if (list.length === 1) return setPending({ source: list[0]! });
    void run(async () => {
      let next = photos;
      for (const f of list) next = await processInto(next, f, {}); // de una en una para no agotar memoria
      onChange(next);
      setSelected(next.length - 1);
    });
  }

  async function sourceOf(slot: PhotoSlot): Promise<{ blob: Blob; source: ProcessedImage['source'] } | undefined> {
    if (slot.kind === 'new') return { blob: slot.image.display, source: slot.image.source };
    const blob = await getBlob(slot.imageId, 'display');
    const meta = await db.images.get(slot.imageId);
    return blob ? { blob, source: meta?.source } : undefined;
  }

  async function recrop(i: number) {
    const slot = photos[i];
    if (!slot) return;
    const s = await sourceOf(slot);
    if (s) setPending({ source: s.blob, replaceAt: i, keepSource: s.source });
  }

  function confirmCrop(opts: ProcessOptions) {
    const p = pending!;
    setPending(undefined);
    void run(async () => {
      const next = await processInto(photos, p.source, opts, p.replaceAt, p.keepSource);
      onChange(next);
      setSelected(p.replaceAt ?? next.length - 1);
    });
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
        {working && <div className="photos__busy">Procesando…</div>}
      </div>

      {sel && (
        <div className="photos__toolbar" aria-label="Acciones de la foto">
          <button type="button" className="icon-btn" onClick={() => move(selected, selected - 1)} disabled={selected === 0} aria-label="Mover a la izquierda">
            <Icon name="left" />
          </button>
          <button type="button" className="icon-btn" onClick={() => move(selected, 0)} disabled={selected === 0} aria-label="Usar como principal" title="Usar como principal">
            <Icon name="star" filled={selected === 0} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void recrop(selected)} aria-label="Recortar o girar">
            <Icon name="crop" />
          </button>
          <button type="button" className="icon-btn" onClick={() => replaceRef.current?.click()} aria-label="Sustituir foto">
            <Icon name="swap" />
          </button>
          <button type="button" className="icon-btn icon-btn--danger" onClick={() => remove(selected)} aria-label="Eliminar foto">
            <Icon name="trash" />
          </button>
          <button type="button" className="icon-btn" onClick={() => move(selected, selected + 1)} disabled={selected >= photos.length - 1} aria-label="Mover a la derecha">
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
