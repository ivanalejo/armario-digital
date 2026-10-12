// Motor de recomendación (ARCHITECTURE.md §8). Puro y determinista: la misma
// entrada produce siempre la misma salida (desempates por ID, sin azar).
import type { Item } from '../domain/schema';
import { getSubcategory, type SubcategoryId } from '../domain/vocabulary';
import { confidenceOf as confidenceOfPieces, formalityDistance, mainPieces, pieceOccasionScore, scorePieces, warmthOf, type Piece, type ScoreCtx } from './scoring';
import { getOccasion, seasonOf, type OccasionDef } from './occasions';
import { buildPreferences, outfitKey } from './preferences';
import {
  CORE_SLOTS,
  DEFAULT_WEIGHTS,
  type MainSlot,
  type MissingSlot,
  type OutfitSlots,
  type Recommendation,
  type RecommendContext,
  type RecommendRequest,
  type RecommendResult,
} from './types';

/** Por debajo de esta puntuación una combinación no se presenta como recomendación. */
export const MIN_SCORE = 50;
/** Diferencia de formalidad (confirmada) a partir de la cual una prenda es una incompatibilidad evidente. */
export const FORMALITY_GAP = 1.5;
const TOP_K: Record<MainSlot, number> = { base: 12, bottom: 12, footwear: 10, mid: 6, outer: 6 };
const BEAM = { pair: 40, footwear: 50, mid: 60, outer: 80 };
const KNITS = new Set<string>(['sweater', 'sweatshirt', 'hoodie', 'cardigan']);
const ORDER: MainSlot[] = ['outer', 'mid', 'base', 'bottom', 'footwear'];
const REQUIRED: { slot: 'base' | 'bottom' | 'footwear'; label: string }[] = [
  { slot: 'base', label: 'una parte superior (camiseta, polo, camisa, jersey…)' },
  { slot: 'bottom', label: 'una parte inferior (vaqueros, chinos, pantalón…)' },
  { slot: 'footwear', label: 'calzado' },
];

type SlotOf = MainSlot | 'accessory';
const slotsOf = (it: Item): SlotOf[] => [...(getSubcategory(it.subcategoryId ?? '')?.slots ?? [])] as SlotOf[];
const isEst = (it: Item, p: string) => !!it.estimated?.includes(p);
const sub = (it: Item) => (it.subcategoryId ?? '') as SubcategoryId;

/** Motivo por el que una prenda no puede proponerse (o undefined si puede). */
export function ineligibility(it: Item, occ: OccasionDef, weather: RecommendRequest['weather']): string | undefined {
  if (it.isDraft) return 'es un borrador';
  if (!it.subcategoryId) return 'no tiene tipo de prenda';
  if (it.status !== 'available') return 'no está disponible';
  if ((occ.exclude as readonly string[]).includes(it.subcategoryId)) return `no se suele usar para ${occ.label.toLowerCase()}`;
  // Solo datos confirmados descartan: lo estimado o desconocido nunca excluye.
  if (it.formality && !isEst(it, 'formality') && formalityDistance(it.formality, occ.range) >= FORMALITY_GAP) {
    return `su formalidad no encaja con ${occ.label.toLowerCase()}`;
  }
  const s = sub(it);
  if (weather.temp === 'hot') {
    if (s === 'coat' || s === 'parka' || s === 'puffer') return 'demasiado abrigo para el calor';
    if (it.warmth !== undefined && it.warmth >= 4 && !isEst(it, 'warmth')) return 'demasiado abrigo para el calor';
  }
  if (weather.temp === 'cold' && (s === 'shorts' || s === 'sport-shorts' || s === 'sandals')) return 'no es para el frío';
  if (weather.rain && s === 'sandals') return 'no es para la lluvia';
  return undefined;
}

interface Search {
  occ: OccasionDef;
  req: RecommendRequest;
  ctx: ScoreCtx;
  weights: typeof DEFAULT_WEIGHTS;
}

function piecesOf(slots: OutfitSlots, byId: ReadonlyMap<string, Item>): Piece[] {
  const out: Piece[] = [];
  for (const s of ORDER) {
    const it = slots[s] ? byId.get(slots[s]!) : undefined;
    if (it) out.push({ slot: s, item: it });
  }
  for (const id of slots.accessories ?? []) {
    const it = byId.get(id);
    if (it) out.push({ slot: 'accessory', item: it });
  }
  return out;
}

const quick = (ps: Piece[], s: Search) => scorePieces(ps, s.ctx, s.weights, '').total;

