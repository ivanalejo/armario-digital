# Modelo de datos

Versión del esquema: **1** · Estado: aprobado (Fase 0) con ampliaciones de cortes/siluetas y preferencias (2026-10-11)

Fuente de verdad en código (a partir de Fase 1): `src/domain/schema/*.ts` (Zod). Este documento y el código deben coincidir; si no, manda el código y se corrige el documento.

## 1. Convenciones generales

- **Identificadores de vocabulario:** ASCII, minúsculas, kebab-case, en inglés (`light-blue`, `smart-casual`). Estables para siempre; las etiquetas visibles están en español y pueden cambiar.
- **Fechas:** ISO 8601 en UTC (`2026-10-11T18:57:00Z`). Fechas sin hora (registro de uso): `YYYY-MM-DD` en hora local.
- **Desconocido vs. inexistente** (regla aplicada a todos los campos opcionales):

| Valor en JSON | Significado | Ejemplo |
|---|---|---|
| campo **ausente** | No se sabe / no se ha rellenado | sin `brand` → marca desconocida |
| `null` | Confirmado que no existe o no aplica | `"brand": null` → sin marca visible / marca blanca |
| `[]` (listas) | Confirmado vacío | `"secondary": []` → un solo color |
| valor | Dato conocido | `"brand": "Uniqlo"` |

- **Confirmado / estimado / desconocido.** Cada dato tiene uno de tres estados, sin añadir campos por atributo:

| Estado | Cómo se representa |
|---|---|
| Desconocido | El campo no existe en la ficha |
| Estimado | El campo tiene valor **y** su ruta aparece en `estimated` (p. ej. `"estimated": ["cut.leg", "formality"]`) |
| Confirmado | El campo tiene valor (o `null`) y su ruta **no** está en `estimated` |

  Lo que estima Claude (o cualquier deducción automática) entra siempre en `estimated`. Lo que escribe o toca el usuario en la app pasa a confirmado: editar un campo lo quita de la lista; “Confirmar todo” la vacía. La UI marca los estimados con un punto ámbar.

## 2. IDs de entidad

| Entidad | Formato | Ejemplo |
|---|---|---|
| Prenda creada en la app | `itm_` + ULID en minúsculas (26 car.) | `itm_01jae4k8d2x7q9m3v5t1b6c0wz` |
| Prenda catalogada externamente (Claude) | `itm_` + `c` + fecha `AAAAMMDD` + letra de lote + `_` + nº de 2–3 dígitos | `itm_c20261011a_07` |
| Imagen | `img_` + mismo criterio | `img_c20261011a_07_1` |
| Outfit | `out_` + ULID | |
| Uso registrado | `wear_` + ULID | |
| Evento de preferencia | `fb_` + ULID | |
| Kit de catalogación | `kit_` + ULID | |

Regex común: `^(itm|img|out|wear|fb|kit)_[a-z0-9_]{6,48}$`. El ID es **opaco**: no codifica categoría (una prenda reclasificada conserva su ID). Nunca se reutiliza un ID, ni siquiera de una prenda borrada.

## 3. Entidades

