# Cambios

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
