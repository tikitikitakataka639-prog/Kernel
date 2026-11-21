# Avisos de terceros

## PaxmodGuard

KERNEL integra mediante un adaptador propio el paquete externo `paxmod-guard==0.1.1` y sus pesos descargados por el propio paquete. No se incluyen ni modifican esos pesos en este archivo ZIP.

- Proyecto y documentación: https://www.paxmod.com/research/guard
- Paquete: https://pypi.org/project/paxmod-guard/0.1.1/
- Modelo: https://huggingface.co/paxmod/guard
- Licencia declarada por el distribuidor para el paquete y los pesos abiertos: Apache License 2.0.
- El adaptador de KERNEL se encuentra en `police-engine/src/detectors/paxmod_guard.py` y es código de integración independiente.
- El usuario recibe la licencia Apache-2.0 a través de la distribución oficial del paquete. Texto incluido en `LICENSES/Apache-2.0.txt` y disponible en https://www.apache.org/licenses/LICENSE-2.0

La publicación de PyPI consultada no aporta attestations de provenance. Antes de redistribuir una compilación pública, verifica los hashes y los artefactos descargados directamente con el mantenedor. La declaración de licencia del proyecto no sustituye una auditoría jurídica de todas las dependencias.

## Límites del modelo

PaxmodGuard es una herramienta de clasificación de señales, no un moderador autónomo ni una prueba de hechos. El proveedor declara que no alcanza el 90 % de precisión a una tasa de detección útil en conversaciones reales y recomienda revisión humana. La mayor parte de los datos de entrenamiento es inglés y español; el español debe validarse de forma independiente.


## Otros detectores y dependencias de modelos

| Componente | Repositorio | Licencia declarada | Nota |
|---|---|---|---|
| Horizon Phishing & Scam Detector | https://huggingface.co/Horizon-Labs/phishing-scam-detector-base | Apache-2.0 | Modelo multilingüe ONNX; el proyecto lo descarga bajo demanda. |
| MrBERT Legal | https://huggingface.co/BSC-LT/MrBERT-legal | Apache-2.0 | Encoder legal; no es clasificador de ilegalidad. |
| Grooming checkpoint KERNEL | incluido en `police-engine/models` | MIT para el software/checkpoint declarado; corpus sintético CC0-1.0 | Experimental y no validado con conversaciones reales. |
| PaxmodGuard | https://huggingface.co/paxmod/guard | Apache-2.0 declarado por el distribuidor | El ZIP no redistribuye sus pesos; el paquete oficial los descarga en la primera carga. |

Las licencias listadas son las declaradas por los respectivos mantenedores en sus fichas consultadas. No convierten automáticamente el código propio de KERNEL ni los assets aportados por el usuario a esas mismas licencias. El repositorio KERNEL de este ZIP no incluye una licencia de proyecto raíz; el titular debe elegirla antes de la redistribución pública.

## Assets de reacciones aportados por el usuario

Los GIF/JPG/PNG de `public/reacciones-kernel/` proceden del archivo `reacciones de kernel.zip` proporcionado para esta integración. Su titularidad y permiso de redistribución no se han verificado. Retíralos o sustitúyelos por assets con licencia compatible antes de publicar KERNEL si no dispones de derechos suficientes.


## Wllama

KERNEL usa `wllama64` 1.1.1, un fork independiente con soporte Memory64 de Wllama/llama.cpp, para ejecutar el modelo GGUF en WebAssembly dentro del navegador. No es una versión oficial de Wllama.

- Proyecto: https://github.com/ngxson/wllama
- Paquete: https://www.npmjs.com/package/wllama64
- Licencia declarada: MIT.
- Inferencia en cliente; no implica uso de un proveedor externo de inferencia.


## wllama64
- Paquete: `wllama64` 1.1.1.
- Licencia declarada: MIT.
- Repositorio: https://github.com/actuallymentor/wllama64
- Es un fork comunitario independiente, basado en Wllama/llama.cpp; consulta su historial y avisos de licencia antes de redistribuir binarios derivados.
