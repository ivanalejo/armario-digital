// Puntuación de un conjunto (completo o parcial). Cada criterio devuelve 0–1,
// motivos con peso (para la explicación) y avisos. Regla general: un dato
// desconocido puntúa neutro (≈0,5) y un dato estimado cuenta, pero con menos
// fuerza que uno confirmado. Ninguna regla de aquí descarta prendas.
import type { Item } from '../domain/schema';
import { type SeasonId, cutAttrsFor, getColor, labelOf, PATTERNS, STYLES, type StyleId } from '../domain/vocabulary';
import { type OccasionDef, TYPICAL_WARMTH, TEMPS, WARMTH_TARGET } from './occasions';
import type { PreferenceModel } from './preferences';
import type { Criterion, MainSlot, Weather, Weights } from './types';

export interface Piece {
  slot: MainSlot | 'accessory';
  item: Item;
}
export interface Reason {
  text: string;
  weight: number;
}
interface Part {
  score: number;
  reasons: Reason[];
  warnings: string[];
}
export interface ScoreCtx {
  occ: OccasionDef;
  weather: Weather;
  season: SeasonId;
  prefs: PreferenceModel;
  mandatory: ReadonlySet<string>;
  /** En la búsqueda se puntúan conjuntos a medias: no se penaliza que aún falte abrigo. */
  partial: boolean;
  now: Date;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[], empty = 0.5) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : empty);
const isEst = (it: Item, path: string) => !!it.estimated?.includes(path);
/** Un dato estimado se acerca a neutro un 30 %. */
const soften = (s: number, estimated: boolean) => (estimated ? 0.5 + (s - 0.5) * 0.7 : s);

export const mainPieces = (ps: readonly Piece[]) => ps.filter((p) => p.slot !== 'accessory');
const bySlot = (ps: readonly Piece[], s: MainSlot) => ps.find((p) => p.slot === s)?.item;

export function cutVolume(it: Item | undefined, key: 'fit' | 'leg'): number | undefined {
  const v = it?.cut?.[key];
  if (!it || !v) return undefined;
  return cutAttrsFor(it.categoryId, it.subcategoryId).find((a) => a.key === key)?.values.find((x) => x.id === v)?.volume;
}

// ---------- Color (30 %) ----------
const patternIntensity = (it: Item) => PATTERNS.find((p) => p.id === it.pattern)?.intensity ?? 0;
const BROWNISH = new Set(['brown', 'camel']);

export function colorScore(ps: readonly Piece[]): Part {
  const main = mainPieces(ps);
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  let knownW = 0;
  const accents = new Map<string, string>();
  for (const p of main) {
    const c = p.item.colors?.primary ? getColor(p.item.colors.primary) : undefined;
    if (!c) continue;
    knownW += isEst(p.item, 'colors.primary') ? 0.6 : 1;
    if (!c.neutral) accents.set(c.family, c.label.toLowerCase());
  }
  let s = 1;
  const n = accents.size;
  if (n === 2) s -= 0.15;
  else if (n >= 3) s -= 0.4 + 0.1 * (n - 3);

  const top = bySlot(main, 'mid') ?? bySlot(main, 'base');
  const bottom = bySlot(main, 'bottom');
  const tc = top?.colors?.primary ? getColor(top.colors.primary) : undefined;
  const bc = bottom?.colors?.primary ? getColor(bottom.colors.primary) : undefined;
  if (tc && bc) {
    if (tc.id === bc.id && !tc.neutral) s -= 0.15;
    else if (tc.tone !== bc.tone) reasons.push({ text: `Contraste entre ${tc.label.toLowerCase()} arriba y ${bc.label.toLowerCase()} abajo`, weight: 0.3 });
  }

  const loud = main.filter((p) => patternIntensity(p.item) >= 2).length;
  if (loud === 2) s -= 0.25;
  else if (loud >= 3) s -= 0.45;
  else if (loud === 1) reasons.push({ text: 'Un solo estampado y el resto liso', weight: 0.3 });

  const belt = ps.find((p) => p.slot === 'accessory' && p.item.subcategoryId === 'belt')?.item.colors?.primary;
  const shoe = bySlot(main, 'footwear')?.colors?.primary;
  if (belt && shoe) {
    const mismatch = (belt === 'black' && BROWNISH.has(shoe)) || (BROWNISH.has(belt) && shoe === 'black');
    if (mismatch) s -= 0.1;
    else if (belt === shoe || (BROWNISH.has(belt) && BROWNISH.has(shoe))) reasons.push({ text: 'Cinturón a juego con el calzado', weight: 0.25 });
  }

  if (main.length && knownW === main.length) {
    if (n === 0) reasons.push({ text: 'Colores neutros que combinan entre sí', weight: 0.6 });
    else if (n === 1) reasons.push({ text: `Un único color de acento (${[...accents.values()][0]}) sobre neutros`, weight: 0.7 });
  }
  const k = main.length ? knownW / main.length : 0;
  return { score: clamp(s) * k + 0.5 * (1 - k), reasons, warnings };
}

