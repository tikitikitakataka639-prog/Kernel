# KERNEL 0.2.13 — Qwen rápido en navegador

## Perfil predeterminado
- Modelo: `Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF`.
- Archivo: `Qwen3.5-2B.Q4_K_M.gguf` (1,27 GB).
- Revisión: `efb1952f4822d5fec9c4f018c5cfaf3f5c704383`.
- SHA-256: `6036e3b96a5dca3def9ba6f3aa751acebe081c4f109a8a9352647d0eea055c9d`.
- Runtime `wllama64@1.1.1`, WebAssembly Memory64 y aceleración WebGPU adaptativa.

## Ajustes de velocidad
- Contexto 2048; batch 256; historial 1200 caracteres; último mensaje 2200 caracteres.
- Prompt de sistema `minimo` y respuestas de 80 tokens máximo.
- Desactiva el pensamiento extendido mediante los parámetros Jinja documentados en la plantilla.
- Prueba 24, 20, 16 y 12 capas WebGPU para el perfil rápido; no cae silenciosamente a CPU si falla la GPU. El perfil profundo conserva su fallback.
- Primer texto: 30 s; inactividad entre fragmentos: 30 s; duración total: 30 s.
- Métricas: duración total, latencia al primer texto y tokens/s estimados.

## Perfil alternativo
El 4B sigue disponible como perfil `PROFUNDO`: 2,71 GB, contexto 3072, batch 128, 144 tokens y límites de tiempo superiores. Solo se mantiene un modelo residente a la vez.

## Interpretación del objetivo
El watchdog de 30 segundos se aplica una vez que el modelo está cargado y listo; no incluye descarga o inicialización. Es un límite de seguridad, no una promesa de velocidad, para dispositivos con WebGPU compatible y memoria suficiente. El perfil rápido exige backend WebGPU; si la GPU no puede inicializarse o Wllama no reconoce WebGPU, se muestra un error concreto en vez de continuar por CPU. La aplicación debe mostrar el backend activo y medir resultados reales.

Las pruebas publicadas de GTX 1050 Ti citadas como referencia usan Ollama/llama.cpp nativos, no Wllama en navegador. No se deben presentar como benchmarks de KERNEL.

## Arranque automático (0.2.13)

Al entrar en KERNEL, la raíz de la aplicación solicita un adaptador de alto rendimiento, reintenta sin preferencia si no lo encuentra y crea un `GPUDevice` real. La pantalla y Ajustes incluyen un botón de reintento. Al entrar en Chat General, Qwen se restaura de la caché o inicia automáticamente la primera descarga, mostrando el progreso. La confirmación de inferencia acelerada es el estado `WebGPU · [adaptador] · N capas`; el mensaje `WebGPU inicializado` en la pantalla de inicio solo confirma que la API pudo crear el dispositivo de navegador.
