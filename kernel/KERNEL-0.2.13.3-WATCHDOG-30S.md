# KERNEL 0.2.13.3 — watchdog de generación de 30 segundos

## Cambio

El perfil rápido de Qwen amplía sus límites de generación de 10/4/10 segundos a 30/30/30 segundos:

- Primer token: 30 segundos.
- Intervalo máximo sin fragmentos: 30 segundos.
- Duración total de la generación: 30 segundos.

La descarga y la carga del modelo mantienen sus propios límites y no se contabilizan dentro de estos 30 segundos. El límite es un mecanismo de seguridad; no garantiza que el modelo vaya a responder en 30 segundos en todos los equipos. Si se agota, la generación se cancela y se libera el trabajo pendiente.

Police Mode conserva sus límites independientes; este cambio afecta al perfil rápido de Qwen en Chat General.
