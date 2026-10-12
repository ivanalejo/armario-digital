# Arquitectura

Versión del documento: 0.2 · Última revisión: 2026-10-11 (Fase 0 aprobada + cortes/siluetas + personalización)

## 1. Visión general

Aplicación 100 % cliente. Un único bundle estático (HTML/JS/CSS) servido por GitHub Pages; todo el estado vive en IndexedDB del navegador del móvil.

```
┌──────────────────────── Navegador (Chrome Android) ────────────────────────┐
│  UI React (features/*)                                                     │
│     │ hooks (useLiveQuery)                                                 │
│     ▼                                                                      │
│  db/ repositorios ──► Dexie ──► IndexedDB  (items, images, blobs, outfits, │
│     ▲                                       wearLog, vocab, settings)      │
│     │                                                                      │
│  domain/ (tipos, esquemas Zod, vocabulario)  ◄── usado por todos           │
│  engine/ (recomendador puro, sin React ni Dexie)                           │
│  images/ (Web Worker: decodificar, recortar, redimensionar, WebP, SHA-256) │
│  transfer/ (ZIP streaming con fflate, validación, conflictos)             │
│  Service Worker (Workbox) ── precache del app shell                        │
└────────────────────────────────────────────────────────────────────────────┘
        ▲ solo GET de archivos estáticos (primera carga y actualizaciones)
   GitHub Pages
```

Regla de dependencias: `features → db/engine/images/transfer → domain`. `domain` y `engine` no importan React ni Dexie (testeables en Node puro).

## 2. Stack y justificación

| Pieza | Elección | Motivo |
|---|---|---|
| UI | React 19 + TypeScript estricto | Requisito. |
| Build | Vite | Requisito; rápido, salida estática. |
| Persistencia | Dexie 4 sobre IndexedDB (+ `dexie-react-hooks`) | Requisito. `useLiveQuery` da reactividad sin store global. |
| Validación | Zod 4 | Un solo esquema genera tipos TS **y** valida importaciones. Evita mantener tipos y validadores por separado. |
| ZIP | fflate | ~8 KB, streaming en lectura y escritura. JSZip carga todo en memoria y una copia con fotos puede superar 150 MB. |
| Router | wouter con hash routing (`#/armario`) | ~2 KB. El hash evita 404 de GitHub Pages al recargar rutas profundas. |
| PWA | vite-plugin-pwa (Workbox, `generateSW`) | Precache automático del build; sin escribir el SW a mano. |
| Recorte | react-easy-crop (decisión final en Fase 1) | Gestos táctiles resueltos; alternativa: recorte propio con pointer events. |
| Iconos | SVG propios o `lucide-react` empaquetado | Sin peticiones externas. |
| Tipografía | Fuentes del sistema | Sin Google Fonts → sin peticiones a terceros. |
| Tests | Vitest + fake-indexeddb; Playwright para e2e | Unitarias en Node; e2e con control de red y modo offline. |
| Estilos | CSS plano con variables (tokens) y CSS Modules | Sin framework CSS; la app es pequeña. |

No se usa estado global (Redux/Zustand): la fuente de verdad es la base de datos y la UI se suscribe a ella.

## 3. Módulos

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `domain/` | Tipos, esquemas Zod, vocabulario controlado, generación de IDs, normalización de alias | — |
| `db/` | Esquema Dexie, migraciones, repositorios (CRUD transaccional) | domain |
| `images/` | Pipeline de imagen en Web Worker: decodificación con orientación EXIF, recorte, redimensionado, WebP, hash SHA-256, sello de ID para el kit | domain |
| `transfer/` | Exportar/importar `.armario.zip`, validación, plan de importación y conflictos, kit de catalogación | domain, db, images |
| `engine/` | Recomendador: filtros duros, puntuación, búsqueda, diversificación, explicaciones | domain |
| `platform/` | `navigator.storage` (persist/estimate), registro y actualización del SW, descarga/compartir archivos | — |
| `features/` | Pantallas: inicio, armario, añadir, outfits, historial, ajustes | todos |
| `ui/` | Componentes visuales reutilizables sin lógica de negocio | — |

## 4. Estructura de carpetas