/** Accesorios de forma voraz: cinturón, reloj, bufanda, corbata o gorra según ocasión y clima. */
function pickAccessories(slots: OutfitSlots, pool: readonly Item[], fixed: string[], byId: ReadonlyMap<string, Item>, s: Search): string[] {
  const chosen = [...fixed];
  const has = (type: string) => chosen.some((id) => byId.get(id)?.subcategoryId === type);
  const bottom = slots.bottom ? byId.get(slots.bottom) : undefined;
  const base = slots.base ? byId.get(slots.base) : undefined;
  const shoe = slots.footwear ? byId.get(slots.footwear) : undefined;
  const wants: string[] = [];
  for (const type of s.occ.accessories) {
    if (type === 'belt') {
      const loops = bottom?.cut?.waist ? bottom.cut.waist === 'belt-loops' : ['jeans', 'chinos', 'trousers'].includes(sub(bottom ?? ({} as Item)));
      if (loops && s.occ.range[1] >= 3) wants.push(type);
    } else if (type === 'scarf') {
      if (s.req.weather.temp === 'cold') wants.push(type);
    } else if (type === 'tie') {
      if (base?.subcategoryId === 'shirt') wants.push(type);
    } else if (type === 'cap') {
      if (s.req.weather.temp !== 'cold') wants.push(type);
    } else wants.push(type);
  }
  for (const type of wants) {
    if (chosen.length >= 3 || has(type)) continue;
    const options = pool.filter((it) => it.subcategoryId === type && !chosen.includes(it.id));
    let best: Item | undefined;
    let bestScore = -1;
    for (const it of options) {
      let sc = pieceOccasionScore(it, s.occ) ?? 0.5;
      if (type === 'belt' && shoe?.colors?.primary && it.colors?.primary) {
        const brown = (c: string) => c === 'brown' || c === 'camel';
        if (it.colors.primary === shoe.colors.primary || (brown(it.colors.primary) && brown(shoe.colors.primary))) sc += 0.5;
      }
      if (it.favorite) sc += 0.1;
      if (sc > bestScore || (sc === bestScore && best && it.id < best.id)) {
        best = it;
        bestScore = sc;
      }
    }
    if (best) chosen.push(best.id);
  }
  return chosen;
}

function finalize(slots: OutfitSlots, byId: ReadonlyMap<string, Item>, s: Search, extraWarnings: string[] = []): Recommendation {
  const pieces = piecesOf(slots, byId);
  const key = outfitKey(slots);
  const sc = scorePieces(pieces, { ...s.ctx, partial: false }, s.weights, key);
  const reasons = [...new Map(sc.reasons.sort((a, b) => b.weight - a.weight).map((r) => [r.text, r])).values()].slice(0, 3).map((r) => r.text);
  const conf = confidenceOfPieces(pieces);
  const warnings = [...new Set([...sc.warnings, ...extraWarnings])];
  if (conf < 0.6) warnings.push('Varias prendas tienen datos sin completar o estimados: la puntuación es aproximada');
  if (!reasons.length) reasons.push('Combinación sin incompatibilidades evidentes');
  return { key, slots, pieces, score: sc.total, breakdown: sc.breakdown, reasons, warnings, confidence: Math.round(conf * 100) / 100 };
}

/** Selecciona propuestas variadas: evita dos que compartan 2 de las 3 piezas principales. */
export function diversify(sorted: readonly Recommendation[], limit: number): Recommendation[] {
  const core = (r: Recommendation) => CORE_SLOTS.map((s) => r.slots[s]);
  const shared = (a: Recommendation, b: Recommendation) => core(a).filter((x, i) => x && x === core(b)[i]).length;
  const strict: Recommendation[] = [];
  for (const r of sorted) {
    if (strict.length >= limit) break;
    if (strict.every((o) => shared(o, r) < 2)) strict.push(r);
  }
  // Segunda vuelta: alternativas que cambian al menos una pieza principal (nunca el mismo núcleo).
  const relaxed: Recommendation[] = [];
  for (const r of sorted) {
    if (strict.length + relaxed.length >= limit) break;
    if (strict.includes(r)) continue;
    if ([...strict, ...relaxed].every((o) => shared(o, r) < 3)) relaxed.push(r);
  }
  return [...strict, ...relaxed];
}

function emptyResult(status: RecommendResult['status'], missing: MissingSlot[], notices: string[]): RecommendResult {
  return { status, outfits: [], missing, notices };
}

