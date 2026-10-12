import { expect, test, type Request } from '@playwright/test';
import { makeJpegWithGps, readDb } from './helpers';

const ORIGIN = 'http://localhost:4173';

/** Registra todas las peticiones de la página para comprobar que nada sale del origen. */
function trackRequests(page: import('@playwright/test').Page) {
  const seen: { url: string; method: string }[] = [];
  page.on('request', (r: Request) => seen.push({ url: r.url(), method: r.method() }));
  return () => seen.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
}

test('ciclo completo: crear con foto, consultar, buscar, editar, persistir y borrar', async ({ page }) => {
  const requests = trackRequests(page);
  page.on('dialog', (d) => void d.accept());
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();

  // --- Crear ---
  await page.getByRole('link', { name: 'Añadir', exact: true }).click();
  const jpeg = await makeJpegWithGps(page);
  await page.getByTestId('input-gallery').setInputFiles({ name: 'IMG_20261011_183012.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByRole('button', { name: 'Sin recortar' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Parte inferior', exact: true }).click();
  await page.getByRole('button', { name: 'Vaqueros', exact: true }).click();
  await page.getByRole('group').filter({ has: page.getByRole('button', { name: 'Azul marino' }) }).first().getByRole('button', { name: 'Azul marino' }).click();
  await page.getByRole('button', { name: 'Tapered', exact: true }).click();
  await expect(page.locator('input.input').first()).toHaveValue('Vaqueros azul marino');
  await page.getByTestId('save-item').click();
  await expect(page.getByRole('heading', { name: 'Vaqueros azul marino' })).toBeVisible();
  await expect(page.getByText('Tapered')).toBeVisible();

  // --- La foto se guardó optimizada, sin EXIF ni GPS, y con la huella del original ---
  const db1 = await readDb(page);
  expect(db1.items).toHaveLength(1);
  expect(db1.images).toHaveLength(1);
  const img = db1.images[0]!;
  expect(Math.max(img.width, img.height)).toBe(1600);
  expect(img.mime).toBe('image/webp');
  expect(img.source?.name).toBe('IMG_20261011_183012.jpg');
  expect(db1.blobs.map((b) => b.variant).sort()).toEqual(['display', 'thumb']);
  for (const b of db1.blobs) {
    expect(b.type).toBe('image/webp');
    expect(b.hasExif).toBe(false);
    expect(b.hasGps).toBe(false);
  }

  // --- Persistencia tras recargar ---
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vaqueros azul marino' })).toBeVisible();

  // --- Búsqueda con alias de color ---
  await page.getByRole('link', { name: 'Armario', exact: true }).click();
  await page.getByLabel('Buscar prendas').fill('azul oscuro');
  await expect(page.getByTestId('item-card')).toHaveCount(1);
  await page.getByLabel('Buscar prendas').fill('camisa');
  await expect(page.getByTestId('item-card')).toHaveCount(0);
  await page.getByLabel('Buscar prendas').fill('');

  // --- Editar: nombre, marca «sin marca» y una segunda foto ---
  await page.getByTestId('item-card').first().click();
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.locator('input.input').first().fill('Vaqueros oscuros favoritos');
  const jpeg2 = await makeJpegWithGps(page, 1200, 900, '#6b6b3a');
  await page.getByTestId('input-gallery').setInputFiles({ name: 'IMG_2.jpg', mimeType: 'image/jpeg', buffer: jpeg2 });
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('button', { name: /Ver foto 2/ })).toBeVisible();
  await page.getByTestId('save-item').click();
  await expect(page.getByRole('heading', { name: 'Vaqueros oscuros favoritos' })).toBeVisible();
  const db2 = await readDb(page);
  expect(db2.images).toHaveLength(2);
  expect(db2.blobs).toHaveLength(4);

  // --- Borrar: elimina la prenda, sus imágenes y sus binarios ---
  await page.getByTestId('delete-item').click();
  await expect(page.getByText('Tu armario está vacío.')).toBeVisible();
  const db3 = await readDb(page);
  expect(db3.items).toHaveLength(0);
  expect(db3.images).toHaveLength(0);
  expect(db3.blobs).toHaveLength(0);

  // --- Privacidad: solo GET al propio origen ---
  const external = requests().filter((r) => !r.url.startsWith(ORIGIN) || r.method !== 'GET');
  expect(external, JSON.stringify(external, null, 2)).toEqual([]);
});

test('la CSP bloquea conexiones a otros dominios', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return 'permitido';
    } catch {
      return 'bloqueado';
    }
  });
  expect(result).toBe('bloqueado');
});

test('funciona sin conexión tras la primera carga (service worker)', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la página pasa a estar controlada por el SW
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '¿Qué me pongo?' })).toBeVisible();
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await context.setOffline(false);
});

test('rechaza HEIC con un mensaje claro', async ({ page }) => {
  await page.goto('./#/nueva');
  await page.getByTestId('input-gallery').setInputFiles([
    { name: 'a.heic', mimeType: 'image/heic', buffer: Buffer.from('fake') },
    { name: 'b.heic', mimeType: 'image/heic', buffer: Buffer.from('fake') },
  ]);
  await expect(page.getByText(/HEIC/).first()).toBeVisible();
});
