# Pruebas

## Estrategia

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Esquemas y vocabulario (validados contra los ejemplos JSON de `IMPORT_EXPORT.md`), catálogo, formulario, geometría de imagen, reglas de protección del repositorio |
| Integración | Vitest + fake-indexeddb | Repositorio de prendas: CRUD, fotos, transacciones, persistencia al reabrir la base de datos |
| E2E | Playwright (Chromium, perfil Pixel 7) contra el **build de producción** | CRUD completo con fotos, EXIF/GPS, persistencia, búsqueda, CSP, offline, HEIC, peticiones de red |
| Manual en Android | Móvil real con la PWA instalada | Cámara, instalación, persistencia tras reinicio, rendimiento |

Datos de prueba siempre **sintéticos**: las imágenes se generan en el propio test (canvas). Nunca se usan fotos reales.

## Incidencia 2026-10-11 · v0.1.0 bloqueada en Android

**Observado por Iván** (Android, PWA instalada desde GitHub Pages):
1. Prenda con foto de cámara: correcto.
2. Prenda con foto de galería: al guardar, el botón se quedó cargando indefinidamente.
3. Tras cerrar y reabrir, Inicio y Armario se quedan en «Cargando…».

**Análisis del código de v0.1.0 (confirmado):**
- Inicio, Armario, la ficha y Ajustes usaban `useLiveQuery`. Mientras la consulta no responde muestran «Cargando…», sin límite ni salida. Un error, en cambio, habría mostrado la pantalla de error. Por tanto el síntoma 3 significa que **IndexedDB no respondía** a las lecturas, no que hubiera un registro corrupto.
- Ninguna operación tenía tiempo límite: ni decodificar, ni codificar, ni la transacción de guardado. El editor compartía un único estado `busy`. Si cualquiera de ellas no terminaba, el botón quedaba en «Espera…» para siempre (síntoma 2).
- Atomicidad: el guardado era una sola transacción. Un fallo o un cierre a mitad no puede dejar registros parciales; IndexedDB deshace la transacción entera.

**Reproducción (Chromium 153 de escritorio con perfil Pixel 7, NO en Android):** con las pruebas e2e nuevas ejecutadas contra el build de v0.1.0:

| Escenario provocado | v0.1.0 | v0.1.1 |
|---|---|---|
| Otra conexión mantiene abierta una escritura en `items` | Inicio solo muestra «Cargando…» (idéntico al síntoma 3) | «La base de datos no responde…», con Reintentar y diagnóstico; se recupera sola al liberarse |
| Guardar mientras `blobs` está bloqueada | Botón «Espera…» deshabilitado para siempre (idéntico al síntoma 2) | Aborta a los 20 s, avisa, no guarda nada a medias, conserva el formulario; reintento correcto |
| La codificación de imagen no termina | «Procesando…» para siempre | Error «ha tardado demasiado», interfaz libre, «Reintentar foto» correcto |
| Lote con HEIC + JPEG corrupto + texto | Solo se informa del primero | Un mensaje por archivo |

**Hipótesis sobre el origen en el móvil (NO confirmadas en Android):**
- **H1 (la que mejor encaja con ambos síntomas):** una escritura en IndexedDB que no terminó (por el almacenamiento del Blob o por una conexión de una instancia anterior de la app) dejó la base de datos bloqueada. Al reabrir la PWA sin que Chrome se cerrase del todo, las lecturas quedaron en cola.
  - Mitigaciones: tiempo límite con aborto de la transacción, binarios como ArrayBuffer y pantallas con estado «no responde».
- **H2:** el procesado de la foto de galería se colgó (archivo servido por un proveedor en la nube o canvas acelerado por GPU). Explica el síntoma 2, pero no el 3.
  - Mitigaciones: lectura única con tiempo límite, canvas en CPU con alternativa y tiempos límite.
- **Descartadas por el código:**
  - Un registro corrupto: habría producido un error visible, no una espera infinita.
  - Un cambio de versión del esquema que bloqueara la apertura: solo existe la v1.
