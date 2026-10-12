# Hoja de ruta

| Fase | Estado |
|---|---|
| 0 · Diseño técnico | ✅ Aprobada (2026-10-11), ampliada con cortes/siluetas y personalización |
| 1 · MVP de inventario | 🔧 v0.1.1: corregido el bloqueo visto en Android (v0.1.0) · ⏳ pendiente de revalidar en Android |
| 2 · Copias de seguridad (2a) | 🔧 v0.1.2: implementadas y probadas en navegador · ⏳ prueba en Android |
| 2b · Lotes y kit de catalogación | ⬜ **Siguiente recomendada** |
| 3 · Recomendador | 🔧 v0.2.0 → integrado en v0.3.0: implementado y probado en navegador · ⏳ validación en Android y con el armario real |
| 4 · PWA y robustez | ⬜ |
| 5 · Personalización progresiva | ⬜ |

Reglas:
- Una fase se cierra solo cuando todos sus criterios están verificados y anotados en `TESTING.md`.
- “Verificado en Android” significa probado en el móvil real con la app instalada, no en el emulador de DevTools.
- No se empieza una fase sin revisar la anterior.

La instalación y el modo offline básico se adelantan a la Fase 1. Probar la persistencia en Android sin la PWA instalada daría resultados engañosos, porque la concesión de almacenamiento persistente depende de ello.

## Fase 0 · Diseño técnico ✅

Documentos: `ARCHITECTURE.md`, `DATA_MODEL.md`, `IMPORT_EXPORT.md`, `DECISIONS.md`, `TESTING.md`.

## Fase 1 · MVP de inventario

Alcance: proyecto y repositorio protegido, base de datos completa (todas las tablas del esquema v1), alta individual con cámara o galería, ficha con atributos de corte por categoría y marcas de estimado, catálogo con filtros, despliegue instalable y offline.

Criterios de aceptación (✅ verificado · ⏳ pendiente; detalle en `TESTING.md`):
1. ✅ `npm run build`, `npm run lint` y `npm test` pasan sin errores con TypeScript estricto.
2. ✅ Esquemas Zod y vocabulario de `DATA_MODEL.md` implementados (incluido `cut` por categoría y `estimated`), con tests que validan los ejemplos de la documentación.
3. ✅ Crear, consultar, editar y borrar una prenda con fotos de galería (e2e). Reordenar, sustituir, eliminar, rotar y recortar implementados. ⏳ Cámara nativa en Android.
4. ✅ Fotos `display` (≤ 1600 px) y `thumb` (≤ 400 px) en WebP, sin EXIF/GPS (verificado en e2e sobre los binarios). Huella del original guardada; el archivo de origen no se modifica.
5. ✅ La ficha muestra solo los atributos de corte de su tipo. Los estimados se marcan y se confirman al editar (tests de formulario). No hay todavía una vía para crear estimados desde la UI: llegarán con el kit (Fase 2).
6. ✅ Catálogo con cuadrícula, filtros y búsqueda por texto y alias de color.
7. ✅ Persistencia al recargar (e2e) y al reabrir la base de datos (integración). ⏳ **Reinicio en Android.**
8. ✅ Offline con el service worker (e2e). ⏳ **Publicación e instalación en Android.**
9. ✅ `storage.persist()` solicitado al arrancar; Ajustes muestra el estado real y el espacio usado. ⏳ Resultado en Android.
10. ✅ E2E de red: solo `GET` al propio origen en alta, edición, búsqueda y borrado. Procedimiento manual en `TESTING.md`.
11. ✅ Protección del repositorio: el hook bloquea (probado), `guard` y `check-dist` corren en la CI.

## Fase 2 · Lotes, kit de catalogación y copias

> **Dividida (2026-10-12):** las copias de seguridad (2a) se adelantan como v0.1.2 sobre la v0.1.1, para poder hacer una copia del móvil **antes** de instalar el recomendador. Los lotes y el kit (2b) quedan pendientes.