### 3.1 Item (prenda, calzado o accesorio)

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | string | **Sí** | Ver §2 |
| `name` | string (1–80) | **Sí** | “Camisa Oxford azul claro” |
| `categoryId` | CategoryId | **Sí** | §4.1 |
| `subcategoryId` | SubcategoryId | Sí* | *Puede faltar solo en borradores |
| `status` | Status | **Sí** | Por defecto `available` |
| `isDraft` | boolean | **Sí** | Borradores: no entran en el recomendador |
| `favorite` | boolean | **Sí** | Por defecto `false` |
| `createdAt` | datetime | **Sí** | Fecha de alta en el inventario |
| `updatedAt` | datetime | **Sí** | |
| `colors.primary` | ColorId | Sí* | *Puede faltar en borradores |
| `colors.secondary` | ColorId[] | No | `[]` = confirmado sin secundarios |
| `description` | string (≤ 280) | No | |
| `styles` | StyleId[] (1–3) | No | Recomendado |
| `formality` | `{ min: 1–5, max: 1–5 }` | No | Recomendado. `min = max` si es un único nivel |
| `seasons` | SeasonId[] | No | Las cuatro = todo el año |
| `warmth` | 1–5 | No | Grosor/abrigo (§4.7). Recomendado en partes superiores y exteriores |
| `waterproof` | boolean | No | Exteriores y calzado |
| `pattern` | PatternId | No | |
| `material` | string \| null | No | Texto libre corto (“algodón”, “lana merino”) |
| `brand` | string \| null | No | |
| `cut` | `{ [atributo]: valorId \| null }` | No | Corte y silueta. Atributos **según categoría/subcategoría** (§4.8). Ej.: `{ "leg": "tapered", "rise": "mid" }` |
| `comfort` | 1–5 | No | Lo rellena el usuario, nunca Claude |
| `setId` | string | No | Agrupa piezas de un traje o conjunto (chaqueta + pantalón) |
| `tags` | string[] | No | Etiquetas libres; **el motor no las usa** |
| `notes` | string | No | Notas personales |
| `acquiredAt` | `YYYY-MM` \| `YYYY` | No | Cuándo se compró (opcional, distinto de `createdAt`) |
| `imageIds` | string[] | **Sí** | Orden = orden de visualización; `[0]` = foto principal. Puede ser `[]` |
| `estimated` | string[] | No | Rutas de campos estimados (ver §1). Ausente o `[]` = todo confirmado |
| `reviewNote` | string | No | Comentario del catalogador sobre dudas (“foto oscura, color aproximado”) |
| `issues` | `{ type: 'multiple-items' \| 'unusable-photo' \| 'possible-duplicate' \| 'other', of?: itemId, note? }[]` | No | Incidencias señaladas al catalogar; la UI las muestra hasta que se resuelven |
| `source` | `{ kind: 'app' \| 'import', batchId?: string }` | No | Trazabilidad del lote de origen |

**Status:**

| ID | Etiqueta | ¿Recomendable? |
|---|---|---|
| `available` | Disponible | Sí |
| `laundry` | Para lavar | No |
| `stored` | Guardada (fuera de temporada, trastero) | No |
| `repair` | En arreglo | No |
| `lent` | Prestada | No |
| `retired` | Dada de baja | No (se conserva para el historial; oculta por defecto) |

### 3.2 Image (metadatos)

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | string | Sí | |
| `itemId` | string | Sí | Una imagen pertenece a una sola prenda |
| `mime` | `image/webp \| image/jpeg` | Sí | |
| `width`, `height` | int | Sí | De la variante `display` |
| `bytes` | int | Sí | De la variante `display` |
| `sha256` | hex(64) | Sí | De la variante `display` |
| `createdAt` | datetime | Sí | |
| `source` | `{ name?, bytes?, lastModified?, sha256? }` | No | Huella del archivo **original** del que salió la imagen (no se guarda el original). Permite reconocer una reimportación de la misma foto y sustituir la imagen después |

Binarios en la tabla `blobs` con clave `[imageId, variant]`, `variant ∈ { display, thumb, original }`.

- `display` (≤ 1600 px, WebP, sin EXIF/GPS) y `thumb` (≤ 400 px) siempre.
- `original` **no se guarda por defecto**. El esquema la admite para una futura opción “conservar originales”; si se activara, el original se guardaría tal cual (con su EXIF) y nunca saldría en kits de catalogación.
- El procesado **lee** el archivo de origen y escribe variantes nuevas: nunca modifica ni borra la foto del móvil.
- **Sustituir** una imagen crea un registro nuevo en la misma posición de `imageIds` y elimina el anterior en la misma transacción. Recortar de nuevo una imagen ya guardada parte de `display` (o de `original` si existe).
- Las copias con el ID impreso del kit de catalogación se generan al vuelo al exportar y **no se guardan** en la base de datos.

### 3.3 Outfit

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | string | Sí | |
| `name` | string | No | |
| `slots` | `{ base?, mid?, outer?, bottom?, footwear?: itemId, accessories?: itemId[] }` | Sí | |
| `occasionId` | OccasionId | No | |
| `origin` | `generated \| manual` | Sí | |
| `scoreSnapshot` | `{ total, breakdown, weightsVersion }` | No | Puntuación al guardarlo (informativa) |
| `favorite` | boolean | Sí | |
| `createdAt` | datetime | Sí | |
| `notes` | string | No | |