// ---------- Ocasión y formalidad (25 %) ----------
export function formalityDistance(f: { min: number; max: number }, range: readonly [number, number]): number {
  if (f.max < range[0]) return range[0] - f.max;
  if (f.min > range[1]) return f.min - range[1];
  return 0;
}

export function pieceOccasionScore(it: Item, occ: OccasionDef): number | undefined {
  if (!it.formality) return undefined;
  return soften(clamp(1 - formalityDistance(it.formality, occ.range) / 2), isEst(it, 'formality'));
}

export function occasionScore(ps: readonly Piece[], ctx: ScoreCtx): Part {
  const main = mainPieces(ps);
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  const scores = main.map((p) => pieceOccasionScore(p.item, ctx.occ) ?? 0.5);
  let s = 0.5 * mean(scores) + 0.5 * Math.min(...scores, 1);
  const mids = main.filter((p) => p.item.formality).map((p) => (p.item.formality!.min + p.item.formality!.max) / 2);
  if (mids.length >= 2 && Math.max(...mids) - Math.min(...mids) > 2) s -= 0.15;
  const known = main.filter((p) => p.item.formality).length;
  if (main.length && known === main.length && s >= 0.85) reasons.push({ text: `Formalidad adecuada para ${ctx.occ.label.toLowerCase()}`, weight: 0.8 });
  for (const p of main) {
    const sc = pieceOccasionScore(p.item, ctx.occ);
    if (sc !== undefined && sc < 0.4 && !ctx.partial) {
      const informal = p.item.formality!.max < ctx.occ.range[0];
      warnings.push(`«${p.item.name}» queda ${informal ? 'informal' : 'demasiado formal'} para ${ctx.occ.label.toLowerCase()}`);
    }
  }
  return { score: clamp(s), reasons, warnings };
}

// ---------- Estilo y silueta (20 %) ----------
const COMPAT: Record<string, Record<string, number>> = {
  classic: { classic: 1, minimal: 0.9, casual: 0.7, streetwear: 0.35, sporty: 0.2, preppy: 0.9, workwear: 0.6, outdoor: 0.4 },
  minimal: { minimal: 1, casual: 0.85, streetwear: 0.7, sporty: 0.5, preppy: 0.75, workwear: 0.7, outdoor: 0.55 },
  casual: { casual: 1, streetwear: 0.85, sporty: 0.7, preppy: 0.8, workwear: 0.85, outdoor: 0.8 },
  streetwear: { streetwear: 1, sporty: 0.8, preppy: 0.45, workwear: 0.75, outdoor: 0.65 },
  sporty: { sporty: 1, preppy: 0.35, workwear: 0.45, outdoor: 0.8 },
  preppy: { preppy: 1, workwear: 0.6, outdoor: 0.5 },
  workwear: { workwear: 1, outdoor: 0.85 },
  outdoor: { outdoor: 1 },
};
export const styleCompat = (a: string, b: string): number => COMPAT[a]?.[b] ?? COMPAT[b]?.[a] ?? 0.6;

const VOL_LABEL = ['ajustado', 'regular', 'holgado', 'amplio'];

function silhouette(main: readonly Piece[]): { score: number; reason?: Reason; warning?: string } {
  const upper = bySlot(main, 'mid') ?? bySlot(main, 'base');
  const top = cutVolume(upper, 'fit');
  const bottomItem = bySlot(main, 'bottom');
  const bottom = cutVolume(bottomItem, 'leg');
  if (top === undefined || bottom === undefined) return { score: 0.75 };
  const street = main.some((p) => p.item.styles?.includes('streetwear'));
  let s: number;
  let reason: Reason | undefined;
  let warning: string | undefined;
  if (top >= 3 && bottom >= 3) {
    s = street ? 0.85 : 0.55;
    if (!street) warning = 'Mucho volumen arriba y abajo a la vez';
  } else if (top >= 2 && bottom <= 1) {
    s = 1;
    reason = { text: `Volúmenes equilibrados: arriba ${VOL_LABEL[top]}, abajo ${bottomItem?.cut?.leg === 'tapered' ? 'tapered' : VOL_LABEL[bottom]}`, weight: 0.6 };
  } else if (top <= 1 && bottom <= 1) {
    s = 0.9;
    reason = { text: 'Silueta limpia y estilizada', weight: 0.4 };
  } else if (top <= 0 && bottom >= 3) s = 0.8;
  else s = 0.85;
  const profile = bySlot(main, 'footwear')?.cut?.profile;
  if (profile === 'chunky' && bottom === 0) s -= 0.1;
  if (profile === 'sleek' && bottom >= 3) s -= 0.1;
  return { score: clamp(s), reason, warning };
}

