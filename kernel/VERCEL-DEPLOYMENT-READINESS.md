# KERNEL 0.2.13 — guía de despliegue Vercel

Esta versión es una aplicación web única. Vercel sirve la interfaz y las funciones del proyecto; los dos modelos conversacionales se ejecutan en el navegador del visitante. El ZIP no incluye pesos de modelos.

## Arquitectura actual

| Área | Motor | Ejecución | Requiere backend remoto |
|---|---|---|---|
| Chat General | Qwen3.5-2B Claude Distilled por defecto; 4B opcional | Navegador, wllama64 Memory64 + WebGPU | No |
| Police Mode | Llama 3.2 3B, MLC q4f32_1 | Navegador, WebLLM | No para conversación e interpretación |
| Detectores Police Engine | Horizon, MrBERT Legal, Grooming ES/EN, PaxmodGuard | Servicio Police Engine independiente | Sí |

**Importante:** Chat General y la conversación de Police Mode no llaman a `/api/chat` y no necesitan `KERNEL_AI_BASE_URL`. Esa variable pertenecía al adaptador remoto anterior; no la añadas a Vercel para resolver los errores de esta versión.

## Importar en Vercel

1. Importa el ZIP completo.
2. `Root Directory`: `./`.
3. Mantén el framework detectado como TanStack Start.
4. No fuerces `Output Directory` a `dist`, `build` o `public`; Nitro genera `.vercel/output`.
5. El build usa `npm run build`. El paquete fija npm 10.9.2 y Node.js 24.x.

## Variables de entorno

| Variable | ¿Necesaria? | Función |
|---|---|---|
| `KERNEL_AI_BASE_URL` | **No** | Adaptador remoto heredado; no participa en los chats locales. No configurarla para corregir Police Mode. |
| `VITE_KERNEL_POLICE_URL` | Solo para detectores automáticos | URL HTTPS pública del servicio Police Engine alojado aparte. |
| `SEARXNG_URL` / `SEARXNG_API_KEY` | Opcionales | Búsqueda externa, si se configura expresamente. |
| `LOVABLE_API_KEY` | Opcional | Funciones de voz heredadas que usen Lovable AI Gateway; no carga los modelos conversacionales. |

No coloques secretos en variables `VITE_*`: se incorporan al código cliente. Si `VITE_KERNEL_POLICE_URL` no está configurada, los detectores automáticos no se ejecutan; la conversación local con Llama sigue disponible.

## Cómo activar cada modo

### Chat General

WebGPU se inicializa al abrir KERNEL: solicita el adaptador de alto rendimiento y reintenta con la selección predeterminada si es necesario. La pantalla inicial y Ajustes permiten reintentar tras corregir la configuración del navegador. Al entrar en Chat General, el perfil rápido Qwen3.5-2B (1,27 GB) se restaura desde la caché o se descarga automáticamente. El perfil 4B (2,71 GB) queda como opción de mayor capacidad en Ajustes. La descarga se realiza desde Hugging Face en el navegador y el modelo se ejecuta allí. Se requiere Chromium de 64 bits actualizado, HTTPS, JSPI, Memory64, `SharedArrayBuffer` y aislamiento cross-origin (COOP/COEP). La primera carga necesita almacenamiento y RAM adicionales.

### Police Mode

En `AJUSTES → POLICE MODE`, descarga y carga Llama 3.2 3B. La ruta `/analisis` utiliza ese modelo local mediante `KEngineNativeChatTransport("analysis")`; no hace solicitudes al endpoint `/api/chat`. Si Llama no está cargado, la pantalla indica cómo activarlo.

Llama 3.2 3B en esta integración es un modelo de texto: las capturas se muestran en el formulario, pero no se interpretan. Las URL aportadas se guardan como referencias y no se consultan.

### Detectores automáticos

Horizon, MrBERT Legal, Grooming y PaxmodGuard son distintos de la conversación local. Para ejecutarlos hay que alojar el directorio `police-engine/` en un servicio compatible con Python/FastAPI, publicarlo con HTTPS, revisar autenticación, CORS, límites de uso y privacidad, y definir `VITE_KERNEL_POLICE_URL`. El backend Python no se inicia como servidor persistente dentro del despliegue web de Vercel. Hasta que ese servicio exista, KERNEL no descarga los detectores ni emite puntuaciones ficticias.

## Protección contra bloqueos

