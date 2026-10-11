# Importación y exportación

Formato: **paquete Armario** · `formatVersion: 1` · `schemaVersion: 1` · Estado: aprobado (Fase 0, ampliado 2026-10-11)

Un único formato sirve para tres usos, distinguidos por `kind`:

| `kind` | Quién lo genera | Contenido | Uso |
|---|---|---|---|
| `backup` | La app | Todo: prendas, imágenes (display + thumb), outfits, historial, eventos de preferencia, kits, vocabulario propio, ajustes | Copia de seguridad / migración de dispositivo |
| `batch` | Claude (o un script) | Prendas nuevas con sus imágenes | Alta de prendas catalogadas fuera de la app |
| `patch` | Claude | Solo metadatos de prendas **que ya existen** en la app, sin imágenes | Completar borradores catalogados con el kit (flujo recomendado) |

Extensión: `.armario.zip` (p. ej. `armario-backup-2026-10-11.armario.zip`). Un `patch` puede ser también un `.json` suelto.

## 1. Estructura del ZIP

```
armario-backup-2026-10-11.armario.zip
├─ manifest.json            # siempre en la raíz
├─ images/
│  ├─ img_01jae4….webp      # variante display (obligatoria si hay imágenes)
│  └─ …
└─ thumbs/                  # solo en backups; si falta, la app las regenera
   ├─ img_01jae4….webp
   └─ …
```

- Rutas relativas, separador `/`, sin `..`, sin rutas absolutas, solo `[a-z0-9_.-]`.
- Las imágenes se guardan sin recomprimir (método STORE): ya están en WebP/JPEG.
- En un `batch` de Claude se admiten JPEG o WebP de cualquier tamaño ≤ 20 MB; la app las reprocesa a sus variantes al importar.
- Archivos del ZIP no referenciados en el manifiesto → aviso (se ignoran). Referencias a archivos inexistentes → error de esa imagen.

## 2. Manifiesto

### Cabecera

| Campo | Oblig. | Notas |
|---|---|---|
| `format` | Sí | Siempre `"armario-digital"` |
| `formatVersion` | Sí | Estructura del paquete. Actual: `1` |
| `schemaVersion` | Sí | Versión del modelo de datos (`DATA_MODEL.md`). Actual: `1` |
| `kind` | Sí | `backup` \| `batch` \| `patch` |
| `createdAt` | Sí | ISO 8601 |
| `generator` | Sí | `{ name: "armario-app" \| "claude" \| "script", version?: string }` |
| `batch` | En `batch`/`patch` | `{ id, label?, notes?, pendingImages?: [{ sourceName, reason }] }` |
| `counts` | Sí | `{ items, images, outfits?, wearLog? }` (comprobación de integridad) |
| `items` | Sí | Fichas según `DATA_MODEL.md §3.1` |
| `images` | Sí (puede ser `[]`) | Metadatos + `path` (y `thumbPath` en backups) |
| `outfits`, `wearLog`, `feedback`, `kits`, `vocab`, `settings` | Solo `backup` | `feedback` = registro completo de valoraciones (el modelo de preferencias se recalcula al restaurar) |
| `kitId` | Solo `patch` de kit | Kit al que responde el patch (§4) |

Reglas por tipo:
- `batch`: los campos `createdAt`/`updatedAt`/`status`/`isDraft`/`favorite` de las prendas son **opcionales**; si faltan, la app pone fecha de importación, `available`, `isDraft: false` y `favorite: false`. `sha256`, `width`, `height` y `bytes` de las imágenes son opcionales (la app los calcula).
- `patch`: cada item solo necesita `id` y los campos que cambian. Los campos ausentes **no se tocan** (no significan “desconocido” aquí). `null` sí borra/establece “inexistente”.

`pendingImages` documenta fotos del lote que no se convirtieron en ficha (borrosas, varias prendas sin separar, dudas) para que nada se pierda en silencio.

## 3. Ejemplo realista: backup con tres prendas

