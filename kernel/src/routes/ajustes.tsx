import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { KernelShell } from "@/components/kernel/KernelShell";
import { PoliceModelManager } from "@/components/kernel/PoliceModelManager";
import { GeneralModelManager } from "@/components/kernel/GeneralModelManager";
import { Button } from "@/components/ui/button";
import { getNativeModel } from "@/lib/kengine-native/catalog";
import { nativeStore } from "@/lib/kengine-native/store";
import { useNativeEngine } from "@/lib/kengine-native/use-native-engine";
import { MODE_POLICE_ENGINE } from "@/lib/product-engines";

export const Route = createFileRoute("/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes — K.E.R.N.E.L." },
      {
        name: "description",
        content: "Configura el modelo de Chat General y los componentes de Police Mode.",
      },
      { property: "og:title", content: "Ajustes — K.E.R.N.E.L." },
      {
        property: "og:description",
        content: "Dos motores: CHAT GENERAL y MODE POLICE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ajustes,
});

/** Herramientas policiales con implementación real en KERNEL POLICE ENGINE. */
const POLICE_TOOLS = [
  {
    id: "denuncias",
    label: "Análisis de denuncias",
    detail: "Flujo de análisis e informe en /analisis",
  },
  {
    id: "horizon",
    label: "Detección de phishing y fraude",
    detail: "Horizon · requiere servicio Police Engine",
  },
  {
    id: "grooming",
    label: "Detección de grooming",
    detail: "Grooming ES/EN · experimental (TF-IDF + LR + G01-G09), requiere servicio",
  },
  {
    id: "mrbert",
    label: "Análisis jurídico MrBERT",
    detail: "MrBERT Legal · encoder jurídico, requiere servicio",
  },
  {
    id: "evidencias",
    label: "Análisis de evidencias e indicios",
    detail: "Resultados y evidencias en la página de Análisis",
  },
] as const;

const POLICE_NATIVE_ID = MODE_POLICE_ENGINE.nativeModelId!;

function Ajustes() {
  const native = useNativeEngine();
  const s = native.status;
  const busyNative = s.fase === "descargando" || (s.fase === "listo" && s.generando);
  const policeMeta = getNativeModel(POLICE_NATIVE_ID);
  const policeInCache = Boolean(native.cached[POLICE_NATIVE_ID]);
  const policeLoaded = s.fase === "listo" && s.modelo === POLICE_NATIVE_ID;
  const policeDownloading = s.fase === "descargando" && s.modelo === POLICE_NATIVE_ID;
  const policeGenerating = s.fase === "listo" && s.generando;

  let policeBadge = "no descargado";
  if (policeLoaded) policeBadge = "en memoria";
  else if (policeDownloading) policeBadge = `descargando ${Math.round(s.progreso * 100)}%`;
  else if (policeInCache) policeBadge = "en caché";

  const loadPoliceModel = () => {
    if (busyNative) return;
    nativeStore.select(POLICE_NATIVE_ID);
    void nativeStore.load();
  };

  return (
    <KernelShell title="AJUSTES" subtitle="configuración de KERNEL">
      <section className="border border-border bg-card p-5" aria-labelledby="engines-title">
        <h2 id="engines-title" className="text-sm font-bold tracking-[0.2em] text-primary">
          Motores de KERNEL
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Configura el modelo del Chat General y el motor de análisis policial. Los pesos del modelo general
          se descargan una vez y quedan guardados en el almacenamiento de este navegador.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col border border-border bg-background p-4">
            <header>
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground">GE-01</p>
              <h3 className="mt-1 text-sm font-bold tracking-[0.18em] text-foreground">CHAT GENERAL</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Perfil rápido Qwen3.5-2B Claude Distilled (4B opcional) ejecutado directamente en tu navegador.
                El perfil rápido dispone de watchdogs diferenciados por fase (prefill / idle / total de seguridad); WebGPU puede reducir la latencia, pero no garantiza una velocidad concreta.
              </p>
            </header>
            <div className="mt-4">
              <GeneralModelManager />
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Link
                to="/chat"
                className="inline-flex items-center border border-primary px-3 py-1.5 text-[10px] font-bold tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
              >
                IR AL CHAT GENERAL
              </Link>
            </div>
          </article>

          <article className="flex flex-col border border-border bg-background p-4">
            <header>
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground">
                {MODE_POLICE_ENGINE.code}
              </p>
              <h3 className="mt-1 text-sm font-bold tracking-[0.18em] text-foreground">
                {MODE_POLICE_ENGINE.label}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Motor especializado en análisis de denuncias. Llama 3B se ejecuta en el navegador; los detectores específicos necesitan un servicio Police Engine.
              </p>
            </header>
            <div className="mt-4 border border-border/80 bg-card/50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Modelo</p>
              <p className="mt-1 text-xs font-medium text-foreground">
                {MODE_POLICE_ENGINE.modelLabel}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                <code className="text-primary">{POLICE_NATIVE_ID}</code>
                {policeMeta ? ` · ~${Math.round(policeMeta.vramRequiredMB)} MB VRAM` : ""}
              </p>
              <p
                className={`mt-2 text-[10px] uppercase tracking-widest ${
                  policeLoaded ? "text-primary" : "text-muted-foreground"
                }`}
              >
                WebLLM · {policeBadge}
              </p>
              {policeDownloading ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    {"detalle" in s ? s.detalle : "Descargando…"}
                  </p>
                  <div className="h-2 w-full border border-border bg-background">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.max(2, Math.round(s.progreso * 100))}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {"detalle" in s && s.fase !== "descargando" && s.modelo === POLICE_NATIVE_ID ? (
                <p className="mt-2 text-[10px] text-destructive">{s.detalle}</p>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Herramientas disponibles
              </p>
              <ul className="mt-2 space-y-2">
                {POLICE_TOOLS.map((tool) => (
                  <li
                    key={tool.id}
                    className="border border-border px-2 py-1.5 text-[11px] text-foreground"
                  >
                    <span className="font-medium tracking-wide">{tool.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {tool.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyNative || policeLoaded}
                onClick={loadPoliceModel}
                className="text-[10px] tracking-widest"
              >
                {policeInCache && !policeLoaded ? "Cargar 3B" : "Descargar y cargar 3B"}
              </Button>
              {policeGenerating ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => nativeStore.interrupt()}
                  className="text-[10px] tracking-widest"
                >
                  Interrumpir generación
                </Button>
              ) : null}
              {policeLoaded ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void nativeStore.unload()}
                  className="text-[10px] tracking-widest"
                >
                  Liberar
                </Button>
              ) : null}
              <Link
                to={MODE_POLICE_ENGINE.openPath}
                className="inline-flex items-center border border-primary px-3 py-1.5 text-[10px] font-bold tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Abrir análisis
              </Link>
            </div>
          </article>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mt-6 border border-border bg-card p-4">
            <h2 className="text-xs font-bold tracking-[0.2em] text-primary">COMPONENTES DE POLICE MODE</h2>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Horizon, MrBERT Legal, Grooming experimental y PaxmodGuard todavía no están activos en esta publicación.
              Se mostrarán como pendientes hasta que exista un servicio Police Engine público y verificado.
            </p>
            <PoliceModelManager />
          </div>

        </div>
      </section>
    </KernelShell>
  );
}
