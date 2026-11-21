# KERNEL POLICE ENGINE — integración local

## Función y límites

Police Engine es el backend local de MODE POLICE. Escucha exclusivamente en \`127.0.0.1:8787\`; no es público, no sustituye \`/api/chat\` y no ejecuta Llama 3.2 3B.

| Detector | Implementación actual | Límite |
|---|---|---|
| Horizon | ONNX Runtime + tokenizer | Señal de phishing/fraude; requiere validación real |
| Grooming | Baseline TF-IDF + LogisticRegression experimental + capa contextual G01-G09 | No es XLM-R fine-tuned; score no calibrado; sin validación real |
| MrBERT Legal | Encoder de similitud | No clasifica legalidad |
| PaxmodGuard | Paquete local paxmod-guard 0.1.1; pesos Apache-2.0 | Requiere descarga inicial (~220 MB) y validación propia en español |

## PaxmodGuard

- Ocupa el puesto del detector anterior de seguridad de conversaciones.
- Dependencia fijada: `paxmod-guard==0.1.1`; licencia declarada Apache-2.0 para paquete/pesos.
- La primera inicialización descarga aproximadamente 220 MB a la caché del paquete; después la inferencia se realiza localmente.
- Requiere aproximadamente 1 GB de memoria según PyPI.
- El modelo abierto usa datos públicos y sintéticos; la evaluación del proveedor no equivale a validación independiente. No tomar decisiones automáticas ni tratar puntuaciones como pruebas.
- PyPI no aporta provenance para esta publicación; verificar hash y artefactos antes de cada distribución pública.

## Preparación en Windows

Desde esta carpeta, crea un entorno virtual con una versión de Python compatible con todas las dependencias:

\`\`\`powershell
py -3.12 -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
\`\`\`

Si una dependencia no es compatible, registra la versión y el error real. No cambies versiones a ciegas.

## CORS

Configura los orígenes exactos:

\`\`\`powershell
$env:KERNEL_POLICE_CORS_ORIGINS = "https://project-kernel-release-1-0-0.lovable.app,http://localhost:5173,http://127.0.0.1:5173"
\`\`\`

Para producción, añade el origen real de KERNEL después de verificarlo. No uses \`*\`.

## Arranque y comprobación

\`\`\`powershell
python src/server.py
\`\`\`

En otra terminal:

\`\`\`powershell
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod http://127.0.0.1:8787/status
\`\`\`

Detén el servicio con \`Ctrl+C\`.

## Pruebas

\`\`\`powershell
python -m pytest tests -v
\`\`\`

Los tests con mocks no demuestran inferencia real. Los tests que necesitan pesos pueden omitirse si los artefactos no están disponibles, pero deben aparecer como omitidos y explicar el motivo.

## Validación con pesos reales

La CI normal usa pruebas unitarias y mocks; no descarga pesos grandes. El workflow **Police Engine - Validación con modelos reales** se ejecuta automáticamente en la rama `fix/phase2-audit-corrections` cuando cambian los detectores, sus pruebas de humo, las dependencias o el propio workflow. Así puede validar los pesos desde un runner de GitHub sin depender del ordenador local.

El workflow descarga el ONNX cuantizado de Horizon (aprox. 641 MB) y MrBERT-legal (aprox. 1,23 GB), los carga y ejecuta inferencia directa y a través de la API HTTP local (/download, /load, /analyze y /unload), usando el origen de producción de KERNEL. No usa GPU ni certifica rendimiento en el ordenador del usuario. Los dos tests aparecen como omitidos en la CI normal, salvo que se active `KERNEL_POLICE_REAL_MODEL_TESTS=1`.

La prueba de MrBERT verifica embeddings y similitud semántica, no clasificación jurídica. La prueba de Horizon comprueba la forma y normalización de scores, además del mapeo real de etiquetas.

## Grooming contextual (runtime 0.2.0 experimental)

- La salida incorpora `metadata.grooming_assessment` con nivel de revisión, suficiencia de contexto, agregación de ventanas, atribución y señales G01-G09.
- `top_label` se abstiene (`null`) ante contexto insuficiente, señal aislada o discordancia sin corroboración estructurada.
- Los fragmentos conservan el turno y el speaker explícito cuando existe; no se infieren edades ni identidades.
- El corpus sintético v2 se amplió con positivos y negativos difíciles y se divide por grupo canónico. Ejecuta `python scripts/audit_grooming_dataset.py` para revisar fugas estructurales.
- El artefacto joblib incluido sigue entrenado en v1 y no se reentrenó en esta actualización. Las métricas antiguas (6 validation + 6 test) no validan rendimiento real.
- El holdout independiente continúa siendo sintético. No se deben usar datos privados de menores sin base legal, autorización y protección adecuadas.

## Seguridad

- Mantener el bind en \`127.0.0.1\`.
- Mantener Origin gate y allowlist CORS explícita; validar el dominio definitivo de KERNEL antes de configurarlo.
- No exponer el servicio a LAN o Internet.
- No incluir tokens, rutas privadas ni variables de entorno en exportaciones.
- Un único modelo en memoria.
- PaxmodGuard procesa conversaciones completas localmente; no es moderador autónomo y requiere revisión humana.

## Limitaciones

La inferencia real depende de pesos, tokenizer, versiones y hardware. Grooming es experimental. MrBERT aporta similitud semántica, no una conclusión jurídica. Llama 3.2 3B se ejecuta en WebLLM del navegador, separado de este servidor.
