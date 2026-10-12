// Pruebas de robustez: reproducen los mecanismos del fallo visto en Android
// (operaciones que no terminan y consultas bloqueadas) y verifican la recuperación.
import { chromium, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeJpegWithGps, makeImage, readDb } from './helpers';

const FAST = { image: 2500, db: 2500, slow: 1500 };

async function fastTimeouts(page: Page) {
  await page.addInitScript((t) => {
    (globalThis as unknown as { __ARMARIO_TIMEOUTS__: unknown }).__ARMARIO_TIMEOUTS__ = t;
  }, FAST);
}

/** Crea una prenda mínima desde la UI con la foto indicada. */
async function createItem(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, input: 'input-gallery' | 'input-camera' = 'input-gallery') {
  await page.goto('./#/nueva');
  await page.getByTestId(input).setInputFiles(file);
  await page.getByRole('button', { name: 'Sin recortar' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 1/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Camiseta', exact: true }).click();
  await page.getByRole('button', { name: 'Blanco', exact: true }).first().click();
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('delete-item')).toBeVisible({ timeout: 20_000 });
}

/** Desde otra pestaña del mismo origen, mantiene abierta una transacción de escritura sobre `stores`. */
async function holdLock(page: Page, stores: string[]) {
  await page.evaluate((names) => {
    const w = window as unknown as { __release: boolean };
    w.__release = false;
    const req = indexedDB.open('armario-digital');
    req.onsuccess = () => {
      const tx = req.result.transaction(names, 'readwrite');
      const store = tx.objectStore(names[0]!);
      const spin = () => {
        if (w.__release) return;
        store.count().onsuccess = spin; // peticiones encadenadas: la transacción nunca termina
      };
      spin();
    };
  }, stores);
}

test('Inicio no se queda en «Cargando…» si la base de datos no responde, y se recupera al liberarse', async ({ browser }) => {
  const context = await browser.newContext();
  const holder = await context.newPage();
  await holder.goto('./');
  await expect(holder.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
  await holdLock(holder, ['items']);

  const page = await context.newPage();
  await fastTimeouts(page);
  await page.goto('./');
  await expect(page.getByText(/no responde/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /diagnóstico/i }).first()).toBeVisible();

  // Al liberarse, la consulta pendiente termina sola; si no, «Reintentar» la relanza.
  await holder.evaluate(() => { (window as unknown as { __release: boolean }).__release = true; });
  const retry = page.getByRole('button', { name: 'Reintentar' }).first();
  // Puede recuperarse sola entre la comprobación y el clic: el clic no debe esperar indefinidamente.
  if (await retry.isVisible()) await retry.click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Tu outfit de hoy' })).toBeVisible();
  await expect(page.getByText(/no responde/i)).toHaveCount(0);
  await context.close();
});

test('«Reintentar» con la base de datos aún bloqueada y liberarla después: se recupera sola', async ({ browser }) => {
  const context = await browser.newContext();
  const holder = await context.newPage();
  await holder.goto('./');
  await expect(holder.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
  await holdLock(holder, ['items']);
  const page = await context.newPage();
  await fastTimeouts(page);
  await page.goto('./');
  await expect(page.getByText(/no responde/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Reintentar' }).first().click();
  await page.waitForTimeout(300);
  await holder.evaluate(() => { (window as unknown as { __release: boolean }).__release = true; });
  await expect(page.getByRole('heading', { name: 'Tu outfit de hoy' })).toBeVisible();
  await context.close();
});

test('si el guardado no termina, se aborta, se informa y se puede reintentar sin perder el formulario', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await fastTimeouts(page);
  await page.goto('./#/nueva');
  await page.getByTestId('input-gallery').setInputFiles({ name: 'g.jpg', mimeType: 'image/jpeg', buffer: await makeJpegWithGps(page, 1200, 1600) });
  await page.getByRole('button', { name: 'Sin recortar' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Camiseta', exact: true }).click();
  await page.getByRole('button', { name: 'Blanco', exact: true }).first().click();

  const holder = await context.newPage();
  await holder.goto('./#/ajustes');
  await holdLock(holder, ['blobs']);

  await page.getByTestId('save-item').click();
  await expect(page.getByRole('alert')).toContainText(/no ha respondido|no se ha guardado/i, { timeout: 15_000 });
  await expect(page.getByTestId('save-item')).toBeEnabled();
  // nada a medias (se lee solo `items`, que no está bloqueada)
  expect(await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('armario-digital');
    r.onsuccess = () => { const c = r.result.transaction('items').objectStore('items').count(); c.onsuccess = () => { r.result.close(); res(c.result); }; };
  }))).toBe(0);

  await holder.evaluate(() => { (window as unknown as { __release: boolean }).__release = true; });
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('delete-item')).toBeVisible();
  const db = await readDb(page);
  expect(db.items).toHaveLength(1);
  expect(db.blobs).toHaveLength(2);
  await context.close();
});

test('si la codificación de la imagen se cuelga, muestra error, libera la interfaz y permite reintentar', async ({ page, context }) => {
  // La imagen de prueba se genera en otra pestaña: en esta, la codificación estará «colgada».
  const gen = await context.newPage();
  await gen.goto('./');
  const jpeg = await makeJpegWithGps(gen, 1200, 1600);
  await gen.close();
  await fastTimeouts(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __hang: boolean };
    w.__hang = true;
    const orig = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (this: OffscreenCanvas, ...a: Parameters<typeof orig>) {
      return w.__hang ? new Promise<Blob>(() => {}) : orig.apply(this, a);
    };
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, ...a: Parameters<typeof origToBlob>) {
      if (!w.__hang) origToBlob.apply(this, a);
    };
  });
  await page.goto('./#/nueva');
  await page.getByTestId('input-gallery').setInputFiles({ name: 'g.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByRole('button', { name: 'Sin recortar' }).click();
  await expect(page.getByText(/tardado demasiado/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Procesando…')).toHaveCount(0);
  await expect(page.getByTestId('save-item')).toBeEnabled();

  await page.evaluate(() => { (window as unknown as { __hang: boolean }).__hang = false; });
  await page.getByRole('button', { name: 'Reintentar foto' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 1/ })).toBeVisible();
});

test('un fallo de escritura en IndexedDB se informa, no deja datos parciales y no bloquea la app', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __failBlobs: boolean };
    w.__failBlobs = true;
    const orig = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...a: Parameters<typeof orig>) {
      if (w.__failBlobs && this.name === 'blobs') throw new DOMException('Simulado: sin espacio', 'QuotaExceededError');
      return orig.apply(this, a);
    };
  });
  await page.goto('./#/nueva');
  await page.getByTestId('input-camera').setInputFiles({ name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeJpegWithGps(page, 1600, 1200) });
  await page.getByRole('button', { name: 'Sin recortar' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Camiseta', exact: true }).click();
  await page.getByRole('button', { name: 'Blanco', exact: true }).first().click();
  await page.getByTestId('save-item').click();
  await expect(page.getByRole('alert')).toContainText(/espacio|no se ha guardado/i);
  const db = await readDb(page);
  expect(db.items).toHaveLength(0);
  expect(db.images).toHaveLength(0);

  await page.evaluate(() => { (window as unknown as { __failBlobs: boolean }).__failBlobs = false; });
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('delete-item')).toBeVisible();
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
});

