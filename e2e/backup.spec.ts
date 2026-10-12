// Fase 2: exportar la copia, restaurarla en un perfil limpio («móvil nuevo»),
// restaurar sobre datos existentes y rechazar archivos dañados o incompatibles.
import { expect, test, type Browser, type Page, type Request } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedLegacy, snapshot } from './legacySeed';

const tmp = mkdtempSync(join(tmpdir(), 'armario-backup-'));

async function exportFromUi(page: Page): Promise<string> {
  await page.goto('./#/ajustes');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
  expect(download.suggestedFilename()).toMatch(/^armario-copia-\d{4}-\d{2}-\d{2}-\d{4}\.armario\.zip$/);
  const file = join(tmp, `${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  await expect(page.getByTestId('export-result')).toContainText('4 prendas · 4 fotos · 1 conjunto ·');
  return file;
}

async function openRestore(page: Page, file: string) {
  await page.goto('./#/copias/restaurar');
  await page.getByTestId('restore-input').setInputFiles(file);
}

async function freshDevice(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('./');
  return { ctx, page };
}

test('exportar en un dispositivo y restaurar en otro limpio: todo igual, fotos incluidas; repetir no duplica', async ({ page, browser }) => {
  const seen: { url: string; method: string }[] = [];
  page.on('request', (r: Request) => seen.push({ url: r.url(), method: r.method() }));
  await page.goto('./');
  await seedLegacy(page);
  await page.reload();
  await expect(page.getByTestId('backup-reminder')).toContainText('Sin copia');
  const before = await snapshot(page);
  const file = await exportFromUi(page);
  expect(await snapshot(page)).toEqual(before); // exportar no cambia nada
  await page.goto('./');
  await expect(page.getByText(/Última copia generada hoy/)).toBeVisible();

  // «Móvil nuevo»: otro perfil de navegador, sin datos.
  const dev = await freshDevice(browser);
  dev.page.on('request', (r: Request) => seen.push({ url: r.url(), method: r.method() }));
  await expect(dev.page.locator('h1').first()).toBeVisible();
  await expect(dev.page.getByTestId('backup-reminder')).toHaveCount(0); // armario vacío: sin aviso de copia
  await openRestore(dev.page, file);
  await expect(dev.page.getByTestId('count-new')).toHaveText('4');
  await dev.page.getByTestId('apply-restore').click();
  await expect(dev.page.getByTestId('restore-done')).toContainText('4 prendas añadidas');
  await expect(dev.page.getByTestId('restore-done')).toContainText('coherencia: correcta');
  const after = (await snapshot(dev.page)) as Record<string, unknown>;
  expect(after.items).toEqual(before.items);
  expect(after.images).toEqual(before.images);
  expect(after.blobs).toEqual(before.blobs); // mismos bytes, incluida la foto guardada como Blob en v0.1.0
  expect(after.outfits).toEqual(before.outfits);
  expect(after.wearLog).toEqual(before.wearLog);

  // Las fotos restauradas se ven en el catálogo
  await dev.page.getByRole('link', { name: 'Ver mi armario' }).click();
  await expect(dev.page.getByTestId('item-card')).toHaveCount(4);
  const img = dev.page.getByTestId('item-card').first().locator('img');
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Restaurar otra vez la misma copia: nada nuevo, nada duplicado
  await openRestore(dev.page, file);
  await expect(dev.page.getByTestId('count-same')).toHaveText('4');
  await expect(dev.page.getByTestId('count-new')).toHaveText('0');
  await expect(dev.page.getByTestId('apply-restore')).toBeDisabled();
  expect(await snapshot(dev.page)).toEqual(after);

  // Privacidad: exportar y restaurar no hace ninguna petición fuera del propio origen
  const external = seen.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:') && (!r.url.startsWith('http://localhost:4173') || r.method !== 'GET'));
  expect(external).toEqual([]);
  await dev.ctx.close();
});

test('restaurar sobre datos modificados: no sobrescribe sin elegirlo; con elección explícita recupera la versión de la copia', async ({ page }) => {
  await page.goto('./');
  await seedLegacy(page);
  await page.reload();
  const file = await exportFromUi(page);
  // Después de la copia, se renombra una prenda en el dispositivo.
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('armario-digital');
    r.onsuccess = () => {
      const tx = r.result.transaction('items', 'readwrite');
      const s = tx.objectStore('items');
      const g = s.get('itm_legacy0001');
      g.onsuccess = () => s.put({ ...g.result, name: 'Camiseta renombrada' });
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await openRestore(page, file);
  await expect(page.getByTestId('count-conflict')).toHaveText('1');
  await expect(page.getByTestId('apply-restore')).toBeDisabled(); // nada nuevo que añadir por defecto
  await page.getByLabel('Usar la versión de la copia de Camiseta blanca').check();
  await page.getByTestId('apply-restore').click();
  await expect(page.getByTestId('restore-done')).toContainText('1 recuperadas de la copia');
  const snap = (await snapshot(page)) as { items: { id: string; name: string }[] };
  expect(snap.items.find((i) => i.id === 'itm_legacy0001')?.name).toBe('Camiseta blanca');
});

test('«reemplazar todo» exige escribir la confirmación', async ({ page }) => {
  await page.goto('./');
  await seedLegacy(page);
  await page.reload();
  const file = await exportFromUi(page);
  await openRestore(page, file);
  await page.getByRole('button', { name: 'Reemplazar todo', exact: true }).click();
  await expect(page.getByTestId('apply-restore')).toBeDisabled();
  await page.getByLabel(/Escribe REEMPLAZAR/).fill('reemplazar');
  await expect(page.getByTestId('apply-restore')).toBeDisabled();
  await page.getByLabel(/Escribe REEMPLAZAR/).fill('REEMPLAZAR');
  await page.getByTestId('apply-restore').click();
  await expect(page.getByTestId('restore-done')).toBeVisible();
});

test('archivos dañados o incompatibles se rechazan con un mensaje claro y sin tocar nada', async ({ page }) => {
  await page.goto('./');
  await seedLegacy(page);
  await page.reload();
  const before = await snapshot(page);
  const good = readFileSync(await exportFromUi(page));

  const files = unzipSync(new Uint8Array(good));
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Record<string, unknown>;
  const variants: [string, Uint8Array, RegExp][] = [
    ['no-es-zip.armario.zip', strToU8('esto no es una copia'), /no es un ZIP/],
    ['cortado.armario.zip', new Uint8Array(good.subarray(0, Math.floor(good.length / 2))), /dañado o incompleto/],
    ['futuro.armario.zip', zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify({ ...manifest, formatVersion: 7 })) }), /formato 7.*Actualiza/],
    ['otra-app.armario.zip', zipSync({ 'manifest.json': strToU8('{"format":"otra"}') }), /no es una copia de Armario/],
  ];
  for (const [name, bytes, msg] of variants) {
    const p = join(tmp, name);
    writeFileSync(p, bytes);
    await openRestore(page, p);
    await expect(page.getByTestId('restore-fatal')).toContainText(msg);
    await expect(page.getByTestId('restore-fatal')).toContainText('No se ha cambiado nada');
  }

  // Una foto alterada: se informa y el resto se puede restaurar
  const tampered = { ...files, 'images/img_legacy0002.webp': files['thumbs/img_legacy0001.webp']! };
  const p = join(tmp, 'foto-alterada.armario.zip');
  writeFileSync(p, zipSync(tampered));
  await openRestore(page, p);
  await expect(page.getByTestId('restore-problems')).toContainText('img_legacy0002');
  await expect(page.getByTestId('restore-problems')).toContainText('dañada');
  expect(await snapshot(page)).toEqual(before);
});
