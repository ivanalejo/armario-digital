// Cálculos puros del pipeline de imagen (testeables sin navegador).
import type { CropRect } from './types';

export const DISPLAY_MAX = 1600;
export const THUMB_MAX = 400;

export function normalizeRotation(deg = 0): 0 | 90 | 180 | 270 {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/** Dimensiones de la imagen tras rotarla. */
export function rotatedSize(w: number, h: number, rotation: number): { width: number; height: number } {
  return normalizeRotation(rotation) % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
}

/** Ajusta el recorte a los límites de la imagen rotada (o la imagen completa si no hay recorte). */
export function clampCrop(crop: CropRect | undefined, w: number, h: number): CropRect {
  if (!crop) return { x: 0, y: 0, width: w, height: h };
  const x = Math.max(0, Math.min(Math.round(crop.x), w - 1));
  const y = Math.max(0, Math.min(Math.round(crop.y), h - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(crop.width), w - x)),
    height: Math.max(1, Math.min(Math.round(crop.height), h - y)),
  };
}

/** Escala para que el lado mayor no supere `max`. Nunca amplía. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