test('acepta fotos de cámara y galería de distintos tamaños y formatos', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./');
  const cases: { name: string; mime: string; w: number; h: number; input: 'input-gallery' | 'input-camera' }[] = [
    { name: 'IMG_12mp.jpg', mime: 'image/jpeg', w: 4000, h: 3000, input: 'input-camera' },
    { name: 'IMG_48mp.jpg', mime: 'image/jpeg', w: 8000, h: 6000, input: 'input-gallery' },
    { name: 'pequena.jpg', mime: 'image/jpeg', w: 640, h: 480, input: 'input-gallery' },
    { name: 'captura.png', mime: 'image/png', w: 1080, h: 2400, input: 'input-gallery' },
    { name: 'foto.webp', mime: 'image/webp', w: 1000, h: 1000, input: 'input-gallery' },
  ];
  for (const c of cases) {
    const buffer = await makeImage(page, c.w, c.h, c.mime);
    await createItem(page, { name: c.name, mimeType: c.mime, buffer }, c.input);
  }
  const db = await readDb(page);
  expect(db.items).toHaveLength(cases.length);
  for (const img of db.images) {
    const expected = cases.find((c) => c.name === img.source?.name)!;
    const long = Math.min(1600, Math.max(expected.w, expected.h));
    expect(Math.max(img.width, img.height)).toBe(long);
  }
  for (const b of db.blobs) {
    expect(b.size).toBeGreaterThan(0);
    expect(b.hasExif).toBe(false);
  }
});

