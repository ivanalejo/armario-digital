# Registro de decisiones (ADR)

Formato: contexto → decisión → consecuencias.

## ADR-001 · Stack: React + TS + Vite + Dexie · Aceptada
Dependencias añadidas, todas pequeñas y justificadas:
- Zod: validación y tipos.
- fflate: ZIP en streaming (se instala en Fase 2).
- wouter: router mínimo.
- vite-plugin-pwa: service worker.
- react-easy-crop: recorte táctil.

## ADR-002 · Zod como fuente única de tipos y validación · Aceptada

## ADR-003 · fflate en lugar de JSZip · Aceptada
Necesario para copias de más de 150 MB sin cargarlas enteras en memoria.

## ADR-004 · Fotos: variantes optimizadas, original no conservado por defecto · Aceptada (2026-10-11)
- Se guardan `display` (≤ 1600 px, WebP, sin EXIF/GPS) y `thumb` (≤ 400 px).
- El archivo de origen nunca se modifica.
- Se guarda la huella del original (nombre, tamaño, fecha, SHA-256) para reconocer reimportaciones y facilitar sustituciones.
- El esquema admite una variante `original` para una futura opción “conservar originales”.
- Volver a recortar parte de `display`, con pérdida mínima a ese tamaño.

## ADR-005 · Desconocido = ausente, inexistente = `null`, estimado = ruta en `estimated` · Aceptada (ampliada 2026-10-11)
Sustituye a `review.fields`. Un único mecanismo distingue confirmado, estimado y desconocido para cualquier campo, incluidos los atributos de corte, sin duplicar estructuras.

## ADR-006 · Clima separado de ocasión · Aceptada

## ADR-007 · Publicación en `ivanalejo.github.io/armario-digital/` · Aceptada (2026-10-11)
- Repositorio independiente `ivanalejo/armario-digital`, público (lo exige Pages en plan gratuito).
- Comparte origen con la PWA de entreno: misma cuota de almacenamiento, y “Borrar datos del sitio” afecta a ambas. Riesgo asumido y documentado.
- El origen no debe cambiar; cambiarlo obliga a migrar mediante backup.

## ADR-008 · Kit de catalogación como flujo principal · Aceptada (2026-10-11)
- Los IDs los asigna siempre la app.
- El ID y un código de verificación se imprimen solo en copias temporales.
- El patch se valida contra el kit (`kitId` + `check`) antes de aplicarse.
- La revisión visual muestra la foto limpia frente a la ficha propuesta.

## ADR-009 · Hash routing · Aceptada

## ADR-010 · Instalación y SW básicos en Fase 1 · Aceptada

## ADR-011 · Corte y silueta como mapa `cut` con atributos por categoría · Aceptada (2026-10-11)
- Alternativas descartadas:
  - Columnas fijas para todo: muchos campos vacíos que no aplican.
  - Un tipo distinto por categoría: obliga a migrar al añadir atributos.
- Decisión: `cut` es un mapa `atributo → valor`. El vocabulario define cada atributo, sus valores (con volumen 0–3 para el motor) y a qué categorías o subcategorías se aplica.
- Añadir atributos o valores no requiere migración.
- La validación comprueba que cada atributo corresponde al tipo de prenda.

## ADR-012 · Personalización mediante registro de eventos y modelo derivado · Aceptada (diseño; implementación en Fase 5)
- Las interacciones se guardan como eventos inmutables con contexto.
- Las afinidades se calculan con contracción bayesiana (k≈3) y doble semivida (30 y 365 días), a tres niveles: prenda, pareja y rasgo.
- El aprendizaje solo actúa en el criterio de preferencias, con peso acotado, y se reserva una cuota de exploración.
- Ventajas:
  - Recalculable y reiniciable.
  - Sin estado opaco.
  - Viaja en la copia.
  - No necesita IA ni red.

## ADR-013 · Protección del repositorio contra datos personales · Aceptada (2026-10-11)
Cuatro capas:
1. `.gitignore` con lista negra amplia.
2. Hook `pre-commit` versionado, que se activa con `npm install`.
3. La misma comprobación en CI, que bloquea el despliegue.
4. `check-dist` sobre lo publicado.

## ADR-014 · Binarios en IndexedDB como ArrayBuffer · Aceptada (2026-10-11, v0.1.1)
- Contexto: en Android, una escritura de la v0.1.0 no terminó y dejó la base de datos sin responder. Guardar objetos Blob depende de la implementación de cada navegador, que los escribe como archivos aparte.
- Decisión:
  - Convertir a `ArrayBuffer` antes de abrir la transacción y guardar `{ data, type }`.
  - Leer ambos formatos.
- No está demostrado que el Blob fuera la causa. Es una mitigación de bajo coste que además simplificará la exportación.

## ADR-015 · Tiempos límite, aborto de transacciones y diagnóstico · Aceptada (2026-10-11, v0.1.1)
- Ninguna operación de imagen o de base de datos puede dejar la interfaz esperando sin límite.
- Las transacciones que vencen se abortan para liberar el bloqueo.
- Las consultas pasan a estado «lenta» con diagnóstico.
- Se añade una pantalla de diagnóstico de solo lectura y un registro local de errores.
- Nunca se borra ni se «repara» automáticamente ningún dato.

## ADR-016 · Fase 3 antes que Fase 2 · Aceptada (2026-10-12)
Iván prioriza el recomendador y la nueva Inicio. Consecuencia: la exportación de copias sigue pendiente. Se mantiene el aviso discreto en Inicio y la Fase 2 queda como siguiente recomendada.

## ADR-017 · Umbrales del recomendador · Aceptada (2026-10-12, revisable con datos reales)
- Una prenda queda fuera solo con formalidad **confirmada** a ≥ 1,5 niveles del rango de la ocasión. Con 2 niveles se colaban, por ejemplo, unas botas de ante (2–3) en un evento formal.
- Una combinación no se muestra por debajo de 50/100.
- Con lluvia, una prenda exterior no impermeable multiplica por 0,6 el criterio de temporada.
- Todo está en constantes y datos (`recommend.ts`, `occasions.ts`) para ajustarlo cuando se valide con el armario real.

## ADR-018 · Preferencias sencillas ahora, aprendizaje en Fase 5 · Aceptada (2026-10-12)
- Hoy el motor usa:
  - favoritos;
  - guardados y valoraciones;
  - descartes («hoy no» solo ese día; «no me gusta» 30 días);
  - uso reciente (como mucho −0,2 dentro del 10 %);
  - prendas olvidadas.
- Todas las interacciones se guardan ya como eventos (`feedback`). La Fase 5 podrá recalcular el modelo con decaimiento temporal, contexto y exploración sin cambiar la interfaz `PreferenceModel`.

## ADR-019 · Propuesta del día estable · Aceptada (2026-10-12)
- Se elige de forma determinista entre las 3 mejores y se fija en cuanto se muestra.
- Sin esto, guardarla cambiaba el ranking y la propuesta saltaba a otra (detectado en las pruebas).

## Pendientes
- Revalidar la v0.1.1 en Android y confirmar o descartar las hipótesis de la incidencia del 2026-10-11 (`TESTING.md`).
