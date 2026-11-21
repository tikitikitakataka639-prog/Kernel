# Arranque WebGPU y diagnóstico en KERNEL

## Qué hace la versión 0.2.13
1. Al entrar en KERNEL, `WebGPUStartup` solicita primero un adaptador de alto rendimiento y, si no lo encuentra, vuelve a intentarlo sin preferencia; después crea un `GPUDevice` real. La pantalla inicial ofrece `REINTENTAR WEBGPU` si el navegador no consigue inicializarlo. El estado y el nombre del adaptador se muestran en la pantalla inicial y en Ajustes.
2. Al entrar en Chat General, KERNEL inicia Qwen3.5-2B. Si el GGUF ya está en OPFS/caché, restaura el modelo; de lo contrario descarga unos 1,27 GB desde Hugging Face y muestra el progreso.
3. Al cargar el GGUF, Wllama solicita su propio dispositivo WebGPU y aplica las capas configuradas. El backend de inferencia solo se marca como GPU cuando el modelo queda cargado con una cantidad de capas superior a cero.
4. El perfil rápido no se da por bueno si Wllama cae silenciosamente a CPU.

## Cómo comprobar que se está usando la GPU
En KERNEL debe aparecer en Chat General un estado similar a `QWEN 2B LISTO · WebGPU · NVIDIA ... · 24 capas`. El texto `WEBGPU INICIALIZADO` en el inicio solo confirma que la API puede abrir un dispositivo; el estado del modelo es la confirmación final de offload.

## Opera en Windows
- Abre Ajustes de Opera → Avanzado/Sistema y activa “Usar aceleración gráfica cuando esté disponible”. Reinicia Opera.
- Abre `opera://gpu` y comprueba que WebGPU figure como acelerado por hardware.
- En Configuración de Windows → Sistema → Pantalla → Gráficos, asigna `opera.exe` a “Alto rendimiento” y selecciona la NVIDIA GeForce GTX 1050 Ti. En Windows, el navegador puede seguir usando el adaptador que ya tiene asignado; `powerPreference: high-performance` no garantiza por sí solo que elija la NVIDIA.
- Si Opera ofrece la opción, `opera://flags/#force-high-performance-gpu` puede forzar el adaptador de alto rendimiento; úsala solo si la selección normal no elige la NVIDIA.
- Recarga KERNEL después de cambiar estos ajustes.

## Diagnóstico
- `navigator.gpu no existe`: aceleración gráfica desactivada, contexto no seguro, navegador/driver no compatible o WebGPU bloqueado.
- `No hay adaptador`: el navegador no encuentra un dispositivo compatible; revisa `opera://gpu`, drivers y asignación de GPU.
- `WebGPU inicializado` pero Qwen no detecta backend: el navegador creó un dispositivo, pero el build/worker Wllama no ha reconocido su backend. Comprueba la consola, cabeceras COOP/COEP y la versión del runtime.
- `WebGPU · ... · N capas` pero no hay texto: WebGPU ya está activo. El problema es el prefill, la plantilla, memoria/VRAM o velocidad del modelo; no la activación de la API.
- Si se pierde `GPUDevice`, recarga la página para volver a inicializarlo.

## Límites de la comprobación
La detección automática no puede activar aceleración si el usuario/agente gráfico la ha deshabilitado, si el driver bloquea la GPU o si el navegador selecciona el adaptador integrado. El equipo local y el navegador determinan el resultado.