- **Poco probable:** falta de memoria. Suele provocar la recarga de la pestaña, no una espera indefinida. Se añade un límite de 100 MP y se libera antes la memoria.

**Datos en tu móvil:** la v0.1.1 lee los registros de la v0.1.0 (Blob), comprobado en un test. No hay ninguna limpieza ni migración automática. *Ajustes → Diagnóstico* permite comprobar la coherencia sin modificar nada.

**Cómo obtener más información si se repite:**
1. *Ajustes → Diagnóstico → Copiar informe*: IDs, recuentos, estado de IndexedDB y últimos errores; sin nombres ni fotos.
2. Depuración remota:
   - Activa la depuración USB en el móvil y conéctalo al PC.
   - En el PC abre `chrome://inspect` → *inspect* sobre la PWA.
   - Revisa *Console* y *Application → IndexedDB → armario-digital*. Es solo lectura mientras no edites nada.

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
| 2026-10-11 | 1 | **Android real (Iván), v0.1.0**: instalación, cámara, galería | ❌ guardado con foto de galería bloqueado y app en «Cargando…» (incidencia arriba) |
| 2026-10-11 | 1 | Nuevos e2e de robustez contra el build de **v0.1.0** | ❌ 4/4 fallan como se esperaba (reproducen el bloqueo) |
| 2026-10-11 | 1 | **v0.1.1** `npm test`: 61 tests en 7 archivos | ✅ 61/61 |
| 2026-10-11 | 1 | **v0.1.1** lint + build + check-dist | ✅ |
| 2026-10-11 | 1 | **v0.1.1** `npm run e2e`: 12 tests (4 originales + 8 de robustez) | ✅ 12/12 |
| 2026-10-12 | 1 | **Android real (Iván), v0.1.1**: carga, guardado y navegación | ✅ según Iván |
| 2026-10-12 | 3 | **v0.2.0** `npm test`: 103 tests en 9 archivos (37 del motor, 5 de outfits y compatibilidad) | ✅ 103/103 |
| 2026-10-12 | 3 | Cobertura de `src/engine` | ✅ 97 % de líneas, 87 % de ramas |
| 2026-10-12 | 3 | **v0.2.0** lint + build + check-dist (594 KB) + guard | ✅ |
| 2026-10-12 | 3 | **v0.2.0** `npm run e2e`: 24 tests (4 base + 9 de robustez + 11 de outfits), dos ejecuciones seguidas | ✅ 24/24 y 24/24 |
| 2026-10-12 | 3 | Prueba de bloqueo de IndexedDB: 8 ejecuciones seguidas tras corregir una carrera de la propia prueba | ✅ 8/8 |
| 2026-10-12 | 3 | Revisión visual (Pixel 7, Chromium 153): Inicio vacío y con datos, cambiar pieza, Explorar, Guardados, Armario | ✅ tras corregir tamaño de fotos, propuesta del día y nombre oculto en tarjetas |

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

**Robustez** (`src/db/robustness.test.ts`, `e2e/robustness.spec.ts`, v0.1.1):
- Tiempo límite y aborto de la transacción con otra conexión bloqueando.
- Recuperación de Inicio cuando la base de datos vuelve a responder.
- Guardado colgado y reintento.
- Codificación colgada y «Reintentar foto».
- Fallo de escritura (`QuotaExceededError`) sin datos parciales.
- Cámara y galería con 12 MP, 48 MP, 640×480, PNG vertical y WebP.
- HEIC, JPEG corrupto y archivo de texto, con un mensaje por archivo.
- Apertura con datos en formato v0.1.0.
- Persistencia y coherencia tras **cerrar el navegador por completo** y reabrirlo (perfil persistente).
- Fichas inválidas que no bloquean el resto y detección de incoherencias sin modificar nada.

