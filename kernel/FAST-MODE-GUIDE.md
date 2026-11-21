# Modo rápido de KERNEL

1. Abre Ajustes → Chat General.
2. Activa **RÁPIDO — Qwen3.5-2B Claude Distilled** (1,27 GB).
3. Espera a que la descarga inicial y la carga terminen. No se incluyen en el watchdog de generación de 30 segundos.
4. Comprueba que el motor indique **WebGPU**. Si muestra **WASM CPU**, el navegador no está acelerando el cálculo y la generación puede tardar más; el límite de seguridad sigue siendo de 30 segundos.
5. Haz preguntas concretas. El perfil rápido limita las respuestas a 80 tokens aproximadamente para priorizar velocidad.
6. Para tareas más extensas, selecciona **PROFUNDO — Qwen3.5-4B Claude Distilled**; es más lento y no usa el watchdog rápido de 30 segundos.

## Medición
El panel muestra el tiempo total de la última respuesta, el tiempo hasta el primer texto y una estimación de tokens por segundo. Es una medición del navegador real; tiene más valor que cualquier cifra de referencia publicada.

## Limitaciones
- 30 segundos es el límite de seguridad del perfil rápido, no una promesa de que cualquier GPU, navegador o carga de sistema complete la respuesta en ese tiempo.
- La primera descarga y la inicialización no cuentan como respuesta.
- El modo policial conserva los límites de seguridad y solo acepta texto aportado; recortar la salida no convierte los detectores externos en análisis disponibles.
