# Armario Digital

PWA personal para inventariar ropa, calzado y accesorios con fotos y, más adelante, generar outfits con lo que realmente hay en el armario. Todo funciona en local: sin backend, sin cuentas, sin APIs externas y sin telemetría.

> **Estado:** Fase 1 (MVP de inventario) implementada y probada en navegador. Pendiente de verificar en Android tras publicar. Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## Qué hace ahora

- Alta de prendas con cámara o galería: varias fotos por prenda, recorte, giro, reordenar, sustituir y eliminar.
- Ficha con vocabulario controlado: categoría, tipo, colores, estilos, formalidad, temporadas, abrigo, estampado, marca y material.
- Atributos de corte y silueta específicos de cada tipo de prenda: pierna, tiro, ajuste, largo, cuello…
- Distingue datos confirmados, estimados (punto ámbar) y desconocidos.
- Catálogo en cuadrícula con búsqueda (entiende alias de color: «azul oscuro» = azul marino) y filtros.
- Borradores para prendas incompletas.
- Instalable y usable sin conexión.

## Privacidad

- Los datos viven en IndexedDB de este navegador. La app no hace peticiones de red; solo el navegador descarga la propia app desde GitHub Pages.
- Una CSP con `connect-src 'self'` bloquea cualquier conexión a otro dominio, y un test e2e lo comprueba.
- Las fotos se reducen a 1600 px (miniatura de 400 px) en WebP y se guardan **sin EXIF ni GPS**. La foto original de la galería no se toca.
- **Aún no hay copias de seguridad (Fase 2).** Si borras los datos de Chrome, desinstalas la app o pierdes el móvil, el inventario se pierde.

## Desarrollo

Requisitos: Node.js 22 y npm.

```bash
npm install          # instala dependencias y activa el hook pre-commit (.githooks/)
npm run dev          # desarrollo en http://localhost:5173/armario-digital/
npm test             # pruebas unitarias e integración (Vitest + IndexedDB en memoria)
npm run lint
npm run build        # tsc + build + check-dist (dist/ solo contiene la app)
npm run e2e          # Playwright contra el build: CRUD, EXIF, offline, CSP, red
npm run guard        # revisa que no haya datos personales versionados
```

Para los e2e hace falta un Chromium: `npx playwright install chromium`, o `CHROMIUM_PATH=/ruta/chromium npm run e2e`.

## Publicación en GitHub Pages

1. Crea el repositorio **público** `ivanalejo/armario-digital`. En el plan gratuito, Pages solo funciona con repositorios públicos; el código es público, los datos nunca están en el repositorio.
2. *Settings → Pages → Source: GitHub Actions*.
3. Sube el código a `main`. El workflow `.github/workflows/deploy.yml` hace guard → lint → tests → build → check-dist → e2e → despliegue.
4. Abre `https://ivanalejo.github.io/armario-digital/` en Chrome Android → menú ⋮ → *Instalar aplicación*.

Límites de Pages (comprobados el 2026-10-11): 1 GB publicado, límite blando de 100 GB/mes de tráfico, sin cabeceras propias y todo lo publicado es accesible por URL. Detalle en `docs/ARCHITECTURE.md §7`.

## Qué nunca debe entrar en el repositorio

Fotos reales, copias (`*.armario.zip`), kits, patches o manifiestos con el inventario. Hay cuatro barreras:
1. `.gitignore`.
2. El hook `pre-commit`, que bloquea imágenes fuera de `public/icons/`, ZIP, manifiestos y archivos de más de 1 MB.
3. La misma comprobación en la CI.
4. `check-dist` sobre lo publicado.

Para trabajar con datos reales en local usa la carpeta `private/` (ignorada).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, módulos, persistencia, imágenes, Pages, recomendador, personalización, riesgos |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Modelo de datos, vocabulario, corte y silueta, eventos de preferencia |
| [docs/IMPORT_EXPORT.md](docs/IMPORT_EXPORT.md) | Formato `.armario.zip`, kit de catalogación con Claude, validación |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases y criterios de aceptación |
| [docs/TESTING.md](docs/TESTING.md) | Pruebas ejecutadas, verificación de red y checklist de Android |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisiones técnicas (ADR) |