```
armario-digital/
├─ index.html                  # CSP en <meta>, manifest, theme-color
├─ vite.config.ts              # base '/armario-digital/', vite-plugin-pwa
├─ tsconfig.json               # strict, noUncheckedIndexedAccess
├─ eslint.config.js            # incluye bloqueo de APIs de red (ver §9)
├─ playwright.config.ts
├─ public/icons/               # iconos PWA (192, 512, maskable)
├─ src/
│  ├─ main.tsx
│  ├─ app/                     # App.tsx, rutas, layout, barra de navegación inferior
│  ├─ ui/                      # Button, Chip, Sheet, ItemCard, ImageGrid, EmptyState…
│  ├─ features/
│  │  ├─ home/
│  │  ├─ wardrobe/             # cuadrícula, filtros, búsqueda, ficha, edición
│  │  ├─ add/                  # cámara/galería, cola de borradores, edición rápida
│  │  ├─ outfits/              # selector de ocasión, resultados, sustituir pieza
│  │  ├─ history/              # outfits guardados, registro de uso
│  │  └─ settings/             # copias, almacenamiento, pesos, vocabulario propio
│  ├─ domain/
│  │  ├─ schema/               # item.ts, image.ts, outfit.ts, manifest.ts (Zod)
│  │  ├─ vocabulary/           # categories.ts, colors.ts, styles.ts, patterns.ts…
│  │  ├─ ids.ts
│  │  └─ types.ts              # tipos inferidos de los esquemas
│  ├─ db/
│  │  ├─ db.ts                 # clase Dexie, versiones
│  │  ├─ migrations.ts
│  │  └─ repos/                # items.ts, images.ts, outfits.ts, wear.ts, settings.ts
│  ├─ images/
│  │  ├─ pipeline.ts           # API pública (promesas)
│  │  └─ image.worker.ts       # OffscreenCanvas
│  ├─ transfer/
│  │  ├─ zipWriter.ts / zipReader.ts
│  │  ├─ exportBackup.ts
│  │  ├─ importPlan.ts         # validar + calcular conflictos (sin escribir)
│  │  ├─ importApply.ts        # aplicar plan en transacción
│  │  └─ catalogKit.ts         # exportar kit para Claude
│  ├─ engine/
│  │  ├─ index.ts              # recommend(), rescore(), alternativesFor()
│  │  ├─ occasions.ts
│  │  ├─ weights.ts
│  │  ├─ filters.ts            # restricciones duras
│  │  ├─ scoring/              # color.ts, formality.ts, style.ts, season.ts, preference.ts
│  │  ├─ search.ts             # beam search por ranuras
│  │  ├─ diversify.ts
│  │  └─ explain.ts
│  ├─ platform/                # storage.ts, sw.ts, files.ts
│  └─ styles/                  # tokens.css, global.css
├─ tests/
│  ├─ fixtures/                # inventarios sintéticos (nunca datos reales)
│  └─ e2e/                     # Playwright
├─ scripts/
│  └─ validate-package.ts      # valida un manifest/ZIP desde Node (lo uso yo al catalogar)
├─ docs/
└─ private/                    # IGNORADO por git: datos reales para pruebas locales
```

Las pruebas unitarias van junto al código (`*.test.ts`). Ninguna feature importa otra feature.

## 5. Persistencia

### Tablas Dexie (v1)

| Tabla | Clave | Índices | Contenido |
|---|---|---|---|
| `items` | `id` | `categoryId`, `status`, `updatedAt` | Fichas (sin binarios) |
| `images` | `id` | `itemId`, `sha256`, `source.sha256` | Metadatos de imagen |
| `blobs` | `[imageId+variant]` | `imageId` | Binarios `display` y `thumb` |
| `outfits` | `id` | `createdAt` | Conjuntos guardados |
| `wearLog` | `id` | `date`, `*itemIds` | Registro de uso |
| `feedback` | `id` | `at`, `target`, `*itemIds` | Eventos de preferencia (Fase 5; tabla creada desde v1) |
| `kits` | `id` | `createdAt` | Kits de catalogación exportados (Fase 2; tabla creada desde v1) |
| `vocab` | `[kind+id]` | `kind` | Entradas de vocabulario añadidas por el usuario |
| `settings` | `key` | — | Pesos, preferencias, `lastExportAt`… |