Estado de 2a (v0.1.2), con los criterios 5, 6, 8 y 9 de la lista de abajo:
- ✅ 5. Exportación `.armario.zip` completa: fichas, fotos con sus bytes exactos, conjuntos, historial, valoraciones, kits y vocabulario. Validada al importar. `scripts/validate-package.ts` no se ha hecho: la validación vive en la app.
- 🔧 6. Restauración en instalación limpia: mismo número de entidades y mismos hashes de fotos, verificado en e2e con un perfil de navegador nuevo. ⏳ **En Android** (procedimiento en `TESTING.md`).
- ✅ 7 (parcial). Conflictos con decisión explícita y atomicidad, para copias. `batch` y `patch` siguen pendientes (2b).
- ✅ 8. Batería de copias dañadas o incompatibles con mensajes comprensibles.
- ✅ 9. Inicio y Ajustes muestran la última copia generada y los cambios sin copiar.

Criterios de aceptación:
1. Seleccionar más de 30 fotos crea más de 30 borradores sin bloquear la UI (procesado en worker, con progreso).
2. Revisión de borradores con selección múltiple, edición de atributos comunes (≤ 3 toques por atributo) y unir varias fotos en una prenda.
3. Kit de catalogación según `IMPORT_EXPORT.md §4.1`:
   - Exportación por partes con ID y código impresos solo en las copias.
   - Test que confirma que los blobs de la base de datos no cambian al exportar.
   - Importación de `patch` con todas las comprobaciones de la tabla del paso 4.
   - Pantalla de revisión con foto limpia frente a ficha propuesta.
   - Un patch no se puede aplicar dos veces.
4. Prueba completa del kit con prendas reales: kit → Claude → patch → aplicación, sin asociaciones incorrectas. Un patch manipulado (check cambiado o IDs intercambiados) queda bloqueado.
5. Exportación de backup `.armario.zip` (incluye `feedback` y `kits`). Validable con `scripts/validate-package.ts`.
6. Restauración en instalación limpia: mismo número de entidades y mismos hashes de blobs. **Verificado en Android.**
7. Importación `batch` y `patch` con resumen previo, conflictos con decisión explícita y atomicidad (un fallo provocado a mitad no deja datos parciales).
8. La batería de paquetes inválidos de `TESTING.md` produce los mensajes esperados.
9. Inicio muestra los días desde la última exportación generada y los cambios sin exportar.

## Fase 3 · Recomendador

> **Orden cambiado (2026-10-12):** a petición de Iván, la Fase 3 se adelanta a la Fase 2. Riesgo aceptado: mientras no exista la exportación (Fase 2), el inventario solo está en el navegador del móvil. Después se decidió publicar antes las copias (v0.1.2) y entregar el recomendador integrado con ellas en la v0.3.0 (ADR-020).

Estado v0.2.0, igual en v0.3.0 (✅ verificado · ⏳ pendiente):
- ✅ 1. Motor puro en `src/engine/`: 97 % de líneas cubiertas.
- ✅ 2. Escenarios automatizados (37 tests): obligatorias, disponibilidad, lluvia, frío, calor, formalidad, desconocidos y estimados, silueta, diversidad, inventarios pequeños o vacíos, y 1 000 armarios aleatorios con invariantes.
- ✅ 3. Cada propuesta muestra puntuación, hasta 3 motivos y avisos (incluida la confianza baja).
- 🔧 4. Rendimiento en Node con 300 prendas: generación < 1 s y alternativas < 300 ms. ⏳ Medir en el móvil.
- ✅ 5. Guardar, valorar, registrar uso, historial y descartes (e2e).
- ⏳ 6. Validación con tu armario real (20 peticiones, ≥ 70 % «me lo pondría»). El algoritmo **no está validado** hasta hacerla.

El algoritmo **no se considera validado** hasta superar las pruebas automáticas y la validación con el armario real.