```json
{
  "format": "armario-digital",
  "formatVersion": 1,
  "schemaVersion": 1,
  "kind": "backup",
  "createdAt": "2026-10-11T19:30:00Z",
  "generator": { "name": "armario-app", "version": "0.2.0" },
  "counts": { "items": 3, "images": 4, "outfits": 1, "wearLog": 1 },
  "items": [
    {
      "id": "itm_01jae4k8d2x7q9m3v5t1b6c0wz",
      "name": "Camisa Oxford azul claro",
      "categoryId": "top",
      "subcategoryId": "shirt",
      "description": "Oxford de manga larga con cuello abotonado.",
      "colors": { "primary": "light-blue", "secondary": [] },
      "styles": ["classic", "preppy"],
      "formality": { "min": 3, "max": 4 },
      "seasons": ["spring", "summer", "autumn", "winter"],
      "warmth": 2,
      "pattern": "solid",
      "material": "algodón",
      "brand": null,
      "cut": { "fit": "slim", "length": "regular", "sleeve": "long", "neckline": "button-down", "drape": "structured" },
      "status": "available",
      "isDraft": false,
      "favorite": true,
      "imageIds": ["img_01jae4k9a0b1c2d3e4f5g6h7j8", "img_01jae4k9q1r2s3t4v5w6x7y8z9"],
      "createdAt": "2026-10-05T17:12:00Z",
      "updatedAt": "2026-10-09T08:01:00Z",
      "source": { "kind": "import", "batchId": "c20261005a" }
    },
    {
      "id": "itm_c20261005a_02",
      "name": "Chinos beige",
      "categoryId": "bottom",
      "subcategoryId": "chinos",
      "colors": { "primary": "beige", "secondary": [] },
      "styles": ["classic", "casual"],
      "formality": { "min": 2, "max": 3 },
      "seasons": ["spring", "summer", "autumn"],
      "warmth": 2,
      "pattern": "solid",
      "cut": { "leg": "tapered", "rise": "mid", "length": "ankle", "waist": "belt-loops", "front": "flat" },
      "status": "laundry",
      "isDraft": false,
      "favorite": false,
      "imageIds": ["img_c20261005a_02_1"],
      "createdAt": "2026-10-05T17:12:00Z",
      "updatedAt": "2026-10-10T21:40:00Z",
      "estimated": ["cut.leg", "cut.rise", "cut.length"],
      "reviewNote": "Foto en percha: corte y tiro aproximados.",
      "source": { "kind": "import", "batchId": "c20261005a" }
    },
    {
      "id": "itm_01jaf0mzt8e4g6h2k9p3r5s7v1",
      "name": "Botas chukka de ante marrón",
      "categoryId": "footwear",
      "subcategoryId": "boots",
      "colors": { "primary": "brown", "secondary": [] },
      "styles": ["classic", "workwear"],
      "formality": { "min": 2, "max": 3 },
      "seasons": ["autumn", "winter", "spring"],
      "warmth": 3,
      "waterproof": false,
      "cut": { "profile": "standard", "shaft": "mid" },
      "pattern": "solid",
      "material": "ante",
      "status": "available",
      "isDraft": false,
      "favorite": false,
      "notes": "No llevar con lluvia.",
      "imageIds": ["img_01jaf0n1c3d5f7h9k1m3p5r7t9"],
      "createdAt": "2026-10-08T10:03:00Z",
      "updatedAt": "2026-10-08T10:03:00Z",
      "source": { "kind": "app" }
    }
  ],
  "images": [
    { "id": "img_01jae4k9a0b1c2d3e4f5g6h7j8", "itemId": "itm_01jae4k8d2x7q9m3v5t1b6c0wz", "path": "images/img_01jae4k9a0b1c2d3e4f5g6h7j8.webp", "thumbPath": "thumbs/img_01jae4k9a0b1c2d3e4f5g6h7j8.webp", "mime": "image/webp", "width": 1200, "height": 1600, "bytes": 241873, "sha256": "9f2c…(64 hex)…", "createdAt": "2026-10-05T17:12:00Z" },
    { "id": "img_01jae4k9q1r2s3t4v5w6x7y8z9", "itemId": "itm_01jae4k8d2x7q9m3v5t1b6c0wz", "path": "images/img_01jae4k9q1r2s3t4v5w6x7y8z9.webp", "thumbPath": "thumbs/img_01jae4k9q1r2s3t4v5w6x7y8z9.webp", "mime": "image/webp", "width": 1200, "height": 1600, "bytes": 198442, "sha256": "41ab…", "createdAt": "2026-10-05T17:12:00Z" },
    { "id": "img_c20261005a_02_1", "itemId": "itm_c20261005a_02", "path": "images/img_c20261005a_02_1.webp", "thumbPath": "thumbs/img_c20261005a_02_1.webp", "mime": "image/webp", "width": 1200, "height": 1600, "bytes": 176120, "sha256": "c07d…", "createdAt": "2026-10-05T17:12:00Z", "source": { "name": "IMG_20261005_181455.jpg" } },
    { "id": "img_01jaf0n1c3d5f7h9k1m3p5r7t9", "itemId": "itm_01jaf0mzt8e4g6h2k9p3r5s7v1", "path": "images/img_01jaf0n1c3d5f7h9k1m3p5r7t9.webp", "thumbPath": "thumbs/img_01jaf0n1c3d5f7h9k1m3p5r7t9.webp", "mime": "image/webp", "width": 1600, "height": 1200, "bytes": 211907, "sha256": "e5f1…", "createdAt": "2026-10-08T10:03:00Z" }
  ],
  "outfits": [
    {
      "id": "out_01jag2b7c9d1e3f5g7h9j1k3m5",
      "slots": { "base": "itm_01jae4k8d2x7q9m3v5t1b6c0wz", "bottom": "itm_c20261005a_02", "footwear": "itm_01jaf0mzt8e4g6h2k9p3r5s7v1" },
      "occasionId": "smart-casual",
      "origin": "generated",
      "favorite": true,
      "createdAt": "2026-10-09T08:00:00Z"
    }
  ],
  "wearLog": [
    { "id": "wear_01jag2b8x0y2z4a6b8c0d2e4f6", "date": "2026-10-09", "itemIds": ["itm_01jae4k8d2x7q9m3v5t1b6c0wz", "itm_c20261005a_02", "itm_01jaf0mzt8e4g6h2k9p3r5s7v1"], "outfitId": "out_01jag2b7c9d1e3f5g7h9j1k3m5", "occasionId": "smart-casual" }
  ],
  "feedback": [],
  "kits": [],
  "vocab": [],
  "settings": { "weights": { "color": 30, "occasion": 25, "style": 20, "season": 15, "preference": 10 } }
}
```

