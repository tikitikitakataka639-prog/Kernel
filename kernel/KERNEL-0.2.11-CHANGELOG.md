# KERNEL 0.2.11 — corrección de procesos atascados y proveedor heredado

## Chat General
- Se mantiene Qwen3.5-4B Claude Distilled Q4_K_M mediante `wllama64` Memory64 en el navegador.
- Se usa la plantilla Jinja del GGUF (`jinja: true`) y `enable_thinking: false` en `chat_template_kwargs`, evitando opciones no documentadas por el runtime.
- La generación conserva límites de inactividad y duración total, interrumpe el worker si el runtime se atasca y muestra el error en la conversación.

## Police Mode
- La conversación policial sigue usando Llama 3.2 3B mediante WebLLM/WebGPU en el navegador.
- El transporte local ahora libera siempre el estado `generando` en `finally`, propaga la señal de cancelación al motor y detiene el worker cuando se cancela el stream.
- La ruta heredada `/api/chat` devuelve HTTP 410 `BROWSER_INFERENCE_ONLY`.
- Se retiran los módulos de proveedor de IA remoto y el adaptador OpenAI-compatible heredado; no son necesarios para ninguno de los dos chats locales.
- Los detectores Horizon, MrBERT Legal, Grooming y PaxmodGuard siguen desactivados hasta desplegar un servicio Police Engine independiente. No se inventan resultados.

## Límites de validación
- La comprobación estática y la suite Python deben ejecutarse en esta entrega.
- El build Vite/TanStack con Bun y la inferencia real en Preview de Vercel requieren un entorno de despliegue con dependencias instalables y navegador compatible; no se declaran aprobados sin ejecutarlos.