Criterios de aceptación:
1. Motor en `src/engine/` sin React ni Dexie, con cobertura ≥ 90 % de líneas.
2. Escenarios automatizados, cada uno con inventarios diseñados para ese caso:
   - **Prendas obligatorias:** siempre presentes; aviso si contradicen la ocasión; dos obligatorias de la misma ranura se tratan como error explicado.
   - **Disponibilidad:** nunca aparecen prendas `laundry`, `stored`, `repair`, `lent` o `retired`, ni borradores.
   - **Lluvia:** se priorizan exteriores y calzado `waterproof`; el ante con lluvia penaliza; sin prendas impermeables, propuesta igualmente con aviso.
   - **Frío:** suma de `warmth` suficiente; exige capa exterior; nada de pantalón corto ni sandalias.
   - **Calor:** sin abrigos ni plumíferos.
   - **Formalidad:** evento formal sin zapatillas ni sudaderas; deporte sin zapatos de vestir; mezcla de formalidades extremas penalizada.
   - **Atributos desconocidos:** prendas sin colores, estilos o `cut` siguen siendo elegibles, con puntuación neutra y aviso de confianza baja.
   - **Silueta:** el equilibrio de volúmenes puntúa según las reglas; los `cut` desconocidos no penalizan.
   - **Diversidad:** entre las 5 primeras propuestas no hay dos que compartan 2 de las 3 piezas principales, cuando el inventario lo permite.
   - **Inventarios pequeños:** 1 prenda por ranura; ranura vacía (sin calzado); inventario vacío. Resultado útil o mensaje claro, nunca una excepción.
   - **Invariantes** con inventarios aleatorios con semilla (1 000 ejecuciones): solo prendas existentes y disponibles, sin duplicados, ranuras válidas, resultados deterministas.
3. Cada propuesta muestra puntuación, 2–3 motivos y avisos de datos incompletos.
4. Rendimiento en el móvil con 300 prendas: sustituir una pieza en < 100 ms y generación completa en < 1 s.
5. Guardar outfit, marcar favorito, registrar uso y consultar historial.
6. Validación con mi armario real: 20 peticiones evaluadas por mí, con ≥ 70 % de propuestas “me lo pondría”. El ajuste de pesos se documenta en `DECISIONS.md`.

## Fase 4 · PWA y robustez

Criterios de aceptación:
1. Actualización probada: nueva versión desplegada → aviso → actualización sin perder datos ni una edición en curso.
2. Migración de esquema probada con una base de datos de la versión anterior.
3. Aviso cuando el uso supera el 80 % de la cuota estimada. `QuotaExceededError` tratado con un mensaje claro.
4. Lighthouse: PWA instalable y rendimiento ≥ 90 en móvil.
5. Un error boundary captura los errores inesperados y ofrece exportar un backup desde la pantalla de error.
6. README con el procedimiento de recuperación de datos.
7. Una semana de uso real en Android, incluido modo avión, terminada con exportar, borrar datos y restaurar.

## Fase 5 · Personalización progresiva

Diseño en `ARCHITECTURE.md §8.2`. Las tablas y el formato de copia ya lo soportan desde v1.

Criterios de aceptación:
1. UI para valorar outfits (★), descartar (“hoy no” / “no me gusta”), marcar parte que gusta o no, y like/dislike de prenda.
2. Modelo de afinidad derivado del registro de eventos, con contracción, doble semivida y contexto por ocasión.
3. Tests:
   - Una única valoración no cambia el primer puesto del ranking.
   - Cinco señales coherentes sí lo cambian.
   - Las señales antiguas pierden peso, pero no desaparecen.
   - Un dislike de combinación no hunde a la prenda en otras combinaciones.
   - La exploración mantiene al menos 1 de cada 5 propuestas novedosa.
4. Ajustes permite ver los rasgos aprendidos, borrar señales y reiniciar el modelo.
5. Los eventos de preferencia viajan en la copia y el modelo se recalcula igual tras restaurar.

## Fuera de alcance (de momento)

- Sincronización entre dispositivos y multiusuario.
- Eliminación automática del fondo de las fotos.
- Detección automática de colores.
- Tiempo meteorológico automático (requeriría red).
- Estadísticas avanzadas.
