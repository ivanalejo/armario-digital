// Fase 3: Inicio con propuesta del día, Outfits (explorar/guardados/historial),
// combinar desde la ficha y Armario como catálogo. Datos sintéticos en formato v0.1.1.
import { expect, test, type Page, type Request } from '@playwright/test';
import { seedWardrobe, WARDROBE } from './seed';

async function readStore<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open('armario-digital');
        req.onsuccess = () => {
          const r = req.result.transaction(name).objectStore(name).getAll();
          r.onsuccess = () => {
            req.result.close();
            resolve(r.result as T[]);
          };
          r.onerror = () => reject(r.error);
        };
      }),
    store,
  );
}

async function openWithWardrobe(page: Page, opts?: Parameters<typeof seedWardrobe>[2], items = WARDROBE) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
  const ids = await seedWardrobe(page, items, opts);
  await page.reload();
  return ids;
}

const daily = (page: Page) => page.getByTestId('daily-outfit');

test('Inicio sin prendas: estado vacío útil y ninguna propuesta inventada', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('outfit-empty')).toContainText('vacío');
  await expect(daily(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Añadir prenda' })).toBeVisible();
});

test('Inicio: outfit del día con fotos reales del armario, enlaces a las fichas y explicación', async ({ page }) => {
  const ids = await openWithWardrobe(page);
  await expect(daily(page)).toBeVisible();
  const imgs = daily(page).locator('.board__img');
  expect(await imgs.count()).toBeGreaterThanOrEqual(3);
  await expect.poll(() => imgs.first().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(daily(page).locator('.reasons li').first()).toBeVisible();
  const key = (await daily(page).getAttribute('data-key'))!;
  for (const part of key.split('|')) {
    const id = part.split(':')[1]!;
    if (id !== '-') expect(ids).toContain(id);
  }
  // Una pieza abre su ficha
  await daily(page).locator('.board__link').first().click();
  await expect(page.getByTestId('combine-item')).toBeVisible();
});

test('«Otra» cambia la propuesta y la elección se mantiene al reabrir', async ({ page }) => {
  await openWithWardrobe(page);
  const first = await daily(page).getAttribute('data-key');
  await page.getByTestId('next-outfit').click();
  await expect(daily(page)).not.toHaveAttribute('data-key', first!);
  const second = await daily(page).getAttribute('data-key');
  await page.reload();
  await expect(daily(page)).toHaveAttribute('data-key', second!);
});

test('guardar, valorar, «me lo pongo» y consultar guardados e historial', async ({ page }) => {
  await openWithWardrobe(page);
  const key = await daily(page).getAttribute('data-key');
  await daily(page).getByTestId('save-outfit').click();
  await expect(daily(page).getByTestId('save-outfit')).toHaveText(/Guardado/);
  await expect(daily(page)).toHaveAttribute('data-key', key!); // guardar no cambia la propuesta del día
  await daily(page).getByTestId('wear-outfit').click();
  await expect(daily(page).getByTestId('wear-outfit')).toHaveText(/Puesto hoy/);
  await expect(page.getByRole('heading', { name: 'Tus conjuntos' })).toBeVisible();

  await page.goto('./#/outfits/guardados');
  await expect(page.getByTestId('saved-outfit')).toHaveCount(1);
  await page.getByRole('button', { name: '4 estrellas' }).click();
  await expect.poll(async () => (await readStore<{ rating?: number; key?: string }>(page, 'outfits'))[0]?.rating).toBe(4);
  expect((await readStore<{ key?: string }>(page, 'outfits'))[0]?.key).toBe(key);

  await page.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByTestId('wear-entry')).toHaveCount(1);
  const kinds = (await readStore<{ kind: string }>(page, 'feedback')).map((f) => f.kind).sort();
  expect(kinds).toEqual(['favorite', 'rating', 'worn']);
});

