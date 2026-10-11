import type { ImageMeta } from '../domain/schema';

/** Resultado del procesado de una foto, listo para guardarse. */
export interface ProcessedImage extends Omit<ImageMeta, 'id' | 'itemId' | 'createdAt'> {
  display: Blob;
  thumb: Blob;
}

/** Rectángulo de recorte en píxeles de la imagen ya rotada. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessOptions {
  crop?: CropRect;
  /** Rotación en grados, múltiplo de 90. */
  rotation?: number;
}
