# Guía de anotación Grooming

El objetivo es documentar conductas observables para entrenamiento y evaluación, no etiquetar personas.

## Etiquetas de conversación

- `grooming_risk`: el escenario sintético representa un patrón de manipulación progresiva o coerción, descrito por mensajes explícitos y su secuencia.
- `benign`: el escenario tiene una explicación ordinaria explícita y no presenta un patrón convergente.
- `review_required`: falta contexto suficiente o existen interpretaciones plausibles incompatibles. Esta etiqueta se reserva para el conjunto challenge y no se usa en el entrenamiento binario actual.

## Anotación por mensaje

Cuando haya evidencia observable, registrar uno o varios códigos G01-G09 del archivo `taxonomy.json`. Conservar el texto original, el índice de turno y el speaker literal si está presente. No inferir edad, relación, género, identidad o intención.

## Reglas para negativos difíciles

Incluir deliberadamente contextos donde aparecen términos parecidos a los indicadores: fiestas sorpresa, grupos oficiales, clubes, clase, registro de torneos, preguntas administrativas y mensajes de prevención. La etiqueta debe seguir el contexto completo.

## Casos ambiguos

No forzar una etiqueta binaria. `review_required` significa abstención, no benignidad ni culpabilidad. Estos casos se mantienen fuera de train/val/test hasta contar con adjudicación documentada.

## Calidad y privacidad

El corpus de este repositorio es sintético. No añadir conversaciones privadas, datos identificativos ni contenido sexual de menores. Cualquier uso de datos reales requeriría una base legal, autorización, minimización, seguridad y revisión ética/jurídica independientes.