Fíjate en: `brand: null` (sin marca, confirmado) frente a `brand` ausente en los chinos (desconocida); `secondary: []` (confirmado un solo color); `cut` con atributos distintos según el tipo de prenda; `estimated` con los campos que Claude dedujo y conviene confirmar; y la mezcla de IDs creados en la app y por Claude.

## 4. Catalogación con Claude

En los dos flujos, **analizar una foto en Claude no la guarda en la app**: solo cuenta lo importado.

### 4.1 Flujo principal: kit de catalogación

Objetivo: catalogar decenas de prendas sin gestionar a mano qué foto corresponde a qué ID, y detectar cualquier asociación incorrecta **antes** de aplicar cambios.

```
 MÓVIL (app)                                 CLAUDE (conversación del proyecto)
 1. Fotos en lote ──► borradores con ID
 2. Exportar kit ──► kit_….zip  ───────────► 3. Análisis por partes de ≤ 20 prendas
                                                 └► patch-kit_…-p1.json (texto)
 5. Aplicar  ◄── 4. Importar patch + revisión ◄─┘
```

**Paso 1 · Prendas pendientes (Fase 2).** *Añadir → Lote*: eliges N fotos de la galería (o vas haciendo fotos seguidas). Cada foto crea un **borrador** con ID definitivo `itm_<ULID>` asignado por la app, y la foto se procesa a sus variantes limpias (`display`, `thumb`). Si varias fotos son de la misma prenda, en la revisión de borradores las agrupas (seleccionar → “Unir en una prenda”). El ID no cambia nunca a partir de aquí.

**Paso 2 · Generar el kit.** *Borradores → Exportar kit* (por defecto, todos los borradores sin kit pendiente). La app:
- Crea un registro en `kits` con un `kitId` y un **código de verificación** de 4 caracteres por prenda (`check`, aleatorio, p. ej. `K7QM`).
- Genera **copias temporales** de las fotos: 1024 px, JPEG, sin EXIF/GPS, con una franja inferior impresa `itm_…  ·  K7QM  ·  1/2`. Las copias existen solo dentro del ZIP: **no se escriben en la base de datos** y las fotos del armario siguen limpias.
- Divide el kit en **partes** de hasta 20 prendas (un ZIP por parte) para que cada una quepa en una conversación.
- Incluye `kit.json`: `kitId`, parte, versión de esquema, y por prenda `id`, `check`, nombres de sus imágenes y los campos que ya tuviera rellenos.
- Incluye `inventory.json`: resumen **solo de texto** de las prendas ya catalogadas (id, nombre, subcategoría, colores) para que Claude pueda avisar de posibles duplicados sin ver más fotos.
- Incluye `INSTRUCCIONES.md`: cómo debe responder Claude (esquema, vocabulario, reglas de estimación).

