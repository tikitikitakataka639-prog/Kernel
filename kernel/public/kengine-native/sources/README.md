# Fuentes de modelos nativos (referencia)

Estas páginas HTML son **referencias documentales** de las fichas de Hugging Face
de los cuatro modelos MLC oficiales de KERNEL.

| Modelo KERNEL   | Repo HF                                              | Fichero local        |
|-----------------|------------------------------------------------------|----------------------|
| qwen2.5-0.5b    | mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC            | qwen2.5-0.5b.html    |
| llama-3.2-1b    | mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC            | llama-3.2-1b.html    |
| qwen2.5-1.5b    | mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC            | qwen2.5-1.5b.html    |
| llama-3.2-3b    | mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC            | llama-3.2-3b.html    |

## Qué NO hacen

- No descargan los pesos del modelo.
- No sustituyen a WebLLM ni a `resolve/main/...`.
- No se usan en el chat normal.

## Descarga real

La descarga la hace **WebLLM** desde las URLs del catálogo / `sources.ts`
hacia la caché del navegador (Cache Storage). Ver `src/lib/kengine-native/sources.ts`.