- Qwen: perfil rápido con máximo 80 tokens, ventana/contexto e historial reducidos, WebGPU adaptativo (24/20/16/12 capas para 2B), primer texto en 10 s, timeout de inactividad 4 s y límite total 10 s. El perfil 4B opcional conserva más tiempo y salida.
- Llama: contexto MLC 2048, prompt policial local compacto, salida limitada a 112 tokens en chat/144 en análisis, primer texto en 10 s, inactividad 4 s y duración total 10 s. Al vencer, se interrumpe/termina el worker y se muestra un error concreto.
- Estos límites evitan indicadores infinitos, pero no garantizan que el modelo sea compatible con todas las GPU/navegadores. La inferencia real debe probarse en el navegador de destino.

## Errores Vercel comunes

| Síntoma | Qué revisar |
|---|---|
| `No Root Directory` / no encuentra `package.json` | Debe quedar en la raíz del ZIP y Root Directory debe ser `./`. |
| `Install Command failed` / Bun | Mantener npm 10.9.2 y `package.json (sin lockfile Bun)`; comprobar disponibilidad del registro de paquetes. |
| `Unsupported engine` | Mantener Node.js 24.x. |
| 404 al abrir rutas | Revisar preset Vercel de Nitro, `.vercel/output` y Build Logs; no añadir rewrites globales. |
| `FUNCTION_PAYLOAD_TOO_LARGE` (413) | No enviar archivos de varios GB a una Function. Los pesos se descargan desde el navegador. |
| `FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE` | No devolver binarios/modelos en JSON; usar descarga directa o almacenamiento. |
| `FUNCTION_INVOCATION_TIMEOUT` (504) | No ejecutar inferencia larga ni cargas de modelos dentro de Functions. Este diseño usa inferencia de navegador. |
| 500 / `FUNCTION_INVOCATION_FAILED` | Leer Runtime Logs, validar las variables realmente utilizadas y capturar errores. |
| CORS / aislamiento / `SharedArrayBuffer` | Confirmar COOP `same-origin`, COEP `require-corp`, HTTPS y compatibilidad del navegador. |
| Detectores `no disponible` | Configurar y verificar el servicio remoto Police Engine; no tiene relación con `KERNEL_AI_BASE_URL`. |

No existe una lista finita de todos los errores posibles: también pueden producirse incidencias de DNS, red, cuota, región, proveedor o cuenta.

## Validación realizada para 0.2.13

- Preflight de Vercel: superado, incluidas las comprobaciones de perfil rápido, perfiles de GPU y límites de generación.
- API heredada `/api/chat`: retirada con HTTP 410 `BROWSER_INFERENCE_ONLY`; ya no consulta `KERNEL_AI_BASE_URL`.
- Chat General: perfil 2B Q4_K_M por defecto, 4B opcional, SHA/revisión fijados, Jinja activado, prompt compacto, 80 tokens, WebGPU adaptativo, primer texto 10 s, inactividad 4 s y límite total 10 s.
- Police Mode: contexto de 2048, historial compacto, 112 tokens en chat/144 en análisis, primer texto 10 s, inactividad 4 s y límite total 10 s.
- Sintaxis TS/TSX: 141 archivos analizados con el compilador TypeScript (transpile/parser), 0 errores sintácticos.
- Police Engine Python: 45 aprobados, 5 omitidos; 20 avisos de incompatibilidad de versión de scikit-learn al cargar el checkpoint legado.
- Build completo de Vite/TanStack: no ejecutado, porque este entorno carece de `node_modules` y Bun; `tsc --noEmit` tampoco puede resolver los tipos de Bun, Vite y WebGPU sin instalar dependencias.
- Prueba de Preview en Vercel, carga WebGPU real e inferencia cronometrada: pendientes. El objetivo de 10 s se tiene que confirmar en el navegador/GPU reales.


## Arranque automático WebGPU (0.2.13)

`WebGPUStartup` inicializa la API en el componente raíz. El modelo Qwen rápido se restaura o descarga automáticamente al abrir Chat General. El perfil rápido exige que el backend Wllama confirme WebGPU y no marca como listo un fallback CPU silencioso. En Windows/Opera, si el navegador elige la GPU integrada o bloquea WebGPU, revisa `opera://gpu`, activa la aceleración gráfica del navegador y asigna `opera.exe` a la GPU de alto rendimiento desde la configuración de Gráficos de Windows.