IndexedDB no indexa booleanos: favoritos y borradores se filtran en memoria. Los binarios van en una tabla aparte para que listar fichas o imágenes no arrastre blobs. Con un inventario de cientos de prendas, los filtros del catálogo se hacen **en memoria** (se cargan todas las fichas, que son ligeras); los índices solo cubren lo que ahorra trabajo real.

### Reglas

- Toda operación que toque varias tablas (crear prenda con fotos, borrar prenda, importar) se ejecuta en **una transacción** Dexie.
- Borrar una prenda elimina sus imágenes y blobs; los outfits que la contenían se conservan marcados como `incompleto` (no se reescribe el historial).
- `schemaVersion` del modelo = versión Dexie. Cada cambio de esquema añade `db.version(n).upgrade()` y una migración equivalente para paquetes importados.
- Al arrancar se llama a `navigator.storage.persist()` (y desde Ajustes manualmente). El resultado se muestra tal cual: “persistente concedido / no concedido”. Nunca se asume.

## 6. Imágenes

| Variante | Tamaño | Formato | Peso aprox. | Uso |
|---|---|---|---|---|
| `display` | lado mayor 1600 px | WebP q≈0,82 | 150–350 KB | Ficha, zoom, copias |
| `thumb` | lado mayor 400 px | WebP q≈0,75 | 15–35 KB | Cuadrícula, outfits |

- **No se guarda el original** de la cámara (3–6 MB) por defecto: 300 prendas × 2 fotos serían ~3 GB. El esquema admite la variante `original` para una opción futura (ADR-004).
- **El archivo de origen nunca se modifica.** El pipeline lee el `File` del selector y produce variantes nuevas; la foto sigue intacta en la galería del móvil.
- De cada original se guarda una **huella** (`source`: nombre, tamaño, fecha, SHA-256). Si vuelves a importar esa misma foto, la app la reconoce (evita duplicados y permite sustituir la imagen de una prenda por una versión mejor).
- **Sustituir** una imagen es una operación atómica (alta de la nueva + baja de la anterior en la misma posición). Recortar de nuevo parte de `display`.
- Captura con `<input type="file" accept="image/*" capture="environment">` (cámara nativa, mejor calidad que `getUserMedia`) y galería con `multiple`.
- Procesado con `createImageBitmap` + `OffscreenCanvas` (con alternativa `<canvas>`), de uno en uno para no agotar memoria. En Fase 1 (altas individuales) corre en el hilo principal; en Fase 2 (lotes) el mismo módulo se ejecuta en un **Web Worker**.
- Reencodificar elimina los metadatos EXIF, **incluida la ubicación GPS**. Ventaja de privacidad deliberada.
- Se calcula SHA-256 del `display` para detectar fotos duplicadas.
- HEIC/HEIF: Chrome Android no lo decodifica de forma fiable. Se detecta y se muestra un error claro (“configura la cámara en JPEG”).
- Las URLs `blob:` creadas para mostrar imágenes se revocan al desmontar componentes (evita fugas de memoria en la cuadrícula).

## 6.1 Robustez (v0.1.1)

Tras el fallo en Android de la v0.1.0 (ver `TESTING.md`, incidencia 2026-10-11):

- **Ninguna operación espera para siempre.**
  - Cada paso del procesado de imagen (leer, decodificar, codificar) tiene un tiempo límite de 30 s.
  - Cada transacción de escritura tiene un tiempo límite de 20 s. Al vencer, la transacción se **aborta** para liberar el bloqueo de IndexedDB, y el usuario recibe un mensaje claro con el formulario intacto.
