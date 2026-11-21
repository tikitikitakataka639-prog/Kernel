# K.E.R.N.E.L. 0.2.13 — aplicación web

KERNEL es una única aplicación web para Vercel con dos áreas: **CHAT GENERAL** y **POLICE MODE**. La conversación se ejecuta localmente en el navegador del visitante; no requiere servidor personal ni API de inferencia externa.

## Puesta en marcha

1. Importa el ZIP en Vercel con **Root Directory: `./`**.
2. Mantén `npm run build` y la salida Nitro para Vercel.
3. Abre KERNEL. WebGPU se inicializa automáticamente y el inicio muestra el estado del adaptador.
4. WebGPU se inicializa al abrir KERNEL. Si no encuentra adaptador, la pantalla permite reintentarlo. Entra en **CHAT GENERAL**. Qwen3.5-2B Claude Distilled (1,27 GB) se restaura desde la caché o inicia su descarga automáticamente en la primera visita.
5. Espera a que el panel indique `WebGPU · [adaptador] · N capas`. Esa es la confirmación de que Wllama está descargando capas a GPU.
6. Para una tarea larga, puedes elegir el perfil **PROFUNDO — Qwen3.5-4B (2,71 GB)** desde Ajustes. Solo se mantiene un modelo en RAM/VRAM a la vez.

## Objetivo de latencia

El perfil rápido reduce el contexto, usa un prompt de sistema compacto, limita las respuestas a 80 tokens y configura un watchdog de 30 segundos para el primer texto, los intervalos sin actividad y la duración total de la generación. Si se agota ese plazo, KERNEL interrumpe el cálculo y muestra un error en vez de seguir procesando indefinidamente. El objetivo se fuerza mediante un límite: no convierte un hardware insuficiente en uno rápido.

**No es una garantía para cualquier equipo.** Se necesita WebGPU y una GPU con memoria suficiente. El perfil RÁPIDO no se da por listo en CPU: si WebGPU falla, KERNEL muestra el motivo y no inicia silenciosamente una inferencia lenta. La descarga inicial y la carga del modelo pueden tardar varios minutos. KERNEL mide y muestra la latencia real en el navegador.

## Modelos

### RÁPIDO (predeterminado)
- Repositorio: https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF
- Archivo: `Qwen3.5-2B.Q4_K_M.gguf` (1,27 GB).
- Runtime: `wllama64` 1.1.1, WebAssembly Memory64 con WebGPU y ajuste adaptativo de capas.
- Revisión fijada: `efb1952f4822d5fec9c4f018c5cfaf3f5c704383`.
- SHA-256: `6036e3b96a5dca3def9ba6f3aa751acebe081c4f109a8a9352647d0eea055c9d`.

### PROFUNDO (opcional)
- Repositorio: https://huggingface.co/Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF
- Archivo: `Qwen3.5-4B.Q4_K_M.gguf` (2,71 GB).
- SHA-256: `de8cf2454c46ec34e6b991dc11f5dd42d543926272d8a59d36ceb5a2eaf7962a`.

Ambas son destilaciones comunitarias de Qwen inspiradas en ejemplos atribuidos a Claude; ninguna es Claude oficial ni un modelo de Anthropic. La ficha de la variante 2B indica licencia Apache-2.0, pero también declara que es una versión de prueba para aprendizaje, demostración, investigación académica y exploración técnica. Revisa ese uso previsto antes de comercializar o redistribuir la experiencia como producto.

## Police Mode

Police Mode conserva Llama 3.2 3B en WebLLM dentro del navegador. Se ha reducido el historial y el número de tokens para priorizar respuesta rápida, conservando las distinciones de evidencia. Se aplica un límite total de 10 segundos; si el dispositivo no llega, se cancela y se informa.

Los detectores Horizon, MrBERT Legal, Grooming ES/EN y PaxmodGuard son distintos de la conversación y requieren un servicio Police Engine independiente publicado por HTTPS. Mientras ese servicio no exista, los detectores permanecen desactivados; KERNEL no inventa resultados.

## Vercel

- `Root Directory: ./`.
- npm 10.9.2 y Node 24.x fijados.
- Nitro genera `.vercel/output`.
- COOP/COEP configurados para las funciones de memoria compartida.
- No configurar `KERNEL_AI_BASE_URL` para las conversaciones.

## Pruebas

```bash
npm install
npm run preflight:vercel
VERCEL=1 npm run build
npm run verify:vercel-output
bun test
bunx tsc --noEmit
python -m pytest police-engine/tests -q
```

El ZIP no contiene los pesos. La validación estática no sustituye la prueba real de carga e inferencia en Preview de Vercel con Chrome/Edge/Opera Chromium actualizado.
