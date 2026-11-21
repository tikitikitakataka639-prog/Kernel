# KERNEL 0.2.14-STABLE-AUDITED

## Resumen

Auditoría y estabilización del sistema de generación de ambos motores (Qwen Chat General y Llama 3.2 3B Police Mode).

Los watchdogs se han reestructurado por fases:

| Fase              | Chat General (rápido) | Chat General (profundo) | Police Mode (Llama 3B) |
|-------------------|-----------------------|-------------------------|------------------------|
| Primer token (prefill) | 90 s                 | 120 s                  | 90 s                  |
| Idle tras progreso   | 45 s                 | 60 s                   | 30 s                  |
| Total de seguridad   | 300 s (5 min)        | 600 s (10 min)         | 180 s (3 min)         |

- El tiempo de prefill es independiente de la duración total.
- No existe un límite artificial de 30 s que cancele respuestas válidas.
- La ausencia temporal de texto no se interpreta automáticamente como bloqueo.
- La cancelación manual del usuario sigue funcionando.
- Los estados de generación se limpian en `finally` / `cancel`.
- No se inventan respuestas ante fallos.

## Motivo de los valores

- Prefill de modelos 2B–4B cuantizados en WebGPU/CPU de gama media puede superar fácilmente 20–60 s.
- Idle de 30–60 s permite pausas naturales del streaming sin cancelar.
- Total de varios minutos actúa solo como red de seguridad, no como objetivo de latencia.

## Archivos modificados

- `src/lib/qwen-browser-engine.ts`
- `src/lib/kengine-native/engine.ts`
- `src/components/kernel/GeneralModelManager.tsx`
- `src/routes/ajustes.tsx`
- `scripts/vercel-preflight.mjs`
- `package.json` (versión 0.2.14)

## Limitaciones

- Instalación completa de dependencias y build de producción no se completaron en el entorno de auditoría (restricciones de tiempo/red del sandbox).
- Inferencia real WebGPU y descarga de modelos requieren verificación en el navegador del usuario.
- No se añadieron reintentos automáticos de generación (se consideró que un reintento automático de prefill/generación completa podía producir respuestas duplicadas o estados inconsistentes).

## Despliegue Vercel

1. Importar el ZIP.
2. Confirmar `installCommand: npm install` y `buildCommand: npm run build`.
3. Node 24.x.
4. Headers COOP/COEP ya configurados en `vercel.json`.