- **Consultas con estados diferenciados** (`useDbQuery`): cargando → lenta (8 s, con «Reintentar» y diagnóstico) → lista / error. Sustituye a `useLiveQuery`, que podía dejar «Cargando…» indefinidamente.
- **Lectura tolerante** (`loadItems`): las fichas que no validan se apartan y se señalan, sin borrarlas ni impedir ver el resto.
- **Binarios como `ArrayBuffer` + tipo** en lugar de `Blob`. Reduce la dependencia del almacenamiento de Blobs de cada navegador. Los registros con Blob de la v0.1.0 se siguen leyendo, sin migración.
- **Procesado de imagen más defensivo:**
  - El archivo se lee a memoria una sola vez (las fotos de galería pueden venir de un proveedor en la nube).
  - El canvas trabaja en CPU (`willReadFrequently`); si la codificación falla, se repite con un canvas del DOM.
  - Límite de 100 MP.
  - Errores por archivo: un fallo no detiene el resto del lote y se puede reintentar.
- **Errores visibles y registrados:**
  - Manejadores globales de `error` y `unhandledrejection`.
  - Error boundary por pantalla: un fallo no tumba la navegación.
  - Registro de los últimos 30 errores en `localStorage`, que funciona aunque IndexedDB no responda.
- **Diagnóstico** (`#/diagnostico`, solo lectura):
  - Abre IndexedDB con la API nativa y con Dexie.
  - Hace recuentos, revisa coherencia (referencias rotas, huérfanos) y muestra los últimos errores.
  - El informe se puede copiar; contiene IDs y recuentos, nunca nombres ni fotos.

## 7. Offline e instalación

- vite-plugin-pwa genera el SW con precache de todo el build (JS, CSS, HTML, iconos). Estrategia: cache-first para el app shell; no hay llamadas de datos a red.
- Actualizaciones con `registerType: 'prompt'`: aviso “Nueva versión disponible · Actualizar”. No se recarga en mitad de una edición.
- Si una versión nueva sube la versión de la base de datos y queda una pestaña antigua abierta, Dexie lanza `VersionError`: se captura y se pide recargar.
- Manifest: `display: standalone`, `start_url` y `scope` = `/armario-digital/`, iconos maskable.
- **Origen:** `https://ivanalejo.github.io/armario-digital/` (decidido, ADR-007). Repositorio propio `ivanalejo/armario-digital`, independiente del de entreno; comparten **origen** (dominio), no código. Consecuencias en §10.

### GitHub Pages: requisitos y límites (comprobado en la documentación oficial, 2026-10-11)

| Aspecto | Realidad | Impacto |
|---|---|---|
| Plan gratuito | Solo repos **públicos** | El código es público; los datos nunca están en el repo (§9) |
| Tamaño publicado | Máx. 1 GB; repo recomendado ≤ 1 GB | La app pesa < 1 MB |
| Tráfico | Límite blando 100 GB/mes; puede devolver 429 | Irrelevante: tras instalarse, la app sale del caché |
| Despliegue | Timeout 10 min; con workflow propio de Actions no aplica el límite de 10 builds/hora | Despliegue con GitHub Actions |
| Cabeceras HTTP | No configurables | CSP vía `<meta>` (no admite `frame-ancestors`); sin COOP/COEP |
| Rutas | Sin reescrituras de servidor | Hash routing |
| HTTPS | Automático en `*.github.io` | Requisito para SW e instalación: cumplido |
| Registros | GitHub registra la IP de los visitantes | Solo ve descargas de la app, nunca datos del armario |
| Visibilidad | Todo lo publicado es accesible por URL | `dist/` solo contiene la app; comprobado por script (§9) |

## 8. Recomendador (diseño v1)

Motor puro: `recommend(inventory, request, context) → Outfit[]`. Sin React, sin Dexie, determinista (misma entrada → misma salida; desempates por ID).

### Entrada

- `inventory`: fichas disponibles (`status = available`, `isDraft = false`).
- `request`: `occasionId`, `weather` (`hot | mild | cold`) + `rain: boolean`, `mustInclude[]`, `exclude[]`, `preferredColors[]`, `formalityShift` (−1/0/+1), `comfortFirst`, `rediscover` (impulsar prendas olvidadas), `count` (5 por defecto).
- `context`: historial de uso, pesos configurados, fecha (para estación por defecto).

### Ranuras de un outfit

`base` (camiseta/polo/camisa) · `mid` opcional (jersey, sudadera, sobrecamisa, americana) · `outer` opcional/obligatoria según clima · `bottom` · `footwear` · `accessories` (0–3). Cada subcategoría declara en el vocabulario en qué ranuras puede ir (`DATA_MODEL.md §4`).

