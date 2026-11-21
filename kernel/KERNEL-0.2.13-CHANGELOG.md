# KERNEL 0.2.13 — WebGPU Startup

## Correcciones
- Inicializa un adaptador y dispositivo WebGPU real al entrar en la aplicación.
- Deduplica las solicitudes de inicialización para evitar dispositivos concurrentes durante el arranque.
- Si `requestAdapter({ powerPreference: "high-performance" })` no encuentra GPU, reintenta con la selección predeterminada del navegador.
- La pantalla inicial y Ajustes ofrecen un reintento manual tras corregir la aceleración/controladores.
- Chat General restaura el modelo rápido desde la caché o inicia su descarga al entrar por primera vez, con progreso visible.
- El perfil rápido exige que el navegador y Wllama detecten WebGPU; ya no termina declarándose listo en CPU sin avisar.
- El backend visible incluye el nombre del adaptador y el número de capas cargadas en GPU.
- El primer texto tiene un límite de 10 segundos (antes 7) y el mensaje distingue fallo de WebGPU de demora en el prefill del modelo.

## Importante
- La inicialización de WebGPU de la aplicación comprueba/abre el dispositivo. Wllama crea su propio dispositivo en el worker al cargar las capas GGUF; el backend se considera acelerado solo cuando el gestor informa `WebGPU · ... · N capas`.
- En la primera entrada a Chat General se inicia automáticamente una descarga de aproximadamente 1,27 GB si no existe en la caché del navegador.
- No se promete una respuesta completa en 10 segundos en todo hardware; se mide la latencia real.
- Para Windows, el navegador debe tener aceleración gráfica activa y estar asignado a la GPU de alto rendimiento.
