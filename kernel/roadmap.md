# Estado del proyecto KERNEL — 0.2.12

## Aplicación web
- KERNEL se despliega como una única web en Vercel.
- Chat General usa Qwen3.5-2B Claude Distilled Q4_K_M como perfil rápido predeterminado (1,27 GB); Qwen3.5-4B Q4_K_M (2,71 GB) queda como perfil profundo opcional. Ambos se ejecutan en el navegador mediante `wllama64` Memory64 + WebGPU.
- Police Mode conversa y analiza texto con Llama 3.2 3B ejecutado en navegador mediante WebLLM; no necesita `KERNEL_AI_BASE_URL`.
- Los cuatro detectores especializados están desactivados en la interfaz mientras no exista un servicio Police Engine público; no se muestran como operativos.

## Objetivo de rapidez
- Perfil rápido Qwen 2B: máximo 80 tokens, hasta 7 s para primer texto, máximo 4 s de inactividad y 10 s totales por respuesta.
- Police Mode: contexto y salida compactos, con límites de 7 s para primer texto, 4 s de inactividad y 10 s totales.
- Los 10 segundos son un objetivo operativo para respuestas breves con WebGPU compatible, no una garantía universal. No incluye descarga ni inicialización inicial del modelo. Si el hardware no llega, KERNEL cancela e informa; CPU/WASM no garantiza esa latencia.
- La interfaz muestra duración total, latencia al primer texto y tokens/s para medir el equipo real.

## Pendiente de validación
- Instalar dependencias con Bun 1.3.1 y ejecutar build Vite/TanStack, typecheck y pruebas end-to-end.
- Desplegar una Preview real y medir inferencia cronometrada en el navegador/GPU de destino.
- Probar descarga, caché e inferencia del GGUF 2B y 4B en Chromium 137+ de 64 bits con Memory64 y JSPI.
- Desplegar y auditar Police Engine como servicio independiente antes de activar Horizon, MrBERT, Grooming ES/EN o PaxmodGuard.