### Pipeline

1. **Filtros duros:** disponibilidad, exclusiones de la ocasión (p. ej. chanclas en oficina), formalidad confirmada fuera de rango por ≥ 1,5 niveles (las estimadas nunca excluyen), prendas incompatibles con el clima (abrigo con calor). Las prendas obligatorias **no se filtran nunca**; si violan una regla dura se avisa (“has fijado X, que no encaja con Evento formal”).
2. **Pre-puntuación individual** de cada prenda frente a la ocasión y el clima; se quedan las 12 mejores por ranura (+ obligatorias).
3. **Búsqueda por haz (beam search)** ranura a ranura (bottom → base → footwear → mid → outer), conservando las 200 mejores combinaciones parciales con puntuación por pares. Acota el coste con inventarios grandes.
4. **Accesorios** de forma voraz al final (cinturón si hay pantalón con trabillas y formalidad ≥ 3, reloj, bufanda si hace frío).
5. **Diversificación (MMR):** se eligen los N mejores penalizando los que comparten ≥ 2 de las 3 piezas principales (base, bottom, footwear) con uno ya elegido.
6. **Explicación:** las 2–3 reglas que más suman y cualquier aviso (“faltan datos de formalidad en 2 prendas”).

**Silueta (desde v1 del motor):** con los atributos `cut` se añaden reglas de proporción dentro del criterio de estilo: volumen arriba vs. abajo (oversize + tapered/slim equilibra; oversize + baggy solo puntúa bien en estilo urbano), largo de la prenda exterior frente al de la superior, `structure` coherente con la formalidad (americana estructurada sube formalidad), pantalón `stacked`/`wide-leg` con calzado `chunky` frente a `sleek`. Atributo desconocido → neutro, como el resto.

### Puntuación (0–100)

`total = Σ peso_i × subpuntuación_i` (subpuntuaciones 0–1). Pesos iniciales configurables:

| Criterio | Peso | Reglas v1 |
|---|---|---|
| Color | 30 | Neutros combinan con todo; ≤ 2 colores no neutros; mismo tono de familia = combinación tonal válida; contraste claro/oscuro entre base y bottom suma; máximo un estampado “fuerte”; cinturón y zapatos de piel del mismo color suman. |
| Ocasión y formalidad | 25 | Distancia del rango de cada prenda al objetivo de la ocasión; pesa más la peor prenda (media 50 % + mínimo 50 %); dispersión alta de formalidad entre piezas resta. |
| Estilo | 20 | Matriz de compatibilidad entre estilos (clásico↔minimalista alta, deportivo↔clásico baja) + bonus por estilos preferidos de la ocasión. |
| Temporada y función | 15 | Suma de abrigo (`warmth`) frente al objetivo del clima; lluvia → valora prendas impermeables; temporadas como respaldo si falta `warmth`. |
| Preferencias y variedad | 10 | Favoritos, colores pedidos, comodidad, prendas no usadas recientemente; modo “redescubrir” para las olvidadas. |

**Datos desconocidos:** un atributo ausente puntúa 0,5 (neutro) y nunca provoca un veto. Cada outfit lleva un indicador de **confianza** según el porcentaje de atributos conocidos.

**Variedad sin castigar lo imprescindible:** la penalización por uso reciente solo se aplica a piezas no obligatorias, está limitada a −5 puntos y solo reordena opciones de puntuación parecida; nunca elimina una prenda.

**Sustituir una pieza:** `alternativesFor(outfit, slot)` recalcula el total con el resto fijo y devuelve las alternativas ordenadas.

**“Más propuestas”:** paginación determinista sobre el ranking (no aleatoriedad), para que el resultado sea reproducible y testeable.

### 8.2 Personalización progresiva (diseño; implementación en Fase 5)

Aprendizaje local, sin IA ni servicios externos: estadística sencilla sobre tus propias interacciones.

**Señales** (tabla `feedback`, solo inserción; `DATA_MODEL.md §3.6`):

