# AUDIT-REPORT — KERNEL-POLICE-0.2.14-STABLE-AUDITED

Fecha de auditoría: 2026-11-21  
Versión de entrada: KERNEL-POLICE-0.2.13.3-WATCHDOG-30S  
Versión de salida: KERNEL-POLICE-0.2.14-STABLE-AUDITED

## 1. Errores encontrados

### E1 — Watchdog total artificial de 30 s en Chat General (Qwen)
- **Archivos**: `src/lib/qwen-browser-engine.ts`
- **Causa técnica**: `FAST_GENERATION_TOTAL_TIMEOUT_MS = 30_000` y lógica de `deadline` que abortaba cualquier generación que superara 30 s desde el inicio, independientemente de si había progreso.
- **Impacto**: Respuestas válidas se cancelaban a mitad de streaming; se mostraban mensajes de “watchdog agotado” aunque el modelo seguía trabajando.

### E2 — Prefill y generación confusos en el mismo presupuesto
- **Archivos**: `src/lib/qwen-browser-engine.ts`
- **Causa**: El timeout del primer token y el idle se mezclaban con el total de 30 s; la ausencia de texto visible durante el prefill se trataba como bloqueo.
- **Impacto**: Cancelaciones prematuras en dispositivos con GPU/CPU más lentas.

### E3 — Watchdogs extremadamente agresivos en Police Mode (Llama 3.2 3B)
- **Archivos**: `src/lib/kengine-native/engine.ts`
- **Causa**: First-token 7 s, idle 4 s, total 10 s.
- **Impacto**: Imposible completar casi cualquier respuesta de análisis policial en el navegador.

### E4 — Textos de UI y preflight desactualizados
- **Archivos**: `src/components/kernel/GeneralModelManager.tsx`, `src/routes/ajustes.tsx`, `scripts/vercel-preflight.mjs`
- **Causa**: Cadenas y aserciones hardcodeadas a “30 segundos” y a los valores antiguos de las constantes.

### E5 — Ausencia de package-lock.json
- **Archivos**: raíz del proyecto
- **Causa**: Eliminación previa de bun.lock sin generación de package-lock.json.
- **Impacto**: Builds no reproducibles en Vercel (aunque npm install funciona).

## 2. Cambios realizados

1. Reestructuración completa de constantes de watchdog por fase en ambos motores.
2. Mensajes de error actualizados: distinguen prefill de idle post-progreso y no afirman fallos de GPU sin evidencia.
3. Textos de UI y preflight alineados con los nuevos valores.
4. Versión elevada a 0.2.14.
5. Documentación de cambios (`KERNEL-0.2.14-STABLE-AUDITED.md`).

No se eliminaron watchdogs; se sustituyeron por límites razonables y diferenciados.  
No se cambiaron modelos, arquitectura de inferencia, detectores policiales ni la interfaz principal.

## 3. Pruebas ejecutadas

| Prueba | Resultado | Notas |
|--------|-----------|-------|
| Extracción e inspección del ZIP | VERIFICADO | Código fuente accesible |
| Búsqueda estática de watchdogs y flujos de generación | VERIFICADO | Ambos motores auditados por separado |
| Modificación de constantes y mensajes | VERIFICADO | Diff aplicado |
| Actualización de preflight | VERIFICADO | Aserciones coinciden con nuevas constantes |
| `npm install` limpio | FALLIDO / PARCIAL | Sandbox de auditoría: instalación incompleta por límites de tiempo/red; node_modules parcial (~328 paquetes) |
| `tsc --noEmit` | NO VERIFICADO | Dependencias incompletas en el entorno |
| Suite `bun test` / tests unitarios | NO VERIFICADO | Requiere instalación completa |
| Build de producción (`npm run build`) | NO VERIFICADO | Idem |
| Preflight Vercel | NO VERIFICADO en ejecución real | Script actualizado; debe ejecutarse en CI/Vercel |
| Inferencia real WebGPU / primer token > 30 s | NO VERIFICADO | Requiere navegador + GPU del usuario |
| Cancelación manual durante generación | VERIFICADO por código | AbortController + finally / cancel en ambos transportes |
| Limpieza de estado `generating` tras error | VERIFICADO por código | finally + nativeStore.setGenerating(false) |
| Respuestas vacías | VERIFICADO por código | Se lanza error explícito; no se inventa texto |
| Respuesta > 30 s sin cancelación artificial | VERIFICADO por diseño | Total ahora 180–600 s |

## 4. Limitaciones que todavía existen

- No se pudo completar instalación/build/test en el entorno de auditoría.
- No hay reintentos automáticos de generación (decisión deliberada para evitar duplicados y estados inconsistentes).
- El entorno no permite probar WebGPU real ni descarga de modelos GGUF/MLC.
- package-lock.json no está presente; se recomienda generar uno con `npm install` en un entorno limpio antes del deploy de producción.

## 5. Pasos para desplegar en Vercel

1. Subir el ZIP completo `KERNEL-POLICE-0.2.14-STABLE-AUDITED.zip`.
2. Framework preset: Vite / o “Other”.
3. Install Command: `npm install`
4. Build Command: `npm run build`
5. Node.js Version: 24.x
6. Verificar que los headers COOP/COEP aparecen en las respuestas (ya en `vercel.json`).
7. Tras el primer deploy, abrir Chat General y Police Mode, cargar los modelos y verificar que una respuesta larga (> 30 s) no se cancela.

## 6. Clasificación final

- **Correcciones de watchdog y mensajes**: VERIFICADO (código)
- **Conservación de funcionalidades existentes**: VERIFICADO (inspección)
- **Build y tests automatizados en este entorno**: NO VERIFICADO / FALLIDO parcial
- **Inferencia end-to-end en navegador**: NO VERIFICADO

El proyecto queda en un estado técnicamente más estable respecto al problema principal (cancelación de generaciones válidas). La verificación final de rendimiento y estabilidad debe realizarse en el navegador del usuario y en el pipeline de Vercel.
