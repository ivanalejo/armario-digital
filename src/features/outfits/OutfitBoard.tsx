import { Link } from 'wouter';
import type { Item } from '../../domain/schema';
import type { MainSlot } from '../../engine';
import { Icon } from '../../ui/Icon';
import { Thumb } from '../../ui/Thumb';

export interface BoardPiece {
  slot: MainSlot | 'accessory';
  item: Item;
}

const SLOT_LABEL: Record<MainSlot | 'accessory', string> = {
  outer: 'Exterior',
  mid: 'Capa',
  base: 'Arriba',
  bottom: 'Abajo',
  footwear: 'Calzado',
  accessory: 'Accesorio',
};

interface Props {
  pieces: readonly BoardPiece[];
  size?: 'hero' | 'normal' | 'compact' | 'mini';
  /** Si se indica, cada pieza principal muestra un botón para cambiarla. */
  onSwap?: (slot: MainSlot) => void;
}

/** Collage del conjunto: piezas principales grandes, accesorios en una fila. Cada pieza abre su ficha. */
export function OutfitBoard({ pieces, size = 'normal', onSwap }: Props) {
  const main = pieces.filter((p) => p.slot !== 'accessory');
  const acc = pieces.filter((p) => p.slot === 'accessory');
  if (size === 'mini') {
    return (
      <div className="mini-board" aria-hidden>
        {main.slice(0, 4).map((p) => <Thumb key={p.item.id} imageId={p.item.imageIds[0]} alt="" />)}
      </div>
    );
  }
  return (
    <div className={`board board--${size}`}>
      <div className={`board__grid board__grid--${Math.min(main.length, 5)}`}>
        {main.map((p, i) => (
          <div key={p.item.id} className={`board__tile${i === 0 && main.length >= 4 ? ' board__tile--lead' : ''}`}>
            <Link href={`/prenda/${p.item.id}`} className="board__link" aria-label={`${SLOT_LABEL[p.slot]}: ${p.item.name}`}>
              <Thumb imageId={p.item.imageIds[0]} variant={size === 'hero' ? 'display' : 'thumb'} alt={p.item.name} className="board__img" />
              <span className="board__caption">
                <span className="board__slot">{SLOT_LABEL[p.slot]}</span>
                <span className="board__name">{p.item.name}</span>
              </span>
            </Link>
            {onSwap && p.slot !== 'accessory' && (
              <button type="button" className="board__swap" onClick={() => onSwap(p.slot as MainSlot)} aria-label={`Cambiar ${p.item.name}`}>
                <Icon name="swap" size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {acc.length > 0 && (
        <div className="board__acc">
          {acc.map((p) => (
            <Link key={p.item.id} href={`/prenda/${p.item.id}`} className="board__acc-item">
              <Thumb imageId={p.item.imageIds[0]} alt="" />
              <span>{p.item.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Muy buena';
  if (score >= 70) return 'Buena';
  return 'Aceptable';
}