test('descartar («no me gusta») cambia la propuesta y no vuelve a salir', async ({ page }) => {
  await openWithWardrobe(page);
  const key = (await daily(page).getAttribute('data-key'))!;
  await daily(page).getByTestId('dismiss-outfit').click();
  await daily(page).getByRole('button', { name: 'No me gusta' }).click();
  await expect(daily(page)).not.toHaveAttribute('data-key', key);
  await page.goto('./#/outfits');
  await expect(page.getByTestId('outfit-card').first()).toBeVisible();
  const keys = await page.getByTestId('outfit-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
  expect(keys).not.toContain(key);
});

test('las prendas no disponibles nunca aparecen en las propuestas', async ({ page }) => {
  // La camisa (índice 2) y las zapatillas (índice 6) están para lavar.
  const ids = await openWithWardrobe(page, { status: { 2: 'laundry', 6: 'laundry' } });
  await page.goto('./#/outfits');
  await expect(page.getByTestId('outfit-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver más propuestas' }).click().catch(() => {});
  const keys = await page.getByTestId('outfit-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-key') ?? ''));
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) {
    expect(k).not.toContain(ids[2]!);
    expect(k).not.toContain(ids[6]!);
  }
});

test('sin calzado: explica qué falta en lugar de proponer algo incompleto', async ({ page }) => {
  await openWithWardrobe(page, {}, WARDROBE.filter((i) => i.cat !== 'footwear'));
  await expect(page.getByTestId('outfit-empty')).toContainText('calzado');
  await expect(daily(page)).toHaveCount(0);
});

test('combinar una prenda desde su ficha: todas las propuestas la incluyen', async ({ page }) => {
  const ids = await openWithWardrobe(page);
  const shirt = ids[2]!;
  await page.goto(`./#/prenda/${shirt}`);
  await page.getByTestId('combine-item').click();
  await expect(page.getByText(/Combinando con/)).toBeVisible();
  const keys = await page.getByTestId('outfit-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-key') ?? ''));
  expect(keys.length).toBeGreaterThan(0);
  for (const k of keys) expect(k).toContain(shirt);
});

test('cambiar una pieza recalcula la propuesta', async ({ page }) => {
  await openWithWardrobe(page);
  const key = (await daily(page).getAttribute('data-key'))!;
  await daily(page).locator('.board__swap').first().click();
  await page.locator('.alt-row').first().click();
  await expect(daily(page)).not.toHaveAttribute('data-key', key);
  await expect(daily(page).getByText('Modificado')).toBeVisible();
});

test('Armario sigue siendo el catálogo: accesos de gestión y filtros', async ({ page }) => {
  await openWithWardrobe(page, { status: { 0: 'laundry' } });
  await page.getByRole('link', { name: 'Armario', exact: true }).click();
  await expect(page.getByTestId('item-card')).toHaveCount(WARDROBE.length);
  // El nombre se ve dentro de la tarjeta (en v0.1.1 la foto lo tapaba).
  const inside = await page.locator('.card__name').first().evaluate((el) => el.getBoundingClientRect().bottom <= el.closest('.card')!.getBoundingClientRect().bottom);
  expect(inside).toBe(true);
  await page.getByRole('button', { name: /Por revisar · 1/ }).click();
  await expect(page.getByTestId('item-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Por revisar · 1/ }).click();
  await page.getByRole('button', { name: /No disponibles · 1/ }).click();
  await expect(page.getByTestId('item-card')).toHaveCount(1);
});

test('privacidad: en todo el flujo de outfits solo hay GET al propio origen', async ({ page }) => {
  const seen: { url: string; method: string }[] = [];
  page.on('request', (r: Request) => seen.push({ url: r.url(), method: r.method() }));
  await openWithWardrobe(page);
  await daily(page).getByTestId('save-outfit').click();
  await page.getByTestId('next-outfit').click();
  await daily(page).getByTestId('wear-outfit').click();
  await page.goto('./#/outfits');
  await page.getByRole('button', { name: 'Reunión importante' }).click();
  await page.getByRole('button', { name: 'Lluvia' }).click();
  await page.goto('./#/outfits/guardados');
  await page.getByRole('button', { name: '5 estrellas' }).click();
  await page.goto('./#/outfits/historial');
  const external = seen.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:') && (!r.url.startsWith('http://localhost:4173') || r.method !== 'GET'));
  expect(external).toEqual([]);
});