export function recommend(inventory: readonly Item[], req: RecommendRequest, context: RecommendContext = {}): RecommendResult {
  const now = context.now ?? new Date();
  const occ = getOccasion(req.occasionId);
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const exclude = new Set(req.exclude ?? []);
  const notices: string[] = [];
  const mustIds = [...new Set(req.mustInclude ?? [])].filter((id) => !exclude.has(id));
  const must = mustIds.map((id) => byId.get(id)).filter((x): x is Item => !!x);
  if (must.length < mustIds.length) notices.push('Alguna prenda fijada ya no existe en el armario.');
  const mandatory = new Set(must.map((m) => m.id));
  const prefs = buildPreferences(context, now);
  const s: Search = {
    occ,
    req,
    weights: context.weights ?? DEFAULT_WEIGHTS,
    ctx: { occ, weather: req.weather, season: seasonOf(now), prefs, mandatory, partial: true, now },
  };

  for (const m of must) {
    const why = !m.subcategoryId ? 'no tiene tipo de prenda' : ineligibility(m, occ, req.weather);
    if (why) notices.push(`Has fijado «${m.name}», que ${why}. Se incluye igualmente.`);
  }

  // Candidatas por posición (sin las fijadas).
  const eligible = inventory.filter((it) => !mandatory.has(it.id) && !exclude.has(it.id) && !ineligibility(it, occ, req.weather));
  const pool: Record<SlotOf, Item[]> = { base: [], mid: [], outer: [], bottom: [], footwear: [], accessory: [] };
  for (const it of eligible) for (const sl of slotsOf(it)) pool[sl].push(it);

  // Asignaciones posibles de las fijadas (una prenda de varias posiciones se prueba en cada una).
  const mustMain = must.filter((m) => slotsOf(m).some((x) => x !== 'accessory'));
  const mustAcc = must.filter((m) => slotsOf(m).includes('accessory')).map((m) => m.id);
  let assignments: Partial<Record<MainSlot, string>>[] = [{}];
  for (const m of mustMain) {
    const next: Partial<Record<MainSlot, string>>[] = [];
    for (const a of assignments) {
      for (const sl of slotsOf(m) as MainSlot[]) if (sl !== ('accessory' as never) && !a[sl]) next.push({ ...a, [sl]: m.id });
    }
    if (!next.length) {
      notices.push(`«${m.name}» ocupa la misma posición que otra prenda fijada: no se ha podido incluir.`);
      continue;
    }
    assignments = next.slice(0, 8);
  }

  // ¿Faltan piezas imprescindibles?
  const missing: MissingSlot[] = [];
  for (const r of REQUIRED) {
    const fixedSomewhere = assignments.every((a) => a[r.slot]);
    if (fixedSomewhere || pool[r.slot].length) continue;
    const unusable = inventory.filter((it) => slotsOf(it).includes(r.slot) && !eligible.includes(it)).length;
    missing.push({ slot: r.slot, label: r.label, unusable });
  }
  if (missing.length) return emptyResult('insufficient', missing, notices);

  // Preselección por posición (puntuación individual), para acotar la búsqueda.
  const pre = (it: Item) => {
    const occScore = pieceOccasionScore(it, occ) ?? 0.5;
    const seas = it.seasons?.length ? (it.seasons.includes(s.ctx.season) ? 1 : 0.45) : 0.75;
    const style = it.styles?.length ? (it.styles.some((x) => (occ.styles as readonly string[]).includes(x)) ? 1 : 0.4) : 0.5;
    return occScore * 0.45 + seas * 0.2 + style * 0.2 + (it.favorite ? 0.15 : 0) + 0.1 * prefs.itemAffinity(it.id);
  };
  const top = (sl: MainSlot) => [...pool[sl]].sort((a, b) => pre(b) - pre(a) || a.id.localeCompare(b.id)).slice(0, TOP_K[sl]);
  const cand: Record<MainSlot, Item[]> = { base: top('base'), mid: top('mid'), outer: top('outer'), bottom: top('bottom'), footwear: top('footwear') };

  const results = new Map<string, Recommendation>();
  const hot = req.weather.temp === 'hot';
  const cold = req.weather.temp === 'cold';
  const outerOptions = (fixed?: string): (Item | undefined)[] => {
    if (fixed) return [byId.get(fixed)];
    let list = cand.outer;
    if (hot) list = req.weather.rain ? list.filter((o) => warmthOf(o).value <= 2) : [];
    if (cold && list.length) return list;
    return [undefined, ...list];
  };
  if (cold && !pool.outer.length && assignments.every((a) => !a.outer)) notices.push('No hay prendas exteriores disponibles para el frío.');

  for (const a of assignments) {
    const used = (slots: OutfitSlots, it: Item) => Object.values(slots).includes(it.id);
    const opts = (sl: MainSlot): Item[] => (a[sl] ? [byId.get(a[sl]!)!] : cand[sl]);
    // 1) base × inferior
    let beam: OutfitSlots[] = [];
    for (const b of opts('base')) for (const bo of opts('bottom')) if (b.id !== bo.id) beam.push({ base: b.id, bottom: bo.id });
    const prune = (states: OutfitSlots[], n: number) =>
      states
        .map((st) => ({ st, sc: quick(piecesOf(st, byId), s) }))
        .sort((x, y) => y.sc - x.sc || outfitKey(x.st).localeCompare(outfitKey(y.st)))
        .slice(0, n)
        .map((x) => x.st);
    beam = prune(beam, BEAM.pair);
    // 2) calzado
    beam = prune(beam.flatMap((st) => opts('footwear').filter((f) => !used(st, f)).map((f) => ({ ...st, footwear: f.id }))), BEAM.footwear);
    // 3) capa intermedia (opcional)
    beam = prune(
      beam.flatMap((st) => {
        const base = byId.get(st.base!)!;
        const mids = (a.mid ? [byId.get(a.mid)!] : cand.mid).filter((m) => !used(st, m) && !(KNITS.has(sub(base)) && KNITS.has(sub(m))));
        return a.mid ? mids.map((m) => ({ ...st, mid: m.id })) : [st, ...mids.map((m) => ({ ...st, mid: m.id }))];
      }),
      BEAM.mid,
    );
    // 4) capa exterior (obligatoria con frío si existe, ninguna con calor salvo lluvia)
    beam = beam.flatMap((st) =>
      outerOptions(a.outer)
        .filter((o) => !o || !used(st, o))
        .map((o) => (o ? { ...st, outer: o.id } : st)),
    );
    beam = prune(beam, BEAM.outer);
    // 5) accesorios y puntuación final
    for (const st of beam) {
      const withAcc: OutfitSlots = { ...st, accessories: pickAccessories(st, pool.accessory, mustAcc, byId, s) };
      if (!withAcc.accessories!.length) delete withAcc.accessories;
      const extra = cold && !withAcc.outer && !pool.outer.length ? ['No tienes ninguna prenda exterior disponible para el frío'] : [];
      const rec = finalize(withAcc, byId, s, extra);
      const prev = results.get(rec.key);
      if (!prev || rec.score > prev.score) results.set(rec.key, rec);
    }
  }

  const all = [...results.values()].filter((r) => !prefs.isBlocked(r.key));
  const viable = all.filter((r) => r.score >= MIN_SCORE).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  if (!viable.length) return emptyResult('none-viable', [], notices);
  return { status: 'ok', outfits: diversify(viable, req.limit ?? 20), missing: [], notices };
}

