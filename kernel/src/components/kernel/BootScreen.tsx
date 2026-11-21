import { useEffect, useState } from "react";

import kernelLogo from "@/assets/kernel-logo-neon.png";


const LINES = [
  "cargando núcleo forense...",
  "indexando patrones G1–G4...",
  "sincronizando BOE / Código Penal...",
  "calibrando repudio...",
  "listo para proteger.",
];

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(id);
          return 100;
        }
        return Math.min(100, p + Math.random() * 6 + 1);
      });
    }, 55);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (progress < 100) return;
    const t = setTimeout(onDone, 700);
    return () => clearTimeout(t);
  }, [progress, onDone]);

  const value = Math.floor(progress);
  const line = LINES[Math.min(LINES.length - 1, Math.floor((value / 100) * LINES.length))];

  return (
    <div className="kernel-scanlines flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <img
        src={kernelLogo}
        alt="K.E.R.N.E.L"
        className="kernel-neon-image kernel-neon-flicker w-full max-w-md select-none"
        draggable={false}
      />

      <div className="w-full max-w-xl">
        <div className="text-center text-6xl font-bold tabular-nums text-primary kernel-glow sm:text-7xl">
          {value}
          <span className="text-2xl align-super">%</span>
        </div>
        <div className="mt-5 h-[3px] w-full overflow-hidden bg-secondary">
          <div
            className="h-full bg-primary transition-[width] duration-100 ease-out"
            style={{ width: `${value}%` }}
          />
        </div>
        <p className="mt-4 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground kernel-pulse">
          {line}
        </p>
      </div>
    </div>
  );
}
