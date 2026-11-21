# KERNEL POLICE ENGINE — fuente del servicio independiente

Este directorio contiene el backend Python de Police Engine. **No forma parte del despliegue de la aplicación web en Vercel y no se inicia automáticamente al abrir KERNEL.**

La interfaz pública de KERNEL mantiene separados estos componentes:

- **Chat General:** Qwen3.5-2B Claude Distilled es el perfil rápido predeterminado; Qwen3.5-4B queda como perfil profundo opcional. Ambos se descargan y ejecutan en el navegador mediante `wllama64` Memory64. No usan K.ENGINE ni este backend.
- **Police Mode:** Llama 3.2 3B se ejecuta en el navegador mediante WebLLM y atiende la conversación y la interpretación del expediente con un presupuesto de salida reducido para priorizar respuestas breves. Los detectores Horizon, MrBERT Legal, Grooming ES/EN y PaxmodGuard requieren este servicio independiente y permanecen desactivados en la interfaz mientras no exista un despliegue público de Police Engine.

## Estado de este backend

El backend Python de este directorio está conservado como código fuente para un despliegue futuro en infraestructura que admita un servicio persistente. La aplicación Vercel actual no lo ejecuta. No configures `localhost` como dirección de un servicio público: en el navegador de cada visitante, localhost apunta al propio dispositivo.

Los scripts de Windows que aparecen en este directorio son auxiliares para pruebas locales del backend y no son necesarios para importar, compilar ni utilizar la aplicación web.

## Precauciones

- No publiques el backend sin revisar autenticación, límites de uso, CORS y privacidad.
- No consideres scores ni alertas como prueba, diagnóstico o declaración de culpabilidad.
- Grooming ES/EN conserva carácter experimental; su corpus y evaluación no acreditan precisión en conversaciones reales.
- MrBERT Legal es un encoder de apoyo y no determina por sí solo la legalidad de una conducta.