export function styleScore(ps: readonly Piece[], ctx: ScoreCtx): Part {
  const main = mainPieces(ps);
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  const styled = main.filter((p) => p.item.styles?.length);
  const pairs: number[] = [];
  for (let i = 0; i < styled.length; i++) {
    for (let j = i + 1; j < styled.length; j++) {
      let best = 0;
      for (const a of styled[i]!.item.styles!) for (const b of styled[j]!.item.styles!) best = Math.max(best, styleCompat(a, b));
      pairs.push(best);
    }
  }
  const compat = pairs.length ? mean(pairs) * 0.85 + Math.min(...pairs) * 0.15 : 0.6;
  const pref = mean(main.map((p) => (p.item.styles?.length ? (p.item.styles.some((s) => ctx.occ.styles.includes(s as StyleId)) ? 1 : 0.4) : 0.5)));
  const sil = silhouette(main);
  let s = 0.5 * compat + 0.2 * pref + 0.3 * sil.score;
  const structured = main.some((p) => p.item.cut?.structure === 'structured');
  if (structured && main.some((p) => p.item.styles?.includes('sporty'))) s -= 0.15;

  if (styled.length === main.length && main.length >= 2 && compat >= 0.85) {
    const names = [...new Set(styled.flatMap((p) => p.item.styles!))].slice(0, 2);
    reasons.push({ text: `Estilos coherentes (${names.map((n) => labelOf(STYLES, n).toLowerCase()).join(', ')})`, weight: 0.45 });
  }
  if (sil.reason) reasons.push(sil.reason);
  if (sil.warning && !ctx.partial) warnings.push(sil.warning);
  return { score: clamp(s), reasons, warnings };
}

// ---------- Temporada y función (15 %) ----------
export function warmthOf(it: Item): { value: number; known: boolean } {
  if (it.warmth !== undefined) return { value: it.warmth, known: !isEst(it, 'warmth') };
  return { value: TYPICAL_WARMTH[it.subcategoryId as keyof typeof TYPICAL_WARMTH] ?? 2, known: false };
}
const isSuede = (it: Item | undefined) => !!it?.material && /\b(ante|suede)\b/i.test(it.material);

export function seasonScore(ps: readonly Piece[], ctx: ScoreCtx): Part {
  const main = mainPieces(ps);
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  const layers = main.filter((p) => p.slot === 'base' || p.slot === 'mid' || p.slot === 'outer');
  const ws = layers.map((p) => warmthOf(p.item));
  const sum = ws.reduce((a, w) => a + w.value, 0);
  const [lo, hi] = WARMTH_TARGET[ctx.weather.temp];
  const d = sum > hi ? sum - hi : !ctx.partial && sum < lo ? lo - sum : 0;
  const warmth = clamp(1 - 0.22 * d);
  const seasonal = mean(main.map((p) => (p.item.seasons?.length ? (p.item.seasons.includes(ctx.season) ? 1 : 0.45) : 0.75)));
  let s = 0.65 * warmth + 0.35 * seasonal;
  const tempLabel = TEMPS.find((t) => t.id === ctx.weather.temp)!.label.toLowerCase();
  if (!ctx.partial && d === 0 && ws.length && ws.every((w) => w.known)) reasons.push({ text: `Abrigo adecuado para ${tempLabel === 'templado' ? 'tiempo templado' : `el ${tempLabel}`}`, weight: 0.5 });
  if (!ctx.partial && d >= 2) warnings.push(sum > hi ? 'Puede dar calor para el tiempo elegido' : 'Puede quedarse corto de abrigo');

  if (ctx.weather.rain && !ctx.partial) {
    const outer = bySlot(main, 'outer');
    if (outer?.waterproof) reasons.push({ text: 'Prenda exterior impermeable para la lluvia', weight: 0.7 });
    else {
      // La lluvia es función, no estética: pesa bastante dentro de este criterio.
      s *= outer?.waterproof === false || !outer ? 0.6 : 0.75;
      warnings.push(outer ? `«${outer.name}» no consta como impermeable` : 'Sin prenda exterior para la lluvia');
    }
    const shoe = bySlot(main, 'footwear');
    if (isSuede(shoe)) {
      s *= 0.85;
      warnings.push(`«${shoe!.name}» es de ante: no es ideal con lluvia`);
    } else if (shoe?.waterproof) s += 0.05;
  }
  return { score: clamp(s), reasons, warnings };
}

