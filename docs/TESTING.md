# Pruebas

## Estrategia

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Esquemas y vocabulario (validados contra los ejemplos JSON de `IMPORT_EXPORT.md`), catálogo, formulario, geometría de imagen, reglas de protección del repositorio |
| Integración | Vitest + fake-indexeddb | Repositorio de prendas: CRUD, fotos, transacciones, persistencia al reabrir la base de datos |
| E2E | Playwright (Chromium, perfil Pixel 7) contra el **build de producción** | CRUD completo con fotos, EXIF/GPS, persistencia, búsqueda, CSP, offline, HEIC, peticiones de red |
| Manual en Android | Móvil real con la PWA instalada | Cámara, instalación, persistencia tras reinicio, rendimiento |

Datos de prueba siempre **sintéticos**: las imágenes se generan en el propio test (canvas). Nunca se usan fotos reales.

## Registro de pruebas ejecutadas

| Fecha | Fase | Prueba | Resultado |
|---|---|---|---|
| 2026-10-11 | 0 | Ejemplos JSON de la documentación son JSON válido | ✅ |
| 2026-10-11 | 1 | `npm test`: 55 tests en 6 archivos | ✅ 55/55 |
| 2026-10-11 | 1 | `npm run lint` (incluye prohibición de APIs de red) | ✅ |
| 2026-10-11 | 1 | `npm run build` + `check-dist` (11 archivos, 533 KB, CSP inyectada) | ✅ |
| 2026-10-11 | 1 | `npm run e2e`: 4 tests contra el build | ✅ 4/4 |
| 2026-10-11 | 1 | Hook pre-commit con una imagen y un manifiesto añadidos | ✅ commit bloqueado |
| 2026-10-11 | 1 | Revisión visual de inicio, editor, ficha y armario (viewport Pixel 7) | ✅ tras corregir alto de tarjetas e icono |

Entorno: Linux, Node 22, Chromium 153 headless. Playwright no pudo descargar su navegador en el entorno de desarrollo; se usó un Chromium empaquetado mediante `CHROMIUM_PATH`. En la CI de GitHub se instala el de Playwright.

### Qué demuestran los tests

**Datos** (`src/db/items.test.ts`):
- Crear una prenda con fotos en orden guarda `display` y `thumb`.
- `null` y «ausente» se conservan al guardar.
- Los datos siguen ahí al cerrar y reabrir la base de datos.
- Editar reordena, sustituye y elimina fotos de una vez, sin dejar binarios huérfanos.
- Una validación fallida no escribe nada.
- Un fallo a mitad de transacción deshace todo.
- No se puede asociar la foto de otra prenda.
- Los borradores incompletos se guardan.
- Borrar una prenda elimina sus imágenes y binarios.
- Una foto ya importada se detecta por su huella.

**Esquema** (`src/domain/schema.test.ts`):
- Los ejemplos de la documentación validan contra el código. Este test ya detectó un campo obsoleto (`sourceName`) en la documentación.
- Corte por categoría: `length` con valores distintos según la categoría, e `inseam` solo en pantalones cortos.
- Marcas de estimado.
- Alias de color.

**E2E** (`e2e/app.spec.ts`):
- Alta desde la galería con un JPEG de 2400×3200 con EXIF+GPS. Se guarda como WebP de 1600 px sin `Exif` ni marca GPS en los binarios, con la huella del original.
- Recarga, búsqueda por alias, edición con segunda foto (2 imágenes y 4 binarios) y borrado (0 restos).
- **Todas las peticiones son `GET` al propio origen.**
- La CSP bloquea `fetch('https://example.com')`.
- Con el service worker activo, la app abre y navega **sin conexión**.
- HEIC se rechaza con un mensaje claro.

## Cómo verificar tú mismo que no salen datos del dispositivo

1. **Automático:** `npm run e2e`. El primer test falla si aparece cualquier petición que no sea `GET` a `localhost:4173`.
2. **En el PC con Chrome:**
   - Abre la app publicada y DevTools → *Network*.
   - Marca *Preserve log* y filtra por `-domain:ivanalejo.github.io`.
   - Crea, edita, busca y borra prendas. La lista debe quedar vacía. Las únicas entradas restantes deben ser archivos de la app (`.js`, `.css`, `.png`, `sw.js`) y `blob:` locales.
3. **En el móvil:** conecta el Android por USB, abre `chrome://inspect` en el PC y repite el paso 2 sobre la PWA instalada.
4. **Modo avión:** con la app ya cargada una vez, activa el modo avión. Todo (alta con cámara, edición, búsqueda) debe seguir funcionando.
5. **CSP:** en la consola de DevTools, `fetch('https://example.com')` debe fallar con un error de *Content Security Policy*.

## Checklist en Android (pendiente: lo tienes que hacer tú tras publicar)

- [ ] Instalar desde Chrome (⋮ → *Instalar aplicación*). El icono aparece en la pantalla de inicio y abre en modo standalone.
- [ ] Ajustes → *Persistente*: anota si aparece «Concedido» o «No concedido».
- [ ] Alta con **cámara**: abre la cámara nativa, recorte 3:4, guardado.
- [ ] Alta con **galería** de varias fotos a la vez.
- [ ] Editar: reordenar, recortar de nuevo, sustituir y eliminar una foto.
- [ ] Cerrar la app, forzar la detención de Chrome y **reiniciar el móvil**: los datos siguen.
- [ ] **Modo avión**: abrir la app, añadir y editar una prenda.
- [ ] Cuadrícula fluida con 50 o más prendas.
- [ ] Una foto HEIC (si la cámara lo permite) muestra un error claro.

## Pendientes de verificar

- Todo lo marcado como Android en el checklist anterior.
- Rendimiento con 300 prendas reales.
- Pruebas de las fases 2–5 (`ROADMAP.md`).