test('rechaza archivos no compatibles con mensajes claros y sin bloquear la interfaz', async ({ page }) => {
  await page.goto('./#/nueva');
  const files = [
    { name: 'foto.heic', mimeType: 'image/heic', buffer: Buffer.from('ftypheic....') },
    { name: 'rota.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 1, 2, 3]) },
    { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') },
  ];
  await page.getByTestId('input-gallery').setInputFiles(files);
  await expect(page.getByText(/HEIC/)).toBeVisible();
  await expect(page.getByText(/rota\.jpg/)).toBeVisible();
  await expect(page.getByText(/notas\.txt/)).toBeVisible();
  await expect(page.getByTestId('save-item')).toBeEnabled();
});

test('abre correctamente con datos ya guardados por la versión anterior (Blob en IndexedDB)', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
  const jpeg = await makeImage(page, 300, 400, 'image/webp');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/webp' });
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('armario-digital');
      req.onsuccess = () => {
        const tx = req.result.transaction(['items', 'images', 'blobs'], 'readwrite');
        tx.objectStore('items').put({ id: 'itm_legacy000001', name: 'Prenda v0.1.0', categoryId: 'top', subcategoryId: 'tshirt', status: 'available', isDraft: false, favorite: false, createdAt: now, updatedAt: now, colors: { primary: 'white' }, imageIds: ['img_legacy000001'] });
        tx.objectStore('images').put({ id: 'img_legacy000001', itemId: 'itm_legacy000001', mime: 'image/webp', width: 300, height: 400, bytes: blob.size, sha256: 'a'.repeat(64), createdAt: now });
        tx.objectStore('blobs').put({ imageId: 'img_legacy000001', variant: 'thumb', blob });
        tx.objectStore('blobs').put({ imageId: 'img_legacy000001', variant: 'display', blob });
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, jpeg.toString('base64'));
  await page.reload();
  await page.getByRole('link', { name: 'Armario', exact: true }).click();
  const img = page.getByTestId('item-card').getByRole('img', { name: 'Prenda v0.1.0' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('los datos persisten y son coherentes tras cerrar el navegador por completo y volver a abrirlo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'armario-profile-'));
  const opts = {
    executablePath: process.env.CHROMIUM_PATH,
    args: process.env.CHROMIUM_PATH ? ['--no-sandbox', '--no-zygote'] : [],
    baseURL: 'http://localhost:4173/armario-digital/',
  };
  try {
    let ctx = await chromium.launchPersistentContext(dir, opts);
    let page = await ctx.newPage();
    await createItem(page, { name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makeJpegWithGps(page, 2000, 1500) });
    const before = await readDb(page);
    await ctx.close(); // cierre completo del navegador

    ctx = await chromium.launchPersistentContext(dir, opts);
    page = await ctx.newPage();
    await page.goto('./#/armario');
    await expect(page.getByTestId('item-card')).toHaveCount(1);
    const after = await readDb(page);
    expect(after.items).toEqual(before.items);
    expect(after.images).toEqual(before.images);
    expect(after.blobs).toEqual(before.blobs);
    await page.goto('./#/diagnostico');
    await expect(page.getByText(/Sin incoherencias/)).toBeVisible();
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
