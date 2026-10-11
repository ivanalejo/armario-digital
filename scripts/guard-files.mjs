#!/usr/bin/env node
// Uso: node scripts/guard-files.mjs --staged | --all
// --staged: archivos añadidos o modificados en el commit (hook pre-commit)
// --all:    todos los archivos versionados (CI)
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { checkFile } from './guard-rules.mjs';

const mode = process.argv[2] ?? '--all';
const args =
  mode === '--staged'
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z'];
const files = execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);

const problems = [];
for (const f of files) {
  let size;
  let content;
  try {
    size = statSync(f).size;
    if (/\.json$/i.test(f) && size < 5 * 1024 * 1024) content = readFileSync(f, 'utf8');
  } catch {
    continue; // borrado en el árbol de trabajo
  }
  const reason = checkFile(f, { size, content });
  if (reason) problems.push(`  ✗ ${f}: ${reason}`);
}

if (problems.length) {
  console.error('\nBloqueado para proteger tus datos personales:\n' + problems.join('\n'));
  console.error('\nSi es un falso positivo, revisa scripts/guard-rules.mjs (no uses --no-verify con datos reales).\n');
  process.exit(1);
}
console.log(`guard: ${files.length} archivos revisados, sin datos personales.`);