| Interacción en la UI | Evento | Fuerza |
|---|---|---|
| Valorar outfit 1–5 ★ | `rating` | −2 … +2 |
| Guardar como favorito | `favorite` | +2 |
| Registrar que lo has usado | `worn` | +1 |
| Descartar “no me gusta” (con motivo opcional) | `dismiss` | −1 |
| Descartar “hoy no” | `dismiss` + `reason: not-today` | 0 (solo lo oculta hoy) |
| “Me gusta / no me gusta esta parte” | `like`/`dislike` + `slot` | ±1 a la pieza dentro de ese conjunto |
| Sustituir una pieza | `swap` | −0,5 a la quitada, +0,5 a la puesta (con el resto del conjunto) |
| Me gusta / no me gusta una prenda suelta | `like`/`dislike`, `target: item` | ±1 a la prenda en sí |

**Separación prenda / combinación.** De cada evento de outfit se extraen rasgos a tres niveles, y cada uno acumula su propia afinidad:
1. *Prenda*: “me gusta esta camisa” (en cualquier conjunto).
2. *Pareja*: “esta camisa con estos chinos” (pares entre ranuras).
3. *Rasgo*: pares de colores (base×bottom…), pares de silueta (`fit` arriba × `leg` abajo), estilo, formalidad relativa a la ocasión.
Un `like` de prenda solo alimenta el nivel 1; un `dislike` de parte de un outfit alimenta sobre todo el nivel 2 (la combinación), no condena la prenda.

**Cálculo de afinidad** para cada rasgo `f`:

```
afinidad(f) = Σ sᵢ·w(tᵢ) / (Σ w(tᵢ) + k)        ∈ [−1, 1] tras normalizar
w(t) = 0,5·2^(−edad/30 días) + 0,5·2^(−edad/365 días)
```

- `k` (≈ 3) es un **prior de contracción**: con una sola valoración la afinidad apenas se mueve; hacen falta varias señales coherentes para cambiar el ranking.
- Doble semivida: lo reciente pesa más (30 días), pero lo antiguo no se olvida del todo (365 días).
- Las señales se aprenden por **contexto** (ocasión): que no te guste una camisa para una cena no la penaliza para la oficina, salvo señales repetidas en varios contextos.

**Uso en la puntuación.** La afinidad alimenta el criterio “Preferencias y variedad” (10 % inicial, ajustable hasta 25 %). Nunca anula una regla dura ni una prenda obligatoria.

**Contra la repetición.**
- La diversificación (MMR) se mantiene.
- Penalización por exposición: un conjunto ya propuesto muchas veces sin respuesta pierde puntos poco a poco.
- **Exploración:** 1 de cada 5 propuestas se reserva para una combinación válida con prendas o rasgos poco vistos (con una puntuación mínima). Así tus gustos pueden evolucionar en vez de quedarse fijados.

**Transparencia y control.** La explicación dice cuándo pesa el aprendizaje (“has valorado bien camisa azul + chinos beige”). Ajustes permite ver los rasgos con más afinidad, borrar señales y reiniciar el modelo. El modelo es un **derivado** del registro de eventos: se recalcula, no se guarda como verdad. Los eventos se incluyen en las copias de seguridad.

**Datos necesarios.** Fichas con atributos (colores, estilos, `cut`), eventos de `feedback` con contexto, y historial de uso. Con menos de ~20 eventos el aprendizaje es casi neutro por diseño.

Las ocasiones, la matriz de estilos y las reglas de color son **datos** (`engine/occasions.ts`, etc.), no lógica dispersa: se ajustan sin tocar el algoritmo. Ajustes incluirá una vista de depuración con las subpuntuaciones para calibrar pesos con outfits reales.

### Lo que el motor NO hace

No “ve” las prendas: solo conoce sus atributos. Si la ficha dice que una camisa es azul marino y es azul claro, la recomendación será mala. La calidad depende de la catalogación.

## 9. Garantías de privacidad (técnicas)

