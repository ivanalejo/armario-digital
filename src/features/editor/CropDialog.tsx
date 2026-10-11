import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Icon } from '../../ui/Icon';
import { useObjectUrl } from '../../ui/Thumb';
import type { ProcessOptions } from '../../images/types';

const ASPECTS = [
  { label: '3:4', value: 3 / 4 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
];

interface Props {
  source: Blob;
  onConfirm: (opts: ProcessOptions) => void;
  onCancel: () => void;
}

/** Recorte y rotación antes de procesar. El archivo de origen no se modifica. */
export function CropDialog({ source, onConfirm, onCancel }: Props) {
  const url = useObjectUrl(source);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);
  const [area, setArea] = useState<Area>();

  return (
    <div className="crop-dialog" role="dialog" aria-modal="true" aria-label="Recortar foto">
      <div className="crop-dialog__stage">
        {url && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
            objectFit="contain"
          />
        )}
      </div>
      <div className="crop-dialog__tools">
        <div className="chips">
          {ASPECTS.map((a) => (
            <button key={a.label} type="button" className={`chip${aspect === a.value ? ' chip--on' : ''}`} onClick={() => setAspect(a.value)}>
              {a.label}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Girar 90 grados">
            <Icon name="rotate" size={18} /> Girar
          </button>
        </div>
        <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
        <div className="row row--end">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onConfirm({ rotation })}>
            Sin recortar
          </button>
          <button type="button" className="btn" onClick={() => onConfirm({ rotation, ...(area ? { crop: area } : {}) })}>
            <Icon name="check" size={18} /> Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
