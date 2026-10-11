# Cambios

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