1. **CSP** en `<meta>`: `default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'`. El navegador bloquea cualquier `fetch`/XHR/WebSocket a otro origen aunque una dependencia lo intentara.
2. **Lint:** regla `no-restricted-globals`/`no-restricted-properties` que prohíbe `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` y `navigator.sendBeacon` fuera de `platform/` (que solo los usa para nada de datos; en v1, para nada).
3. **E2E:** Playwright registra todas las peticiones durante los flujos completos y falla si hay alguna que no sea `GET` a archivos estáticos del propio origen.
4. Sin analítica, sin fuentes ni CDNs externos. Dependencias auditadas con `npm ls` al añadirlas.
5. **Protección del repositorio** (para que ninguna foto o copia llegue a Git ni a lo publicado):
   - `.gitignore` bloquea imágenes, ZIPs, JSON de exportación y la carpeta `private/` (con excepciones explícitas solo para los iconos de la app).
   - Hook `pre-commit` versionado (`.githooks/`, activado por `npm install`) que rechaza el commit si se añade cualquier imagen fuera de `public/icons/`, un `.zip`, un manifiesto `armario-digital` fuera de `tests/fixtures/`, o un archivo de más de 1 MB.
   - El mismo control se repite en el workflow de CI (no depende de que el hook esté activo en tu equipo).
   - `scripts/check-dist.mjs` revisa `dist/` antes de desplegar: solo pueden existir los tipos de archivo de la app y los iconos conocidos.
   - Los fixtures de prueba se **generan** por código; nunca se usan fotos reales.

## 10. Riesgos

### Resolubles (se resuelven con diseño)

| Riesgo | Solución |
|---|---|
| Duplicados al importar | IDs estables + detección por SHA-256 de imagen + plan de importación con resolución explícita por prenda. |
| Fotos que agotan memoria/espacio | Sin originales, WebP 1600/400 px, worker secuencial. |
| Rutas 404 en GitHub Pages | Hash routing. |
| Copias enormes que revientan la memoria | ZIP en streaming (fflate) sin recomprimir imágenes (modo STORE). |
| Cambios de esquema que rompen copias antiguas | `formatVersion`/`schemaVersion` + migraciones; el importador acepta todas las versiones anteriores. |
| Datos que salen del dispositivo | CSP + lint + test e2e de red (§9). |

### Reducibles (no se eliminan)

| Riesgo | Mitigación |
|---|---|
| El navegador borra IndexedDB por presión de espacio | `storage.persist()`; la PWA instalada suele obtenerlo, pero no está garantizado. |
| El usuario no exporta | Indicador en Inicio: “Última exportación generada hace N días · M cambios sin exportar”. Recordatorio pasado un umbral. |
| Pérdida o rotura del móvil | Solo la copia exportada fuera del móvil (Drive, PC) lo cubre. La app no puede hacerlo por ti sin romper el requisito de privacidad. |
| Fotos HEIC | Detección y mensaje claro. |
| Fallos de una importación a medias | Validación completa antes de escribir; escritura en una sola transacción (todo o nada). |

### Limitaciones inherentes del navegador

- **Los datos pertenecen al par navegador + origen.** Lo guardado en Chrome no existe en Samsung Internet ni Firefox. Cambiar la URL (otro dominio, otro usuario de GitHub) = base de datos vacía; solo se migra con copia.
- **Origen compartido con la PWA de entreno.** Ambas viven en `ivanalejo.github.io`: comparten cuota, el permiso de almacenamiento persistente y, sobre todo, **“Borrar datos del sitio” en Chrome borra las dos**. Las bases de datos no se pisan (nombres distintos). Alternativa: un dominio propio solo para el armario (ver ADR-007).
- **Borrar datos de Chrome**, “Borrar almacenamiento” de la app Chrome en Android o desinstalar la PWA puede eliminar el inventario.
- **No se puede confirmar que una copia se ha guardado.** En Android la descarga o el “Compartir” salen de la app; solo se puede registrar que el archivo se **generó**. La app nunca dirá “respaldado”, sino “exportación generada el …”.
- `navigator.storage.estimate()` da cifras aproximadas (incluye relleno anti-fingerprinting).
- La primera carga necesita conexión; el SW puede tardar una visita en controlar la página.
- Sin acceso al sistema de archivos ni copias automáticas en segundo plano (Background Sync/periodic sync no sirven para escribir archivos locales).
