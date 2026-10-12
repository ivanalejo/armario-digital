#!/usr/bin/env node
// Activa el hook pre-commit (.githooks) que bloquea datos personales.
// En Node para que funcione igual en Windows (cmd/PowerShell) y en Linux/macOS.
// Si no hay Git o no es un repositorio (p. ej. al instalar desde un ZIP), no hace nada.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('hooks: core.hooksPath = .githooks');
} catch {
  console.log('hooks: no es un repositorio Git; no se activa el hook.');
}