/** Puntúa un conjunto concreto (p. ej. uno guardado) con las reglas actuales. */
export function evaluateOutfit(
  slots: OutfitSlots,
  inventory: readonly Item[],
  req: RecommendRequest,
  context: RecommendContext = {},
): Recommendation & { problems: string[] } {
  const now = context.now ?? new Date();
  const occ = getOccasion(req.occasionId);
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const problems: string[] = [];
  const ids = [...ORDER.map((sl) => slots[sl]), ...(slots.accessories ?? [])].filter((x): x is string => !!x);
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) problems.push('Una de sus prendas ya no existe');
    else if (it.status !== 'available') problems.push(`«${it.name}» no está disponible`);
  }
  const s: Search = {
    occ,
    req,
    weights: context.weights ?? DEFAULT_WEIGHTS,
    ctx: { occ, weather: req.weather, season: seasonOf(now), prefs: buildPreferences(context, now), mandatory: new Set(), partial: false, now },
  };
  return { ...finalize(slots, byId, s), problems: [...new Set(problems)] };
}

/** Alternativas para una posición, con el resto del conjunto fijo, ordenadas por puntuación. */
export function alternativesFor(
  slots: OutfitSlots,
  slot: MainSlot,
  inventory: readonly Item[],
  req: RecommendRequest,
  context: RecommendContext = {},
  limit = 8,
): { item?: Item; rec: Recommendation }[] {
  const occ = getOccasion(req.occasionId);
  const others = new Set(ORDER.filter((x) => x !== slot).map((x) => slots[x]).filter(Boolean) as string[]);
  const current = slots[slot];
  const options: (Item | undefined)[] = inventory.filter(
    (it) => it.id !== current && !others.has(it.id) && slotsOf(it).includes(slot) && !ineligibility(it, occ, req.weather),
  );
  if ((slot === 'mid' || slot === 'outer') && current) options.unshift(undefined); // «sin esta capa»
  return options
    .map((item) => {
      const next: OutfitSlots = { ...slots, [slot]: item?.id };
      if (!item) delete next[slot];
      return { item, rec: evaluateOutfit(next, inventory, req, context) };
    })
    .sort((a, b) => b.rec.score - a.rec.score || (a.item?.id ?? '').localeCompare(b.item?.id ?? ''))
    .slice(0, limit);
}

/** Elige la propuesta del día de forma determinista (varía de un día a otro entre las mejores). */
export function pickDaily(outfits: readonly Recommendation[], seed: string): Recommendation | undefined {
  if (!outfits.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return outfits[(h >>> 0) % Math.min(3, outfits.length)];
}

export { mainPieces };
