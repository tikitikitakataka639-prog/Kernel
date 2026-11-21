# KERNEL / Police Engine — cambios Grooming 0.2.3

## Cambios implementados

- Detección contextual de nueve familias de señales G01–G09.
- Atribución prudente de mensajes a interlocutores explícitos; texto citado o reportado no se atribuye automáticamente a quien lo comparte.
- Evaluación de conversación por ventanas con agregación que no depende exclusivamente de la ventana máxima.
- Estados de abstención y contexto insuficiente; separación entre nivel observado, prioridad de revisión humana y puntuación del modelo.
- Evidencias estructuradas con código de señal, fragmento original, interlocutor, turno y severidad orientativa.
- Propagación de metadatos a expedientes, ejecuciones de detectores y resumen para el asistente.
- Corpus sintético v2 con negativos difíciles, positivos variados y casos ambiguos separados.
- Auditoría de separación de grupos/textos, guía de anotación, taxonomía y evaluación de abstención en casos ambiguos.
- Tests Python nuevos y refuerzo de CI para auditar el corpus y ejecutar el desafío ambiguo.
- Interfaz identifica el módulo como contextual y experimental; no se presenta como XLM-R validado.

## Datos del corpus v2

- Entrenamiento: 46 conversaciones.
- Validación: 11 conversaciones.
- Prueba: 10 conversaciones.
- Holdout independiente: 8 conversaciones sintéticas.
- Desafío ambiguo: 4 conversaciones, excluidas de entrenamiento/validación/prueba.
- La auditoría estructural no encontró cruces de grupos ni textos normalizados entre particiones principales, ni solapamiento con el holdout.

## Pruebas ejecutadas en esta modificación

- `python -m unittest discover -s tests -v`: 46 tests correctos; 5 omitidos por requerir pesos reales o activar explícitamente pruebas de modelos reales.
- `python -m compileall -q src tests scripts data/grooming`: correcto.
- `python scripts/audit_grooming_dataset.py`: PASS.
- `python scripts/eval_ambiguous_challenge.py`: 4/4 casos ambiguos producen abstención.

## Limitaciones que permanecen deliberadamente visibles

- El checkpoint binario original no se ha reentrenado y sigue asociado al corpus sintético v1. Se ha conservado intacto.
- Las métricas históricas de v1 proceden de muestras minúsculas y no acreditan generalización.
- El corpus v2 es sintético; no demuestra precisión sobre conversaciones reales ni sustituye validación externa independiente.
- XLM-R no se ha descargado ni entrenado en esta ejecución.
- La evaluación de pesos reales de Horizon/MrBERT no se realizó.
- El entorno de auditoría dispone de scikit-learn 1.8.0, mientras el checkpoint se serializó con 1.9.1 (versión fijada en `requirements.txt`). Se observó `InconsistentVersionWarning`; no se reserializó el checkpoint con una versión distinta.
- No se ejecutaron pruebas TypeScript/build del frontend porque el ZIP no contiene `node_modules`.
- No se publicó ni modificó el despliegue de Vercel.

## Interpretación de seguridad

Grooming continúa siendo experimental y de apoyo a revisión humana. Las señales heurísticas no prueban intención, delito ni identidad. Las puntuaciones del clasificador no están calibradas y no deben emplearse como decisión automática sobre personas.