**Paso 3 · Análisis en Claude.** Me pasas el ZIP (o las imágenes de una parte). Por cada prenda leo el ID y el código **impresos en la imagen**, y devuelvo un `patch`:
- Solo valores del vocabulario controlado. Todo lo deducido de la foto va en `estimated`. Lo que no se puede ver (marca, material, talla) no se rellena.
- Las incidencias van en `issues`: varias prendas en una foto, foto inservible, posible duplicado de una prenda existente, ID ilegible.
- Si en esta sesión puedo crear archivos, entrego `patch-<kitId>-p<n>.json`. Si no, entrego el JSON como texto para que lo guardes en un archivo.

**Paso 4 · Importar el patch.** *Borradores → Importar resultado*. Antes de escribir nada, la app comprueba:

| Comprobación | Si falla |
|---|---|
| El JSON valida contra el esquema y el vocabulario | Error por campo con sugerencias |
| `kitId` corresponde a un kit exportado desde este dispositivo | Bloqueo del patch completo |
| Cada `id` pertenece a ese kit **y** su `check` coincide | Bloqueo de esa prenda: indica que la ficha se atribuyó a otra foto |
| Ninguna prenda del kit aparece dos veces en el patch | Bloqueo de las repetidas |
| Prendas del kit sin respuesta | Aviso; quedan como borrador |
| La prenda se editó en la app después de exportar el kit | Conflicto con diff, tú decides |

**Paso 5 · Revisión y aplicación.** Pantalla de revisión con una tarjeta por prenda: **foto limpia de la base de datos** junto a la ficha propuesta (nombre, colores, corte…) y los estimados en ámbar. Esta comparación visual es la última barrera contra una asociación errónea. Puedes aceptar todo, aceptar por prenda o descartar. Al aplicar (una transacción):
- Las prendas con los campos obligatorios completos dejan de ser borrador.
- Los campos estimados siguen marcados hasta que los confirmes o corrijas.
- Las `issues` quedan visibles en la prenda.
- El kit pasa a `applied` o `partial`. Un mismo patch no se puede aplicar dos veces.

#### Ejemplo de patch de kit

```json
{
  "format": "armario-digital",
  "formatVersion": 1,
  "schemaVersion": 1,
  "kind": "patch",
  "kitId": "kit_01jaj3x5c7v9b1n3m5q7s9t1w3",
  "createdAt": "2026-10-12T18:20:00Z",
  "generator": { "name": "claude" },
  "batch": { "id": "kit_01jaj3x5c7v9b1n3m5q7s9t1w3-p1", "label": "Parte 1/3" },
  "counts": { "items": 2, "images": 0 },
  "items": [
    {
      "id": "itm_01jaj3w0a2b4c6d8e0f2g4h6j8",
      "check": "K7QM",
      "name": "Sudadera gris jaspeada",
      "categoryId": "top",
      "subcategoryId": "sweatshirt",
      "colors": { "primary": "grey", "secondary": [] },
      "styles": ["casual", "minimal"],
      "formality": { "min": 2, "max": 2 },
      "seasons": ["autumn", "winter", "spring"],
      "warmth": 3,
      "pattern": "texture",
      "cut": { "fit": "relaxed", "sleeve": "long", "neckline": "crew" },
      "estimated": ["styles", "formality", "seasons", "warmth", "cut.fit"]
    },
    {
      "id": "itm_01jaj3w1k3m5n7p9q1r3s5t7v9",
      "check": "2HXD",
      "name": "Vaqueros azul oscuro",
      "categoryId": "bottom",
      "subcategoryId": "jeans",
      "colors": { "primary": "navy", "secondary": [] },
      "styles": ["casual", "classic"],
      "formality": { "min": 2, "max": 3 },
      "pattern": "solid",
      "cut": { "leg": "straight", "waist": "belt-loops" },
      "estimated": ["styles", "formality", "cut.leg"],
      "issues": [{ "type": "possible-duplicate", "of": "itm_c20261005a_09", "note": "Muy parecido a los vaqueros oscuros ya catalogados." }]
    }
  ],
  "images": []
}
```

### 4.2 Flujo alternativo: lote completo desde Claude

Me pasas fotos directamente (útil para una carga inicial desde el PC). Yo creo IDs `itm_cAAAAMMDDx_NN` y el manifiesto `batch`. Si la sesión tiene herramientas de archivos (como esta), empaqueto un ZIP real con las fotos renombradas por ID y lo valido con `scripts/validate-package.ts`. Si no, entrego `manifest.json` y la tabla `foto original → ruta en el ZIP`, y el empaquetado lo haces tú (`zip -r lote.armario.zip manifest.json images/`). Nunca diré que he generado un ZIP que no existe. Es más propenso a errores de correspondencia que el kit, y las fotos completas salen del móvil.