### 3.4 WearEntry (registro de uso)

`{ id, date: 'YYYY-MM-DD', itemIds: string[], outfitId?: string, occasionId?: string, note?: string }`. El “último uso” de cada prenda se calcula a partir de aquí (no se duplica en `Item`).

### 3.5 VocabEntry (vocabulario añadido por el usuario)

`{ kind: 'category' | 'subcategory' | 'style', id, label, parentId?, slots?, custom: true }`. Una subcategoría personalizada **debe** declarar sus ranuras (`slots`), porque el motor las necesita. Colores, temporadas, formalidad y patrones no son ampliables en v1 (el motor tiene reglas específicas para cada valor); se amplían con alias o con una versión nueva del vocabulario.

### 3.6 FeedbackEvent (preferencias; tabla creada en v1, se usa en Fase 5)

Registro **solo de inserción** de interacciones. El modelo de preferencias se calcula a partir de él y se puede recalcular o reiniciar en cualquier momento (ver `ARCHITECTURE.md §8.2`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | `fb_…` |
| `at` | datetime | |
| `target` | `outfit \| item \| pair` | A qué se refiere la señal |
| `kind` | `rating \| like \| dislike \| favorite \| unfavorite \| dismiss \| worn \| swap` | |
| `value` | number | `rating`: 1–5. `like`/`dislike`: implícito (+1/−1) |
| `itemIds` | string[] | Prendas implicadas (1 para `item`, 2 para `pair`, todas para `outfit`) |
| `outfit` | `{ slots, key }` | Instantánea del conjunto evaluado. `key` = huella canónica (IDs ordenados por ranura) para reconocer el mismo conjunto |
| `slot` | Slot | Parte del conjunto valorada (“me gusta la parte de arriba”) |
| `replacedItemId` | string | Solo `swap`: la pieza que se quitó (`itemIds` contiene la que se puso) |
| `reason` | `not-today \| style \| colors \| fit \| formality \| weather \| other` | Opcional. `not-today` no cuenta como preferencia |
| `context` | `{ occasionId?, weather?, rain? }` | Para no aprender de una ocasión lo que se dijo en otra |
| `source` | `recommender \| manual` | |

### 3.7 Kit (catalogación; tabla creada en v1, se usa en Fase 2)

`{ id, createdAt, itemIds: string[], checks: { [itemId]: string }, parts: number, status: 'exported' | 'applied' | 'partial' | 'cancelled', appliedAt? }`. Ver `IMPORT_EXPORT.md §4`.

### 3.8 Settings

Clave-valor: `weights`, `defaultOccasion`, `lastExportAt`, `itemsChangedSinceExport`, `persistRequested`, `persistGranted`, `exportReminderDays` (14 por defecto).

## 4. Vocabulario controlado (v1)

### 4.1 Categorías y subcategorías

`slots` indica en qué posiciones del outfit puede usarse la subcategoría (ver `ARCHITECTURE.md §8`).

| Categoría | Subcategoría (`id` · etiqueta) | slots |
|---|---|---|
| `top` · Parte superior | `tshirt` · Camiseta | base |
| | `polo` · Polo | base |
| | `shirt` · Camisa | base |
| | `overshirt` · Sobrecamisa | mid, outer |
| | `sweatshirt` · Sudadera | base, mid |
| | `hoodie` · Sudadera con capucha | base, mid |
| | `sweater` · Jersey | base, mid |
| | `cardigan` · Cárdigan / chaqueta de punto | mid |
| | `sport-top` · Camiseta técnica | base |
| `bottom` · Parte inferior | `jeans` · Vaqueros | bottom |
| | `chinos` · Chinos | bottom |
| | `trousers` · Pantalón de vestir | bottom |
| | `joggers` · Pantalón de chándal / jogger | bottom |
| | `shorts` · Pantalón corto | bottom |
| | `sport-shorts` · Pantalón corto deportivo | bottom |
| `outerwear` · Prenda exterior | `blazer` · Americana | mid |
| | `jacket` · Chaqueta / cazadora | outer |
| | `coat` · Abrigo | outer |
| | `parka` · Parka | outer |
| | `puffer` · Plumífero | outer |
| | `raincoat` · Impermeable | outer |
| | `gilet` · Chaleco | mid |
| `footwear` · Calzado | `sneakers` · Zapatillas | footwear |
| | `sport-shoes` · Zapatillas deportivas | footwear |
| | `shoes` · Zapatos | footwear |
| | `loafers` · Mocasines | footwear |
| | `boots` · Botas | footwear |
| | `sandals` · Sandalias / chanclas | footwear |
| `accessory` · Accesorio | `belt` · Cinturón | accessory |
| | `watch` · Reloj | accessory |
| | `cap` · Gorra / sombrero | accessory |
| | `scarf` · Bufanda | accessory |
| | `bag` · Bolso / mochila | accessory |
| | `sunglasses` · Gafas de sol | accessory |
| | `tie` · Corbata | accessory |
| | `other-accessory` · Otro complemento | accessory |

La americana va en `mid` a propósito: así puede llevar un abrigo encima. Un traje = americana + pantalón con el mismo `setId`.

### 4.2 Colores

Cada color tiene `family`, `tone` y si es **neutro** (para el motor). Los alias se normalizan al importar y al buscar (sin mayúsculas ni tildes).

| id | Etiqueta | Alias aceptados | family | tone | neutro |
|---|---|---|---|---|---|
| `black` | Negro | — | neutral | dark | ✔ |
| `charcoal` | Gris marengo | gris oscuro, antracita | neutral | dark | ✔ |
| `grey` | Gris | gris medio, gris jaspeado | neutral | mid | ✔ |
| `light-grey` | Gris claro | perla | neutral | light | ✔ |
| `white` | Blanco | — | neutral | light | ✔ |
| `off-white` | Crudo | hueso, marfil, ecru, blanco roto | neutral | light | ✔ |
| `beige` | Beige | arena, piedra, stone | neutral | light | ✔ |
| `camel` | Camel | tostado, tan | brown | mid | ✔ |
| `brown` | Marrón | chocolate, cuero | brown | dark | ✔ |
| `navy` | Azul marino | navy, azul oscuro, azul noche | blue | dark | ✔ |
| `blue` | Azul | azul medio, azulón, royal | blue | mid | |
| `light-blue` | Azul claro | celeste, azul cielo | blue | light | |
| `denim` | Azul vaquero | índigo, indigo | blue | mid | ✔ |
| `olive` | Verde oliva | caqui, khaki, verde militar | green | mid | ✔ |
| `green` | Verde | — | green | mid | |
| `dark-green` | Verde botella | verde bosque | green | dark | |
| `burgundy` | Burdeos | granate, vino | red | dark | |
| `red` | Rojo | — | red | mid | |
| `pink` | Rosa | rosa palo | red | light | |
| `orange` | Naranja | teja, óxido | yellow | mid | |
| `mustard` | Mostaza | ocre | yellow | mid | |
| `yellow` | Amarillo | — | yellow | light | |
| `purple` | Morado | lila, malva, violeta | purple | mid | |
| `silver` | Plateado | acero | metal | light | ✔ |
| `gold` | Dorado | — | metal | mid | ✔ |

“Neutro” sigue el criterio clásico de armario masculino: marino, oliva, camel, marrón y vaquero combinan con casi todo. `denim` se usa para el color de los vaqueros; el lavado concreto (oscuro/claro) se refleja eligiendo `navy`/`denim`/`light-blue`. No existe “multicolor”: se elige un color principal y se usa `pattern`.

### 4.3 Estilos (multiselección, 1–3)

| id | Etiqueta | Descripción breve |
|---|---|---|
| `classic` | Clásico | Sastrería, camisas, chinos, piel |
| `minimal` | Minimalista | Líneas limpias, lisos, neutros |
| `casual` | Casual | Básicos diarios sin pretensión |
| `streetwear` | Urbano | Sudaderas, gráficos, siluetas amplias, sneakers llamativas |
| `sporty` | Deportivo | Técnico, athleisure |
| `preppy` | Preppy | Polos, Oxford, punto, náutico |
| `workwear` | Utilitario | Sobrecamisas, lona, botas, bolsillos |
| `outdoor` | Outdoor | Montaña, técnico, cortavientos |

Ampliable por el usuario (tabla `vocab`); un estilo nuevo sin entrada en la matriz de compatibilidad del motor se trata como compatibilidad media.

### 4.4 Formalidad (1–5)

| Nivel | Etiqueta | Ejemplos |
|---|---|---|
| 1 | Deporte / estar por casa | Chándal, camiseta técnica, chanclas |
| 2 | Casual | Camiseta, sudadera, vaqueros, zapatillas |
| 3 | Smart casual | Polo, Oxford, chinos, sobrecamisa, mocasines, sneakers de piel |
| 4 | Business | Camisa de vestir, pantalón de vestir, americana, zapatos |
| 5 | Formal | Traje oscuro, corbata, zapatos Oxford |

Se guarda como rango: unos vaqueros oscuros pueden ser `{min: 2, max: 3}`.

### 4.5 Temporadas

`spring` Primavera · `summer` Verano · `autumn` Otoño · `winter` Invierno. Todo el año = las cuatro.

### 4.6 Patrones

| id | Etiqueta | Intensidad (motor) |
|---|---|---|
| `solid` | Liso | 0 |
| `texture` | Textura sutil (espiga, piqué, jaspeado) | 1 |
| `stripes` | Rayas | 2 |
| `checks` | Cuadros | 2 |
| `dots` | Topos / micro-estampado | 2 |
| `graphic` | Gráfico / logo grande | 3 |
| `floral` | Floral | 3 |
| `camo` | Camuflaje | 3 |
| `other` | Otro | 2 |

### 4.7 Abrigo (`warmth`, 1–5)

1 muy ligero (lino, camiseta fina) · 2 ligero · 3 medio (jersey fino, sobrecamisa) · 4 abrigado (jersey grueso, chaqueta acolchada) · 5 muy abrigado (plumífero, abrigo de lana).

### 4.8 Corte y silueta (`cut`)

Cada atributo se define una vez en el vocabulario con los valores admitidos y **a qué categorías o subcategorías se aplica**. La ficha solo muestra los atributos que corresponden a su tipo. Añadir un atributo o un valor nuevo es añadir una entrada al vocabulario: `cut` es un mapa, así que no hay migración de base de datos. Una misma clave puede tener valores distintos según la categoría (p. ej. `length` en partes superiores, inferiores y exteriores); dentro de un tipo de prenda cada clave es única.

Algunos valores llevan un **volumen** (0 ceñido → 3 muy amplio) que usará el recomendador para equilibrar proporciones (p. ej. arriba oversize + abajo tapered).

**Partes superiores** (`top`)

| Atributo | Valores (`id` · etiqueta · volumen) | Se aplica a |
|---|---|---|
| `fit` · Ajuste | `slim` Entallado 0 · `regular` Regular 1 · `relaxed` Holgado 2 · `boxy` Recto/cuadrado 2 · `oversized` Oversize 3 | todas |
| `length` · Largo | `cropped` Corto · `regular` Normal · `long` Largo | todas |
| `sleeve` · Manga | `sleeveless` Sin manga · `short` Corta · `three-quarter` Tres cuartos · `long` Larga | todas |
| `neckline` · Cuello | `crew` Redondo · `v-neck` Pico · `henley` Henley · `polo` Polo · `point-collar` Camisero · `button-down` Button-down · `band` Mao · `mock` Perkins · `turtleneck` Vuelto · `hood` Capucha | todas |
| `drape` · Caída | `structured` Estructurada · `soft` Suave · `fluid` Fluida | todas |

**Partes inferiores** (`bottom`)

| Atributo | Valores | Se aplica a |
|---|---|---|
| `leg` · Pierna | `skinny` Pitillo 0 · `slim` Slim 0 · `tapered` Tapered 1 · `straight` Recto 1 · `bootcut` Bootcut 1 · `relaxed` Relajado 2 · `wide-leg` Ancho 3 · `baggy` Baggy 3 | todas salvo `shorts`, `sport-shorts` |
| `rise` · Tiro | `low` Bajo · `mid` Medio · `high` Alto | todas |
| `length` · Largo | `cropped` Tobillero corto · `ankle` Al tobillo · `full` Completo · `stacked` Con pliegues sobre el zapato | todas salvo shorts |
| `inseam` · Largo (cortos) | `short` Corto (por encima de medio muslo) · `mid` Medio · `knee` A la rodilla | `shorts`, `sport-shorts` |
| `waist` · Cintura | `belt-loops` Trabillas · `elastic` Elástica · `drawstring` Cordón · `side-adjusters` Ajustadores laterales | todas |
| `front` · Delantero | `flat` Liso · `pleated` Con pinzas | `chinos`, `trousers` |
| `drape` · Caída | `structured` · `soft` · `fluid` | todas |

**Prendas exteriores** (`outerwear`)

| Atributo | Valores | Se aplica a |
|---|---|---|
| `fit` · Ajuste | `slim` 0 · `regular` 1 · `relaxed` 2 · `boxy` 2 · `oversized` 3 | todas |
| `length` · Largo | `cropped` Corta · `hip` A la cadera · `thigh` Medio muslo · `knee` A la rodilla · `long` Larga | todas |
| `structure` · Estructura | `structured` Estructurada (hombreras/entretela) · `semi` Semiestructurada · `unstructured` Desestructurada | todas |
| `closure` · Cierre | `single-breasted` Botonadura sencilla · `double-breasted` Cruzada · `zip` Cremallera · `snaps` Automáticos · `open` Abierta | todas |

**Calzado** (`footwear`)

| Atributo | Valores | Se aplica a |
|---|---|---|
| `profile` · Perfil | `sleek` Estilizado · `standard` Estándar · `chunky` Robusto | todas |
| `shaft` · Caña | `low` Baja · `mid` Media (tobillo) · `high` Alta | `sneakers`, `sport-shoes`, `boots` |

**Accesorios:** sin atributos de corte en v1.

Notas de catalogación: el largo y el tiro se estiman mal en fotos de prenda sobre la cama o en percha; Claude debe marcarlos como estimados o dejarlos sin rellenar. `null` en un atributo significa “confirmado que no aplica” (p. ej. `neckline: null` en una prenda sin cuello definible).

### 4.9 Ocasiones (las usa el motor; no se guardan en la prenda)

| id | Etiqueta | Formalidad objetivo | Estilos preferidos | Exclusiones duras |
|---|---|---|---|---|
| `office` | Oficina habitual | 3 (2,5–3,5) | classic, minimal, preppy | sandals, sport-shoes, sport-shorts, shorts |
| `office-formal` | Reunión importante | 4 (3,5–4,5) | classic, minimal | idem + hoodie, sweatshirt, joggers, cap |
| `casual` | Casual | 2 (1,5–3) | casual, minimal, streetwear | — |
| `smart-casual` | Smart casual | 3 (2,5–3,5) | classic, minimal, preppy | sport-shoes, joggers |
| `night-out` | Salida o cena | 3 (2,5–4) | minimal, classic, streetwear | sport-shoes, sport-shorts |
| `formal-event` | Evento formal | 5 (4,5–5) | classic | todo lo de nivel ≤ 2 |
| `sport` | Deporte | 1 (1–1,5) | sporty | shoes, loafers, boots, blazer |

**Clima** es un modificador independiente que se combina con cualquier ocasión: `hot` / `mild` / `cold` + interruptor `rain`. (El requisito original lo listaba como ocasión; separarlo permite “reunión importante con lluvia”.)

## 5. Migraciones

- Cambio compatible (campo opcional nuevo, valor nuevo de vocabulario): no sube `schemaVersion`.
- Cambio incompatible (renombrar/eliminar campo o ID de vocabulario): sube `schemaVersion`, se añade migración Dexie **y** migración de manifiesto `vN → vN+1`. Los IDs de vocabulario retirados se mantienen como alias del nuevo.