**Recomendador** (`src/engine/recommend.test.ts`, v0.2.0):
- Propuestas completas y solo con prendas del inventario; determinismo; diversidad; nunca el mismo núcleo dos veces.
- Prendas obligatorias:
  - siempre presentes, incluida una que puede ir de base o de capa;
  - incluidas aunque no estén disponibles, con aviso;
  - dos para la misma posición → aviso.
- Disponibilidad: nada para lavar, guardado, en arreglo, prestado, dado de baja ni borradores.
- Clima:
  - Lluvia: prioriza el impermeable, sin sandalias y con aviso por el ante.
  - Frío: exige capa exterior, sin cortos ni sandalias; sin abrigos disponibles, propone igualmente con aviso.
  - Calor: sin capa exterior.
- Ocasiones:
  - Evento formal: sin zapatillas, vaqueros ni camisetas.
  - Reunión: sin sudaderas.
  - Deporte: sin camisas ni zapatos.
  - Evento formal sin calzado adecuado → explica qué falta.
- Datos:
  - Un armario con solo tipo y color sigue funcionando, con aviso de confianza.
  - La formalidad estimada no excluye; la confirmada sí.
  - Sin color conocido, la prenda puntúa neutro.
- Silueta: oversize con tapered puntúa mejor que oversize con baggy.
- Inventario vacío, una prenda de cada tipo, sin calzado disponible, combinaciones inaceptables → sin propuestas.
- Preferencias:
  - Descartes «no me gusta» y «hoy no».
  - Los favoritos suman.
  - El uso reciente baja sin hundir el conjunto.
- Sustituir pieza, quitar capa, conjunto con prenda borrada, accesorios según la ocasión, propuesta del día.
- 1 000 armarios aleatorios con invariantes.
- Rendimiento con 300 prendas.

**Outfits y compatibilidad** (`src/db/outfits.test.ts`):
- Guardar sin duplicar, valorar, descartar, registrar uso y borrar sin perder el historial.
- Una base de datos con fichas y fotos de v0.1.0/v0.1.1 (Blob y ArrayBuffer) se lee, sirve para recomendar y no se modifica.
- Un conjunto guardado en el formato anterior sigue siendo válido.

**E2E de la Fase 3** (`e2e/outfits.spec.ts`, datos sintéticos en formato v0.1.1):
- Inicio vacío.
- Outfit del día: fotos que cargan, enlaces a las fichas y motivos.
- «Otra» y persistencia de la elección.
- Guardar no cambia la propuesta del día.
- Valorar, «me lo pongo», historial y eventos.
- Descartar.
- No disponibles excluidas.
- Sin calzado → explicación.
- Combinar desde la ficha.
- Cambiar pieza.
- Accesos de gestión del Armario y nombre visible en tarjetas.
- **Solo GET al propio origen** durante todo el flujo.

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

## Checklist en Android para v0.2.0 (pendiente: lo tienes que hacer tú)

- [ ] Tras actualizar, Ajustes muestra la versión **0.2.0** y tus prendas siguen ahí. Diagnóstico → coherencia correcta.
- [ ] Inicio muestra un outfit del día con tus fotos. «Otra», «Guardar», «Me lo pongo» y «Descartar» responden.
- [ ] La propuesta del día no cambia al cerrar y reabrir la app el mismo día.
- [ ] Cambiar ocasión y tiempo (frío, lluvia) produce propuestas coherentes.
- [ ] Marca una prenda como «Para lavar»: no vuelve a aparecer en las propuestas.
- [ ] Outfits → Guardados (valorar) e Historial.
- [ ] Ficha → «Combinar esta prenda».
- [ ] Rendimiento: la propuesta aparece en menos de 1 s.
- [ ] Modo avión: Inicio y Outfits funcionan.
- [ ] Validación del recomendador: 20 peticiones reales; anota cuántas te pondrías.

## Pendientes de verificar

- Todo lo marcado como Android en el checklist anterior.
- Rendimiento con 300 prendas reales.
- Pruebas de las fases 2–5 (`ROADMAP.md`).