## 5. Proceso de importación

La importación se divide en **planificar** (lectura y validación, sin escribir nada) y **aplicar** (una transacción, todo o nada).

1. **Lectura:** ZIP en streaming; se localiza `manifest.json`. Límites: manifiesto ≤ 10 MB, imagen ≤ 20 MB, ≤ 5 000 entradas.
2. **Validación estructural:** `format`, versiones soportadas (si `schemaVersion` es antiguo se migra; si es más nuevo que la app → error “actualiza la app”), Zod sobre cada entidad.
3. **Validación referencial:** cada `imageId` de un item existe en `images`; cada imagen apunta a un item del paquete (o existente, en `patch`); cada `path` existe en el ZIP; IDs únicos dentro del paquete; vocabulario conocido (alias normalizados; desconocidos → error con sugerencia).
4. **Validación de contenido:** las imágenes se decodifican de verdad (formato soportado, no corruptas); `sha256` si viene se comprueba.
5. **Detección de conflictos** contra la base de datos:

| Situación | Resolución por defecto | Opciones |
|---|---|---|
| ID nuevo | Crear | Omitir |
| ID existe, contenido idéntico | Omitir (sin cambios) | — |
| ID existe, contenido distinto | **Preguntar** (se muestra diff) | Mantener la mía · Usar la importada · Importar como prenda nueva (ID nuevo) |
| ID nuevo pero alguna imagen tiene el mismo SHA-256 que una existente | **Aviso de posible duplicado** | Omitir · Importar igualmente |
| `patch` sobre ID inexistente | Error de esa prenda | — |
| `patch` de kit: `kitId` desconocido, `check` que no coincide o ID que no pertenece al kit | **Bloqueo** de esa prenda (posible asociación incorrecta) | — |
| `patch` de kit sobre prenda ya catalogada después de exportar el kit | Preguntar (diff) | Mantener la mía · Usar la importada |

6. **Resumen previo:** “12 prendas nuevas · 3 sin cambios · 2 en conflicto · 1 posible duplicado · 1 error”. Botón “Importar” solo activo cuando todos los conflictos tienen decisión. Las prendas con error se pueden excluir y seguir con el resto.
7. **Aplicar:** procesado de imágenes (variantes) **antes** de abrir la transacción; luego una única transacción Dexie. Si falla, no queda nada a medias.

**Restaurar backup** ofrece además el modo “Reemplazar todo” (borra la base de datos actual tras confirmación explícita escribiendo `REEMPLAZAR`). Por defecto, una restauración es una fusión con las mismas reglas de conflicto.

### Mensajes de error (ejemplos)

Cada error indica **dónde** y **qué hacer**:

- `manifest.json no encontrado en la raíz del ZIP. ¿Has comprimido la carpeta en lugar de su contenido?`
- `Prenda itm_c20261011a_04: el color "azulito" no existe. Valores parecidos: light-blue (Azul claro), blue (Azul).`
- `Imagen img_c20261011a_04_1: falta el archivo images/img_c20261011a_04_1.jpg en el ZIP.`
- `Imagen IMG_1234.heic: formato HEIC no soportado. Convierte a JPEG.`
- `Este paquete es de la versión de esquema 3 y la app solo entiende hasta la 2. Actualiza la app.`

## 6. Exportación (backup)

- Se genera en streaming (fflate) con todas las entidades y las variantes `display` + `thumb`.
- Tamaño orientativo: ~0,25 MB por foto → 300 prendas con 2 fotos ≈ 150 MB.
- Entrega: Web Share (`navigator.share({ files })`) para mandarlo a Drive/Archivos, o descarga directa como alternativa.
- Tras generarlo se guarda `lastExportAt` y se reinicia el contador de cambios. La UI dice **“Exportación generada el …”**, nunca “datos respaldados”: la app no puede saber si guardaste el archivo.
- Exportación parcial opcional: solo fichas (sin imágenes, ~100 KB) para una copia rápida frecuente.

## 7. Versionado del formato

- `formatVersion` cambia si cambia la estructura del paquete (rutas, cabecera). `schemaVersion` cambia con el modelo.
- La app **lee** todas las versiones anteriores (migraciones encadenadas) y **escribe** siempre la actual.
- Fixtures de cada versión publicada se guardan en `tests/fixtures/packages/` (sintéticos) para que los tests garanticen la compatibilidad hacia atrás.
