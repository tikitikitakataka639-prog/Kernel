import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";

import kernelLogo from "@/assets/kernel-logo-neon.png";
import { BootScreen } from "@/components/kernel/BootScreen";
import { Toaster } from "@/components/ui/sonner";
import { useWebGPUStatus, webgpuEngine } from "@/lib/ai/hardware/WebGPUEngine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "K.E.R.N.E.L. — asistente y análisis" },
      {
        name: "description",
        content:
          "KERNEL: asistente conversacional y análisis de evidencias.",
      },
      { property: "og:title", content: "K.E.R.N.E.L. — asistente y análisis" },
      {
        property: "og:description",
        content: "Chat General y Police Mode en una sola aplicación web.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/** Accesos principales de la pantalla de inicio. Rutas existentes; sin motores nuevos. */
const ENGINES = [
  {
    to: "/analisis" as const,
    label: "POLICE MODE",
    code: "PE-01",
    desc: "Análisis de denuncias · evidencias · indicadores de riesgo",
    modelNote: "Modelo de referencia: Llama 3.2 3B",
    icon: Shield,
  },
  {
    to: "/chat" as const,
    label: "CHAT GENERAL",
    code: "GE-01",
    desc: "Asistente conversacional principal de KERNEL",
    modelNote: "Qwen3.5-2B rápido · 4B opcional · inferencia en el navegador",
    icon: MessageSquare,
  },
] as const;

function Index() {
  const [booted, setBooted] = useState(true);
  const [retryingGpu, setRetryingGpu] = useState(false);
  const gpu = useWebGPUStatus();

  const retryWebGPU = async () => {
    if (retryingGpu) return;
    setRetryingGpu(true);
    try {
      await webgpuEngine.init();
    } finally {
      setRetryingGpu(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("kernel.booted") !== "1") setBooted(false);
  }, []);

  const finishBoot = () => {
    window.sessionStorage.setItem("kernel.booted", "1");
    setBooted(true);
  };

  if (!booted) {
    return (
      <>
        <BootScreen onDone={finishBoot} />
        <Toaster />
      </>
    );
  }

  return (
    <div className="kernel-scanlines flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="kernel-ambient sr-only">K.E.R.N.E.L</h1>
      <img
        src={kernelLogo}
        alt="K.E.R.N.E.L"
        className="kernel-neon-image kernel-neon-flicker w-full max-w-[min(100%,28rem)] select-none"
        draggable={false}
      />

      <p className="mt-6 text-center text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
        seleccione motor
      </p>

      <nav
        className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5"
        aria-label="Motores principales"
      >
        {ENGINES.map(({ to, label, code, desc, modelNote, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex min-h-[9.5rem] flex-col border border-border bg-card px-5 py-5 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none sm:min-h-[11rem] sm:px-6 sm:py-6"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <Icon
                  className="size-5 shrink-0 text-primary sm:size-6"
                  aria-hidden="true"
                />
                <span className="text-sm font-bold tracking-[0.18em] text-foreground group-hover:text-primary sm:text-base sm:tracking-[0.22em]">
                  {label}
                </span>
              </span>
              <span className="font-mono text-[9px] tracking-widest text-muted-foreground">
                {code}
              </span>
            </span>
            <span className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
              {desc}
            </span>
            <span className="mt-4 border-t border-border pt-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
              {modelNote}
            </span>
          </Link>
        ))}
      </nav>

      <Link
        to="/ajustes"
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 border border-border bg-card px-6 py-3 text-xs font-bold tracking-[0.2em] text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label="Abrir ajustes de KERNEL"
      >
        <Settings className="size-4" aria-hidden="true" />
        AJUSTES
      </Link>

      <div className="mt-5 flex max-w-xl flex-col items-center gap-2 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <p role="status" aria-live="polite">
          {gpu.disponible
            ? `WEBGPU INICIALIZADO · ${gpu.adaptador ?? "GPU compatible"}`
            : gpu.motivo === "pendiente de inicialización"
              ? "INICIALIZANDO WEBGPU…"
              : `WEBGPU NO DISPONIBLE · ${gpu.motivo ?? "motivo desconocido"}`}
        </p>
        {!gpu.disponible && gpu.motivo !== "pendiente de inicialización" && (
          <button
            type="button"
            onClick={() => void retryWebGPU()}
            disabled={retryingGpu}
            className="border border-border px-3 py-2 text-[9px] font-bold tracking-widest text-primary transition-colors hover:border-primary disabled:opacity-50"
          >
            {retryingGpu ? "COMPROBANDO GPU…" : "REINTENTAR WEBGPU"}
          </button>
        )}
      </div>
      <p className="mt-4 max-w-lg text-center text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:mt-6 sm:text-[10px]">
        conclusiones indiciarias · sin interacción con cuentas analizadas
      </p>
      <Toaster />
    </div>
  );
}
