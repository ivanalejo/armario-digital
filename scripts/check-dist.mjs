#!/usr/bin/env node
// Revisa dist/ antes de publicar: solo puede contener la app (código, estilos,
// manifest, service worker e iconos). Falla ante cualquier otra cosa.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const ALLOWED = [
  /^index\.html$/,
  /^manifest\.webmanifest$/,
  /^sw\.js$/,
  /^workbox-[\w-]+\.js$/,
  /^assets\/[\w.-]+\.(js|css)$/,
  /^icons\/(icon-192|icon-512|icon-maskable-512)\.png$/,
  /^icons\/favicon\.svg$/,
];
const MAX_TOTAL = 5 * 1024 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST);
let total = 0;
const bad = [];
for (const f of files) {
  const rel = relative(DIST, f).replace(/\\/g, '/');
  total += statSync(f).size;
  if (!ALLOWED.some((re) => re.test(rel))) bad.push(rel);
}
if (bad.length) {
  console.error('check-dist: archivos no permitidos en dist/:\n  ' + bad.join('\n  '));
  process.exit(1);
}
if (total > MAX_TOTAL) {
  console.error(`check-dist: dist/ ocupa ${(total / 1024).toFixed(0)} KB (máx. ${MAX_TOTAL / 1024} KB)`);
  process.exit(1);
}
console.log(`check-dist: ${files.length} archivos, ${(total / 1024).toFixed(0)} KB, todo permitido.`);
