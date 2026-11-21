# grooming-xlm-roberta-es-en

## Estado

**EXPERIMENTAL — NO APTO PARA DECISIONES AUTOMÁTICAS**

## Artefacto binario incluido en este paquete

| Artefacto | Qué es |
|---|---|
| `sklearn_experimental.joblib` | TF-IDF de caracteres + LogisticRegression, entrenado con el corpus sintético v1 (23 ejemplos de entrenamiento) |
| `metrics_experimental.json` | Métricas históricas sobre 6 ejemplos de validación y 6 de prueba de v1; no acreditan generalización |

El artefacto binario no se ha reentrenado durante esta actualización. Su SHA-256 continúa verificado por el cargador. El nuevo corpus v2 y los scripts actualizados quedan preparados para un entrenamiento controlado posterior, en un entorno con la versión de scikit-learn declarada por el proyecto.

## Cambios del runtime 0.2.0

- Agregación de ventanas por media + top-2 + proporción de soporte; el máximo se conserva solo como dato diagnóstico.
- Taxonomía heurística G01-G09, con fragmento original, turno, speaker explícito, severidad y nota de limitación.
- Atribución prudente: los textos reportados o citados no se asignan automáticamente al interlocutor como conducta propia.
- Cuatro niveles de evaluación, prioridad de revisión humana separada del nivel de riesgo y abstención ante contexto insuficiente, señales aisladas o falta de atribución.
- Metadatos estructurados en la salida para conservar el razonamiento observable en el expediente.
- La puntuación del clasificador se marca explícitamente como no calibrada.

## Qué no es

- No es un checkpoint fine-tuned de `FacebookAI/xlm-roberta-base`.
- No está validado en conversaciones reales.
- No determina edad, identidad, relación, intención ni culpabilidad.
- Las reglas G01-G09 son heurísticas lingüísticas y no prueban por sí mismas una conducta.
- Una etiqueta `benign` no demuestra que la conversación sea segura.

## Modelo candidato de futura evaluación

- Modelo: `FacebookAI/xlm-roberta-base` (MIT).
- Script: `scripts/train_grooming_xlm.py`.
- El modelo base sin fine-tuning no es un detector de grooming.

## Datos

- `kernel-grooming-synthetic-v1`: origen del artefacto binario incluido.
- `kernel-grooming-synthetic-v2`: corpus ampliado con positivos y negativos difíciles, dividido por grupo canónico de conversación.
- `independent_holdout.jsonl`: ocho ejemplos sintéticos reservados; no son conversaciones reales.
- `challenge_ambiguous.jsonl`: cuatro ejemplos `review_required`, fuera del entrenamiento, para comprobar que el runtime se abstiene.
- `scripts/audit_grooming_dataset.py`: comprueba esquema, IDs/grupos compartidos y duplicados textuales entre splits.
- Sin PAN12 ni datos privados.

## Uso responsable

- Scores e indicadores son indicios para revisión humana, nunca veredictos.
- Conservar el fragmento original y la procedencia.
- No ejecutar acciones automáticas contra personas.
- PaxmodGuard es un detector separado; este modelo Grooming G01-G09 no depende de él.
