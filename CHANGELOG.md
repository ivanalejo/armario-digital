# Cambios

## 0.3.0 · 2026-10-12 · Recomendador + copias de seguridad

Integra la Fase 3 (0.2.0, nunca publicada por separado) con las copias de seguridad (0.1.2).

- Las copias incluyen los conjuntos con sus campos nuevos (`key`, `rating`, `weather`) y los eventos de preferencias (`feedback`).
- Inicio usa el aviso de copias de la 0.1.2 en lugar del texto fijo «Sin copia de seguridad todavía».
- Si el armario está vacío, Inicio ofrece restaurar una copia (móvil nuevo).
- Sin migración de datos: abre igual los datos de v0.1.0, v0.1.1 y v0.1.2.

## 0.2.0 · 2026-10-12 · Fase 3: recomendador de outfits

- **Inicio** pasa a ser un panel para vestirse:
  - El outfit del día es lo protagonista (Otra · Guardar · Me lo pongo · Descartar), con ocasión y clima en un toque.
  - Debajo: conjuntos guardados, un resumen compacto y las últimas incorporaciones.
  - Si faltan prendas, explica cuáles en lugar de inventar combinaciones.
- **Outfits:**
  - Explorar: las mismas reglas que Inicio, con «Ver más» y la opción de fijar una prenda.
  - Guardados: con valoración de 1 a 5 estrellas.
  - Historial de lo que te has puesto.
  - Cambiar una pieza recalcula la puntuación.
- **Armario:** accesos rápidos a borradores, prendas por revisar y no disponibles. La ficha añade «Combinar esta prenda».
- **Motor local** (`src/engine`):
  - Puntúa color, formalidad, estilo y silueta, temporada y lluvia, y preferencias.
  - Explica cada propuesta.
  - Los datos estimados o desconocidos puntúan neutro y nunca excluyen.
  - Evita propuestas casi idénticas.
- **Datos:** sin migración. Los conjuntos guardados añaden campos opcionales (`key`, `rating`, `weather`). Valoraciones, descartes, usos y cambios se guardan como eventos para el aprendizaje futuro.
- **Corrección:** en el catálogo, la foto tapaba el nombre de la prenda (fallo presente desde la v0.1.1).
- **Pruebas:** 103 tests unitarios y de integración, y 24 e2e.


## 0.1.2 · 2026-10-12 · Fase 2a: copias de seguridad

- **Crear copia** (Ajustes): un archivo `.armario.zip` con todas las prendas, fotos (bytes exactos), conjuntos, historial y valoraciones. Se descarga a *Descargas* y nunca sale del dispositivo por sí solo.
- **Restaurar copia:**
  - Se comprueba entera antes de escribir nada, con mensajes claros si está dañada o es de una versión más nueva.
  - Resumen de lo nuevo, lo que ya está, lo modificado y los posibles duplicados.
  - Nada existente se sobrescribe sin marcarlo.
  - «Reemplazar todo» exige escribir REEMPLAZAR.
  - Se aplica entera o no se aplica.
- Inicio avisa si no hay copia o hay cambios sin copiar. Si el Armario está vacío, ofrece restaurar (móvil nuevo).
- Lee las fotos tal como las guardan v0.1.0 (Blob) y v0.1.1 (ArrayBuffer).
- Pruebas: 19 unitarias y 4 e2e nuevas.
- Con el armario vacío, Inicio no muestra el aviso de copia (no hay nada que copiar).


## 0.1.1 · 2026-10-11 · Corrección del bloqueo en Android

Problema observado en la v0.1.0 en Android:
- Al guardar una prenda con foto de la galería, el botón se quedaba en «Espera…».
- Tras reabrir la app, Inicio y Armario mostraban «Cargando…» indefinidamente.

- Tiempos límite en procesado de imagen (30 s por paso) y en transacciones (20 s). Las transacciones que vencen se abortan para no dejar IndexedDB bloqueada.
- Las pantallas muestran estados diferenciados: cargando, «no responde» (con Reintentar y Diagnóstico) y error. Ya no se quedan en «Cargando…» sin explicación.
- El editor separa «Procesando foto…» de «Guardando…». Ante un error muestra el motivo, conserva el formulario y permite reintentar.
- Fotos: errores por archivo con «Reintentar foto», una sola lectura del archivo, canvas en CPU con alternativa y límite de 100 MP.
- Binarios guardados como ArrayBuffer; los de v0.1.0 (Blob) se siguen leyendo.
- Las fichas inválidas se apartan sin borrarse y no impiden ver el resto.
- Nueva pantalla Ajustes → Diagnóstico (solo lectura) y registro local de errores.
- Pruebas: +6 de integración y +8 e2e de robustez.

## 0.1.0 · 2026-10-11 · Fase 1 (MVP de inventario)

Primera versión publicada.
