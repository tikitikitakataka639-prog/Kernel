# Corrección 0.2.13.1 — instalación y watchdog

- Se retiró `bun.lock` porque el archivo distribuido tenía sintaxis/resolución que Vercel/Bun rechazaba.
- Se fija `packageManager` en `npm@10.9.2`; Vercel resolverá dependencias desde `package.json` con npm.
- Se mantiene `wllama64@1.1.1` como dependencia declarada.
- Se corrigió la contradicción restante: `vercel.json` aún invocaba `bun run build` y el preflight exigía `bun.lock`/`bun@1.3.1`.
- Vercel ahora instala con `npm install` y compila con `npm run build`; el preflight valida esa misma configuración.
- El workflow principal de GitHub instala con npm y conserva Bun únicamente para ejecutar la suite `bun test`.
- Se corrigió el texto del watchdog: que WebGPU esté disponible y haya capas configuradas no significa que el prefill haya terminado. El timeout es un límite impuesto por KERNEL, no un diagnóstico concluyente de fallo de GPU.

## Limitación
No se ejecutó `npm install` ni el build completo en este entorno. La resolución de dependencias y el despliegue deben verificarse en Vercel. La inferencia real y el tiempo de prefill requieren prueba en el navegador y la GPU del usuario.

## Comprobación de esta revisión

- La raíz ya no exige `bun.lock`.
- `packageManager`, `vercel.json` y el preflight apuntan a npm 10.9.2.
- El build de Vercel ya no invoca Bun.
- Esta corrección de configuración no equivale a un build completo: debe confirmarse en Vercel tras importar el ZIP.
