# KERNEL — comprobaciones pendientes antes de distribución pública

Este paquete integra código fuente y adaptadores, pero no equivale a una autorización legal general para redistribuir cada elemento incluido.

## Licencias y procedencia

- [ ] Elegir y añadir una licencia raíz para el código propio de KERNEL. No se ha supuesto que la licencia Apache-2.0 de Paxmod cubra todo KERNEL.
- [ ] Confirmar que se tienen derechos para redistribuir los siete assets de reacción aportados. Sustituirlos por assets con licencia compatible si no se dispone de permiso.
- [ ] Revisar licencias y avisos de todas las dependencias y modelos descargados en primera ejecución.
- [ ] Verificar hashes/procedencia de los artefactos oficiales antes de publicar un instalador binario. PyPI no muestra una attestation de provenance para paxmod-guard 0.1.1.
- [ ] Mantener intactos los avisos de copyright, LICENSES/ y THIRD_PARTY_NOTICES.md.

## Seguridad y privacidad

- [ ] Publicar política de privacidad que explique análisis local, almacenamiento de caché, conexiones de descarga inicial y cualquier proveedor externo opcional.
- [ ] Mantener el servicio Police Engine ligado a 127.0.0.1 y CORS con orígenes exactos; nunca usar '*'.
- [ ] Probar Private Network Access y permisos del navegador en los dominios definitivos.
- [ ] No enviar datos de conversaciones a servicios externos sin consentimiento y aviso explícito.
- [ ] Mantener revisión humana obligatoria; nunca usar puntuaciones para acusar, sancionar o identificar personas automáticamente.

## Calidad del modelo

- [ ] Ejecutar el smoke test real de PaxmodGuard con los pesos oficiales en Windows y CPU.
- [ ] Evaluar español de España y variantes regionales con conjuntos representativos y revisión humana independiente.
- [ ] Medir falsos positivos/negativos por categoría y establecer umbrales justificados.
- [ ] Reentrenar o validar Grooming con scikit-learn 1.9.1 exacto; el checkpoint actual es experimental y su corpus es sintético.
- [ ] Realizar instalación limpia en Windows 10/11 x64, descarga completa, análisis, exportación de expediente y recuperación de errores.

## Producto

- [ ] Probar la descarga, carga y generación del perfil rápido Qwen3.5-2B y del perfil profundo Qwen3.5-4B en Chromium Memory64 de 64 bits; registrar latencia al primer texto, duración total y tokens/s en WebGPU y CPU.
- [ ] Medir rendimiento real en el equipo mínimo compatible; el objetivo ≤10 s es solo para respuestas breves con WebGPU y debe rechazarse como garantía si el benchmark real no lo confirma. CPU WASM puede ser lenta.
- [ ] Desplegar Police Engine en un servicio público antes de habilitar los cuatro detectores especializados.
- [ ] Confirmar arranque WebGPU automático al abrir KERNEL y carga/restauración automática del Qwen 2B al entrar en Chat General.
- [ ] Ejecutar build, typecheck y pruebas end-to-end desde una instalación limpia; verificar que los límites de 10 s al primer texto, 4 s de inactividad y 10 s totales no cortan respuestas útiles de forma excesiva.
- [ ] Verificar enlaces, documentación de instalación, soporte y mecanismos de actualización.