// ---------- Preferencias y variedad (10 %) ----------
export function preferenceScore(ps: readonly Piece[], ctx: ScoreCtx, key: string): Part {
  const main = mainPieces(ps);
  const reasons: Reason[] = [];
  let s = 0.5;
  const favs = main.filter((p) => p.item.favorite);
  if (main.length) s += 0.2 * (favs.length / main.length);
  if (favs.length) reasons.push({ text: favs.length === 1 ? `Incluye una favorita: ${favs[0]!.item.name}` : `Incluye ${favs.length} prendas favoritas`, weight: 0.4 });

  // Variedad: lo usado hace muy poco baja un poco (nunca si es obligatorio); lo olvidado sube.
  let recent = 0;
  let forgotten = 0;
  const forgottenNames: string[] = [];
  for (const p of main) {
    const days = ctx.prefs.daysSinceWorn(p.item.id);
    if (days !== undefined && days <= 3 && !ctx.mandatory.has(p.item.id)) recent += 0.08;
    const age = (ctx.now.getTime() - new Date(p.item.createdAt).getTime()) / 86_400_000;
    if ((days === undefined ? age >= 30 : days >= 30) && age >= 30) {
      forgotten += 0.04;
      forgottenNames.push(p.item.name);
    }
  }
  s -= Math.min(recent, 0.2);
  s += Math.min(forgotten, 0.12);
  if (forgottenNames.length) reasons.push({ text: `Recupera ${forgottenNames.length === 1 ? `«${forgottenNames[0]}», que` : 'prendas que'} llevas tiempo sin usar`, weight: 0.35 });

  const itemAff = mean(main.map((p) => ctx.prefs.itemAffinity(p.item.id)), 0);
  const core = (['base', 'bottom', 'footwear'] as const).map((sl) => bySlot(main, sl)?.id).filter((x): x is string => !!x);
  const pairAff: number[] = [];
  for (let i = 0; i < core.length; i++) for (let j = i + 1; j < core.length; j++) pairAff.push(ctx.prefs.pairAffinity(core[i]!, core[j]!));
  const outfitAff = ctx.prefs.outfitAffinity(key);
  s += 0.15 * itemAff + 0.15 * mean(pairAff, 0) + 0.2 * outfitAff;
  if (outfitAff > 0.2) reasons.push({ text: 'Se parece a conjuntos que has guardado', weight: 0.5 });
  return { score: clamp(s), reasons, warnings: [] };
}

// ---------- Confianza ----------
export function confidenceOf(ps: readonly Piece[]): number {
  const main = mainPieces(ps);
  let got = 0;
  let total = 0;
  for (const p of main) {
    const it = p.item;
    const checks: [string, unknown][] = [
      ['colors.primary', it.colors?.primary],
      ['formality', it.formality],
      ['styles', it.styles?.length ? it.styles : undefined],
      ['seasons', it.seasons?.length ? it.seasons : undefined],
      ['warmth', p.slot === 'bottom' || p.slot === 'footwear' ? true : it.warmth],
    ];
    for (const [path, v] of checks) {
      total++;
      if (v !== undefined) got += isEst(it, path) ? 0.5 : 1;
    }
  }
  return total ? got / total : 0;
}

export interface Scored {
  total: number;
  breakdown: Record<Criterion, number>;
  reasons: Reason[];
  warnings: string[];
}

export function scorePieces(ps: readonly Piece[], ctx: ScoreCtx, weights: Weights, key: string): Scored {
  const parts: Record<Criterion, Part> = {
    color: colorScore(ps),
    occasion: occasionScore(ps, ctx),
    style: styleScore(ps, ctx),
    season: seasonScore(ps, ctx),
    preference: preferenceScore(ps, ctx, key),
  };
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let total = 0;
  const breakdown = {} as Record<Criterion, number>;
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  for (const c of Object.keys(parts) as Criterion[]) {
    const p = parts[c];
    breakdown[c] = Math.round(p.score * 100) / 100;
    total += (weights[c] / wsum) * p.score;
    // El peso del motivo se multiplica por el del criterio: explica lo que más influye.
    for (const r of p.reasons) reasons.push({ text: r.text, weight: r.weight * (weights[c] / wsum) * 5 });
    warnings.push(...p.warnings);
  }
  return { total: Math.round(total * 1000) / 10, breakdown, reasons, warnings };
}
