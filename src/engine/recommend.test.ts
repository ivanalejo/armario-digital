import { describe, expect, it } from 'vitest';
import type { FeedbackEvent, Item } from '../domain/schema';
import { getSubcategory } from '../domain/vocabulary';
import { mk, randomWardrobe, resetIds, rng, sampleWardrobe } from '../test/engineFixtures';
import {
  alternativesFor,
  evaluateOutfit,
  MIN_SCORE,
  outfitKey,
  pickDaily,
  recommend,
  type Recommendation,
  type RecommendRequest,
  type Weather,
} from './index';

const NOW = new Date('2026-10-12T09:00:00');
const MILD: Weather = { temp: 'mild', rain: false };
const req = (occasionId: string, weather: Weather = MILD, extra: Partial<RecommendRequest> = {}): RecommendRequest => ({ occasionId, weather, ...extra });
const ids = (r: Recommendation) => r.pieces.map((p) => p.item.id);
const subs = (r: Recommendation) => r.pieces.map((p) => p.item.subcategoryId);
const run = (items: Item[], rq: RecommendRequest, ctx = {}) => recommend(items, rq, { now: NOW, ...ctx });

describe('recomendación básica', () => {
  const w = sampleWardrobe();
  const res = run(w, req('casual'));

  it('genera varias propuestas completas solo con prendas del inventario', () => {
    expect(res.status).toBe('ok');
    expect(res.outfits.length).toBeGreaterThanOrEqual(3);
    const inv = new Set(w.map((i) => i.id));
    for (const o of res.outfits) {
      expect(o.slots.base && o.slots.bottom && o.slots.footwear).toBeTruthy();
      for (const id of ids(o)) expect(inv.has(id)).toBe(true);
      expect(new Set(ids(o)).size).toBe(ids(o).length);
      expect(o.score).toBeGreaterThanOrEqual(MIN_SCORE);
      expect(o.reasons.length).toBeGreaterThan(0);
      expect(o.reasons.length).toBeLessThanOrEqual(3);
    }
  });

  it('es determinista', () => {
    expect(run(w, req('casual')).outfits.map((o) => o.key)).toEqual(res.outfits.map((o) => o.key));
  });

  it('las 5 primeras no comparten 2 de las 3 piezas principales (armario con variedad suficiente)', () => {
    resetIds();
    const big = [
      ...(['white', 'navy', 'grey', 'black', 'olive', 'beige'] as const).map((c) => mk('tshirt', c, { formality: { min: 2, max: 2 }, styles: ['casual'] })),
      ...(['navy', 'beige', 'black', 'grey', 'olive'] as const).map((c) => mk('chinos', c, { formality: { min: 2, max: 3 }, styles: ['casual'] })),
      ...(['white', 'black', 'brown', 'grey', 'navy'] as const).map((c) => mk('sneakers', c, { formality: { min: 2, max: 2 }, styles: ['casual'] })),
    ];
    const top = run(big, req('casual')).outfits.slice(0, 5);
    expect(top).toHaveLength(5);
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) {
        const shared = (['base', 'bottom', 'footwear'] as const).filter((s) => top[i]!.slots[s] === top[j]!.slots[s]).length;
        expect(shared).toBeLessThan(2);
      }
  });

  it('no repite nunca el mismo núcleo (base + inferior + calzado)', () => {
    const cores = res.outfits.map((o) => `${o.slots.base}|${o.slots.bottom}|${o.slots.footwear}`);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it('ordena las propuestas estrictamente variadas por puntuación', () => {
    const scores = res.outfits.slice(0, 3).map((o) => o.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('prendas obligatorias', () => {
  it('aparecen en todas las propuestas', () => {
    const w = sampleWardrobe();
    const shirt = w.find((i) => i.subcategoryId === 'shirt')!;
    const res = run(w, req('casual', MILD, { mustInclude: [shirt.id] }));
    expect(res.outfits.length).toBeGreaterThan(0);
    for (const o of res.outfits) expect(ids(o)).toContain(shirt.id);
  });

  it('una prenda que puede ir de base o de capa intermedia se coloca en alguna de las dos', () => {
    const w = sampleWardrobe();
    const sweater = w.find((i) => i.subcategoryId === 'sweater')!;
    const res = run(w, req('casual', { temp: 'cold', rain: false }, { mustInclude: [sweater.id] }));
    for (const o of res.outfits) expect([o.slots.base, o.slots.mid]).toContain(sweater.id);
  });

  it('se incluye aunque no esté disponible o no encaje, avisando', () => {
    const w = sampleWardrobe();
    const tee = w.find((i) => i.subcategoryId === 'tshirt')!;
    tee.status = 'laundry';
    const res = run(w, req('formal-event', MILD, { mustInclude: [tee.id] }));
    expect(res.notices.join(' ')).toMatch(/Has fijado/);
    for (const o of res.outfits) expect(ids(o)).toContain(tee.id);
  });

  it('dos fijadas para la misma posición: avisa y usa la primera', () => {
    const w = sampleWardrobe();
    const [j, c] = [w.find((i) => i.subcategoryId === 'jeans')!, w.find((i) => i.subcategoryId === 'chinos')!];
    const res = run(w, req('casual', MILD, { mustInclude: [j.id, c.id] }));
    expect(res.notices.join(' ')).toMatch(/misma posición/);
    for (const o of res.outfits) expect(o.slots.bottom).toBe(j.id);
  });
});

describe('disponibilidad', () => {
  it('nunca propone prendas no disponibles ni borradores', () => {
    const w = sampleWardrobe();
    const off = new Set<string>();
    for (const [i, st] of [[0, 'laundry'], [5, 'stored'], [8, 'repair'], [2, 'lent'], [6, 'retired']] as const) {
      w[i]!.status = st;
      off.add(w[i]!.id);
    }
    w[3]!.isDraft = true;
    off.add(w[3]!.id);
    const res = run(w, req('casual'));
    for (const o of res.outfits) for (const id of ids(o)) expect(off.has(id)).toBe(false);
  });
});

describe('clima', () => {
  it('con lluvia prefiere exterior impermeable y evita sandalias; avisa del ante', () => {
    const w = [...sampleWardrobe(), mk('sandals', 'brown', { formality: { min: 1, max: 2 } })];
    const res = run(w, req('casual', { temp: 'mild', rain: true }));
    const best = res.outfits[0]!;
    expect(best.pieces.find((p) => p.slot === 'outer')?.item.waterproof).toBe(true);
    for (const o of res.outfits) expect(subs(o)).not.toContain('sandals');
    const suede = res.outfits.find((o) => o.pieces.some((p) => p.item.material === 'ante'));
    if (suede) expect(suede.warnings.join(' ')).toMatch(/ante/);
  });

  it('con frío exige capa exterior si existe y descarta cortos y sandalias', () => {
    const w = [...sampleWardrobe(), mk('shorts', 'beige', {}), mk('sandals', 'black', {})];
    const res = run(w, req('casual', { temp: 'cold', rain: false }));
    expect(res.outfits.length).toBeGreaterThan(0);
    for (const o of res.outfits) {
      expect(o.slots.outer).toBeTruthy();
      expect(subs(o)).not.toContain('shorts');
      expect(subs(o)).not.toContain('sandals');
    }
  });

  it('con frío y sin prendas exteriores propone igualmente y lo avisa', () => {
    const w = sampleWardrobe().filter((i) => i.categoryId !== 'outerwear');
    const res = run(w, req('casual', { temp: 'cold', rain: false }));
    expect(res.status).toBe('ok');
    expect(res.notices.join(' ')).toMatch(/exteriores/);
  });

  it('con calor no propone abrigos ni capa exterior', () => {
    const res = run(sampleWardrobe(), req('casual', { temp: 'hot', rain: false }));
    for (const o of res.outfits) {
      expect(o.slots.outer).toBeUndefined();
      expect(subs(o)).not.toContain('coat');
    }
  });
});

describe('formalidad y ocasión', () => {
  it('evento formal: sin zapatillas, vaqueros ni camisetas', () => {
    const res = run(sampleWardrobe(), req('formal-event'));
    expect(res.status).toBe('ok');
    for (const o of res.outfits) for (const s of ['sneakers', 'jeans', 'tshirt', 'polo']) expect(subs(o)).not.toContain(s);
    expect(subs(res.outfits[0]!)).toContain('shoes');
  });

  it('reunión importante: nada de sudaderas y pocas propuestas informales', () => {
    const w = [...sampleWardrobe(), mk('hoodie', 'grey', { formality: { min: 1, max: 2 } })];
    const res = run(w, req('office-formal'));
    for (const o of res.outfits) expect(subs(o)).not.toContain('hoodie');
    expect(res.outfits[0]!.breakdown.occasion).toBeGreaterThan(0.7);
  });

  it('deporte: sin camisas ni zapatos de vestir', () => {
    const w = [...sampleWardrobe(), mk('sport-top', 'black', { formality: { min: 1, max: 1 }, styles: ['sporty'] }), mk('sport-shoes', 'grey', { formality: { min: 1, max: 1 }, styles: ['sporty'] }), mk('joggers', 'black', { formality: { min: 1, max: 2 }, styles: ['sporty'] })];
    const res = run(w, req('sport'));
    for (const o of res.outfits) for (const s of ['shirt', 'shoes', 'blazer', 'trousers']) expect(subs(o)).not.toContain(s);
    expect(subs(res.outfits[0]!)).toEqual(expect.arrayContaining(['sport-top', 'sport-shoes']));
  });

  it('evento formal sin calzado adecuado: indica qué falta', () => {
    const w = sampleWardrobe().filter((i) => i.subcategoryId !== 'shoes');
    const res = run(w, req('formal-event'));
    expect(res.status).toBe('insufficient');
    expect(res.missing.map((m) => m.slot)).toEqual(['footwear']);
    expect(res.missing[0]!.unusable).toBeGreaterThan(0);
  });
});

describe('atributos desconocidos y estimados', () => {
  it('un armario con datos mínimos (tipo + color) sigue generando propuestas, con aviso de confianza', () => {
    resetIds();
    const w = [mk('tshirt', 'white'), mk('shirt', 'light-blue'), mk('jeans', 'navy'), mk('chinos', 'beige'), mk('sneakers', 'white'), mk('boots', 'brown')];
    const res = run(w, req('casual'));
    expect(res.status).toBe('ok');
    expect(res.outfits.length).toBeGreaterThanOrEqual(2);
    expect(res.outfits[0]!.confidence).toBeLessThan(0.6);
    expect(res.outfits[0]!.warnings.join(' ')).toMatch(/aproximada/);
  });

  it('una formalidad estimada no descarta; la confirmada sí', () => {
    resetIds();
    const base = [mk('jeans', 'navy'), mk('sneakers', 'white')];
    const est = mk('shirt', 'white', { formality: { min: 5, max: 5 }, estimated: ['formality'] });
    const conf = mk('shirt', 'blue', { formality: { min: 5, max: 5 } });
    expect(run([...base, est], req('casual')).status).toBe('ok');
    expect(run([...base, conf], req('casual')).status).toBe('insufficient');
  });

  it('sin color conocido la prenda puntúa neutro, no se excluye', () => {
    resetIds();
    const w = [mk('tshirt', undefined), mk('jeans', 'navy'), mk('sneakers', 'white')];
    const res = run(w, req('casual'));
    expect(res.status).toBe('ok');
    expect(res.outfits[0]!.breakdown.color).toBeGreaterThan(0.5);
  });
});

describe('siluetas', () => {
  it('oversize arriba equilibra mejor con tapered que con baggy (fuera del estilo urbano)', () => {
    resetIds();
    const top = mk('tshirt', 'white', { cut: { fit: 'oversized' }, styles: ['casual'] });
    const tapered = mk('jeans', 'navy', { cut: { leg: 'tapered' }, styles: ['casual'] });
    const baggy = mk('jeans', 'grey', { cut: { leg: 'baggy' }, styles: ['casual'] });
    const shoe = mk('sneakers', 'white', { styles: ['casual'] });
    const w = [top, tapered, baggy, shoe];
    const a = evaluateOutfit({ base: top.id, bottom: tapered.id, footwear: shoe.id }, w, req('casual'), { now: NOW });
    const b = evaluateOutfit({ base: top.id, bottom: baggy.id, footwear: shoe.id }, w, req('casual'), { now: NOW });
    expect(a.breakdown.style).toBeGreaterThan(b.breakdown.style);
    expect(a.reasons.join(' ')).toMatch(/Volúmenes equilibrados/);
    expect(b.warnings.join(' ')).toMatch(/volumen/);
  });
});

describe('inventarios pequeños y vacíos', () => {
  it('inventario vacío: indica las tres piezas que faltan', () => {
    const res = run([], req('casual'));
    expect(res.status).toBe('insufficient');
    expect(res.missing.map((m) => m.slot)).toEqual(['base', 'bottom', 'footwear']);
  });

  it('una prenda de cada: una sola propuesta', () => {
    resetIds();
    const res = run([mk('tshirt', 'white'), mk('jeans', 'navy'), mk('sneakers', 'white')], req('casual'));
    expect(res.outfits).toHaveLength(1);
  });

  it('sin calzado disponible: lo indica, contando el que no se puede usar', () => {
    resetIds();
    const res = run([mk('tshirt', 'white'), mk('jeans', 'navy'), mk('sneakers', 'white', { status: 'laundry' })], req('casual'));
    expect(res.status).toBe('insufficient');
    expect(res.missing).toEqual([expect.objectContaining({ slot: 'footwear', unusable: 1 })]);
  });

  it('si ninguna combinación es aceptable no muestra ninguna', () => {
    resetIds();
    const w = [
      // Tres estampados llamativos, tres colores de acento y estilos que chocan.
      mk('tshirt', 'red', { pattern: 'graphic', styles: ['classic'], formality: { min: 2, max: 2 } }),
      mk('shorts', 'green', { pattern: 'checks', styles: ['sporty'], formality: { min: 2, max: 2 } }),
      mk('sneakers', 'mustard', { pattern: 'floral', styles: ['outdoor'], formality: { min: 2, max: 2 } }),
    ];
    const res = run(w, req('night-out', { temp: 'mild', rain: true }));
    expect(res.status).toBe('none-viable');
    expect(res.outfits).toEqual([]);
  });
});

describe('preferencias y descartes', () => {
  it('un conjunto descartado («no me gusta») no vuelve a aparecer; «hoy no» solo se oculta ese día', () => {
    const w = sampleWardrobe();
    const first = run(w, req('casual')).outfits[0]!;
    const ev = (reason: FeedbackEvent['reason'], at = NOW.toISOString()): FeedbackEvent => ({
      id: 'fb_test000001', at, target: 'outfit', kind: 'dismiss', itemIds: ids(first), outfit: { slots: first.slots, key: first.key }, source: 'recommender', ...(reason ? { reason } : {}),
    });
    expect(run(w, req('casual'), { feedback: [ev(undefined)] }).outfits.map((o) => o.key)).not.toContain(first.key);
    expect(run(w, req('casual'), { feedback: [ev('not-today')] }).outfits.map((o) => o.key)).not.toContain(first.key);
    const yesterday = new Date(NOW.getTime() - 86_400_000).toISOString();
    expect(run(w, req('casual'), { feedback: [ev('not-today', yesterday)] }).outfits.map((o) => o.key)).toContain(first.key);
  });

  it('los favoritos suman sin dominar', () => {
    const w = sampleWardrobe();
    const plain = run(w, req('casual')).outfits;
    const target = plain[plain.length - 1]!;
    const pieceId = target.slots.base!;
    w.find((i) => i.id === pieceId)!.favorite = true;
    const after = run(w, req('casual')).outfits.find((o) => o.key === target.key);
    if (after) expect(after.breakdown.preference).toBeGreaterThan(target.breakdown.preference);
  });

  it('lo usado en los últimos días baja un poco, salvo si es obligatorio', () => {
    const w = sampleWardrobe();
    const tee = w[0]!;
    const wear = [{ id: 'wear_test00001', date: '2026-10-11', itemIds: [tee.id] }];
    const slots = { base: tee.id, bottom: w[5]!.id, footwear: w[8]!.id };
    const before = evaluateOutfit(slots, w, req('casual'), { now: NOW });
    const after = evaluateOutfit(slots, w, req('casual'), { now: NOW, wearLog: wear });
    expect(after.breakdown.preference).toBeLessThan(before.breakdown.preference);
    expect(before.score - after.score).toBeLessThan(3); // solo reordena, no hunde
  });
});

describe('sustituir una pieza y reevaluar', () => {
  const w = sampleWardrobe();
  const best = run(w, req('casual')).outfits[0]!;

  it('ofrece alternativas del mismo tipo de posición, ordenadas y sin la actual', () => {
    const alts = alternativesFor(best.slots, 'footwear', w, req('casual'), { now: NOW });
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      expect(a.item).toBeDefined();
      expect(getSubcategory(a.item!.subcategoryId!)?.slots).toContain('footwear');
      expect(a.item!.id).not.toBe(best.slots.footwear);
    }
    const sc = alts.map((a) => a.rec.score);
    expect([...sc].sort((a, b) => b - a)).toEqual(sc);
  });

  it('las capas opcionales permiten quitarlas', () => {
    const withOuter = run(w, req('casual', { temp: 'cold', rain: false })).outfits[0]!;
    const alts = alternativesFor({ ...withOuter.slots, mid: withOuter.slots.mid ?? w.find((i) => i.subcategoryId === 'blazer')!.id }, 'mid', w, req('casual'), { now: NOW });
    expect(alts.some((a) => a.item === undefined)).toBe(true);
  });

  it('evaluar un conjunto con una prenda borrada lo indica', () => {
    const r = evaluateOutfit({ ...best.slots, base: 'itm_borrada0001' }, w, req('casual'), { now: NOW });
    expect(r.problems.join(' ')).toMatch(/ya no existe/);
  });
});

describe('accesorios', () => {
  it('cinturón a juego con el calzado y bufanda solo con frío', () => {
    const w = sampleWardrobe();
    const cold = run(w, req('smart-casual', { temp: 'cold', rain: false })).outfits;
    const withBelt = cold.find((o) => o.pieces.some((p) => p.item.subcategoryId === 'belt') && o.pieces.some((p) => p.item.subcategoryId === 'boots'));
    if (withBelt) expect(withBelt.pieces.find((p) => p.item.subcategoryId === 'belt')!.item.colors?.primary).toBe('brown');
    expect(cold.some((o) => subs(o).includes('scarf'))).toBe(true);
    const mild = run(w, req('smart-casual')).outfits;
    for (const o of mild) expect(subs(o)).not.toContain('scarf');
  });
});

describe('outfit del día', () => {
  it('es estable para la misma semilla y elige entre las mejores', () => {
    const outs = run(sampleWardrobe(), req('casual')).outfits;
    expect(pickDaily(outs, '2026-10-12|casual')).toBe(pickDaily(outs, '2026-10-12|casual'));
    expect(outs.slice(0, 3)).toContain(pickDaily(outs, '2026-10-13|casual'));
    expect(pickDaily([], 'x')).toBeUndefined();
  });

  it('outfitKey ignora los accesorios', () => {
    expect(outfitKey({ base: 'a', bottom: 'b', footwear: 'c', accessories: ['d'] })).toBe(outfitKey({ base: 'a', bottom: 'b', footwear: 'c' }));
  });
});

describe('invariantes con armarios aleatorios', () => {
  const occasions = ['casual', 'smart-casual', 'office', 'office-formal', 'night-out', 'formal-event', 'sport'];
  const temps = ['hot', 'mild', 'cold'] as const;

  it('1 000 armarios × peticiones aleatorias: nunca falla y respeta las reglas', () => {
    const r = rng(20261012);
    for (let n = 0; n < 1000; n++) {
      resetIds();
      const w = randomWardrobe(r, 3 + Math.floor(r() * 60));
      const byId = new Map(w.map((i) => [i.id, i]));
      const must = r() < 0.3 && w.length ? [w[Math.floor(r() * w.length)]!.id] : [];
      const rq = req(occasions[Math.floor(r() * occasions.length)]!, { temp: temps[Math.floor(r() * 3)]!, rain: r() < 0.3 }, { mustInclude: must });
      const res = recommend(w, rq, { now: NOW });
      expect(['ok', 'insufficient', 'none-viable']).toContain(res.status);
      if (res.status !== 'ok') expect(res.outfits).toEqual([]);
      for (const o of res.outfits) {
        expect(o.score).toBeGreaterThanOrEqual(MIN_SCORE);
        expect(o.score).toBeLessThanOrEqual(100);
        const list = ids(o);
        expect(new Set(list).size).toBe(list.length);
        for (const id of must) if (byId.get(id)?.subcategoryId) expect(list).toContain(id);
        for (const p of o.pieces) {
          const it = byId.get(p.item.id)!;
          expect(it).toBeDefined();
          if (!must.includes(it.id)) {
            expect(it.status).toBe('available');
            expect(it.isDraft).toBe(false);
          }
          const allowed = getSubcategory(it.subcategoryId!)!.slots as readonly string[];
          expect(allowed).toContain(p.slot);
        }
      }
    }
  });

  it('300 prendas: responde en menos de 1 s (en Node)', () => {
    const r = rng(7);
    resetIds();
    const w = randomWardrobe(r, 300).map((i) => ({ ...i, status: 'available' as const, isDraft: false }));
    const t0 = performance.now();
    const res = recommend(w, req('casual'), { now: NOW });
    const ms = performance.now() - t0;
    expect(res.status).toBe('ok');
    expect(ms).toBeLessThan(1000);
    const t1 = performance.now();
    alternativesFor(res.outfits[0]!.slots, 'base', w, req('casual'), { now: NOW });
    expect(performance.now() - t1).toBeLessThan(300);
  });
});
