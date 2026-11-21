import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWebGPUStatus, webgpuEngine } from "@/lib/ai/hardware/WebGPUEngine";
import {
  DEFAULT_QWEN_MODEL_ID,
  formatBytes,
  loadQwenBrowserModel,
  QWEN_MODELS,
  useQwenBrowserStatus,
  type QwenModelId,
} from "@/lib/qwen-browser-engine";

export function GeneralModelManager() {
  const status = useQwenBrowserStatus();
  const gpu = useWebGPUStatus();
  const [selected, setSelected] = useState<QwenModelId>(DEFAULT_QWEN_MODEL_ID);
  const busy = status.phase === "downloading" || status.phase === "loading" || status.phase === "generating";
  const ready = status.phase === "ready" || status.phase === "generating";
  const activeId = status.modelId;
  const progress = Math.round(status.progress * 100);

  const start = async (modelId: QwenModelId) => {
    setSelected(modelId);
    try {
      await loadQwenBrowserModel(modelId);
    } catch {
      // El detalle se presenta debajo de los botones.
    }
  };

  const modelCards = [QWEN_MODELS[DEFAULT_QWEN_MODEL_ID], QWEN_MODELS["qwen35-4b-deep"]] as const;

  return (
    <section className="space-y-3 border border-border bg-card/50 p-3" aria-label="Gestor de modelos Chat General">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">CHAT GENERAL · SELECCIÓN DE VELOCIDAD</p>
        <p className="mt-1 text-xs text-foreground">WebGPU se inicializa automáticamente al entrar en KERNEL. Al abrir Chat General se restaura Qwen desde la caché o se inicia su primera descarga. Solo se mantiene un modelo en RAM/VRAM cada vez.</p>
        <p className={`mt-2 text-[10px] uppercase tracking-widest ${gpu.disponible ? "text-primary" : "text-amber-500"}`} role="status">
          {gpu.disponible ? `DISPOSITIVO WEBGPU INICIALIZADO · ${gpu.adaptador ?? "GPU"}` : `WEBGPU NO INICIALIZADO · ${gpu.motivo ?? "comprobando"}`}
        </p>
        {!gpu.disponible && gpu.motivo !== "pendiente de inicialización" && (
          <Button type="button" variant="outline" size="sm" className="mt-2 text-[9px] tracking-widest"
            onClick={() => void webgpuEngine.init()}>
            REINTENTAR WEBGPU
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {modelCards.map((model) => {
          const isActive = activeId === model.id && ready;
          const isSelected = selected === model.id;
          const isFast = model.id === DEFAULT_QWEN_MODEL_ID;
          return (
            <div key={model.id} className={`space-y-2 border p-3 ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold tracking-widest text-primary">{model.variant}</span>
                {isActive && <span className="text-[9px] text-primary">ACTIVO</span>}
              </div>
              <h4 className="text-xs font-semibold text-foreground">{model.label}</h4>
              <p className="text-[10px] text-muted-foreground">Q4_K_M · {model.sizeLabel} · inferencia local</p>
              <p className="min-h-8 text-[10px] leading-relaxed text-muted-foreground">
                {isFast
                  ? "Perfil recomendado para respuestas breves. Watchdogs por fase: prefill hasta 90 s, idle 45 s, total de seguridad 5 min (WebGPU recomendado)."
                  : "Perfil de mayor capacidad y más lento. Úsalo cuando prefieras más margen de respuesta frente a velocidad."}
              </p>
              <Button type="button" onClick={() => void start(model.id)} disabled={busy || isActive}
                variant={isFast ? "default" : "outline"} className="w-full text-[9px] tracking-widest">
                {busy && isSelected
                  ? (status.phase === "downloading" ? `DESCARGANDO ${progress}%` : "INICIANDO…")
                  : isActive ? "MODELO ACTIVADO"
                  : isFast ? `ACTIVAR RÁPIDO · ${model.sizeLabel}` : `ACTIVAR PROFUNDO · ${model.sizeLabel}`}
              </Button>
              <a href={model.url.replace("/resolve/", "/blob/")} target="_blank" rel="noreferrer"
                className="block text-[9px] text-primary underline underline-offset-2">Ver modelo en Hugging Face</a>
            </div>
          );
        })}
      </div>

      {busy && (
        <div className="space-y-1" aria-live="polite">
          <div className="flex justify-between gap-3 text-[10px] text-muted-foreground">
            <span>{status.detail}</span><span className="shrink-0">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-border bg-background">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(1, progress)}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{formatBytes(status.loadedBytes)} / {formatBytes(status.totalBytes)} · la primera descarga solo se hace una vez por navegador.</p>
        </div>
      )}

      {ready && (
        <div role="status" className="space-y-1 text-[10px] text-primary">
          <p>{status.detail} · Backend: {status.backend ?? "sin identificar"}.</p>
          {status.lastResponseMs !== null && (
            <p>Última respuesta: {(status.lastResponseMs / 1000).toFixed(1)} s · primer texto: {status.firstTokenMs === null ? "—" : `${(status.firstTokenMs / 1000).toFixed(1)} s`} · velocidad estimada: {status.tokensPerSecond ?? "—"} tokens/s.</p>
          )}
          {status.backend?.includes("CPU") && <p className="text-amber-500">La aceleración GPU no está activa; la generación puede necesitar más tiempo. Los watchdogs están diferenciados por fase (prefill / idle / total de seguridad).</p>}
        </div>
      )}

      {status.phase === "idle" && (
        <p className="text-[10px] text-muted-foreground">El perfil rápido se activa automáticamente al entrar en Chat General. La primera vez descarga 1,27 GB desde Hugging Face. El 4B queda como opción de mayor calidad. Los mensajes se procesan dentro del navegador.</p>
      )}
      {status.phase === "error" && (
        <div role="alert" className="space-y-1 text-[10px] text-destructive">
          <p className="font-semibold">No se pudo activar el modelo.</p><p>{status.error}</p>
          <p className="text-muted-foreground">Comprueba espacio libre y compatibilidad WebGPU; después vuelve a intentarlo. El runtime reutiliza los pesos guardados cuando es posible.</p>
        </div>
      )}
      <div className="border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
        El perfil rápido usa watchdogs diferenciados (prefill 90 s / idle 45 s / total de seguridad 5 min). WebGPU puede reducir la latencia, pero no garantiza una velocidad concreta. KERNEL prueba varios repartos de capas para ajustar el modelo a la memoria de la GPU. El perfil RÁPIDO exige WebGPU y no continúa por CPU; el perfil PROFUNDO puede usar CPU como compatibilidad. La primera descarga y la inicialización no están incluidas en los límites de generación. Reserva 3 GB libres para el perfil rápido o 4 GB para el profundo.
      </div>
      <p className="text-[9px] leading-relaxed text-muted-foreground">Ambos son ajustes comunitarios de Qwen inspirados en ejemplos de razonamiento atribuidos a Claude; no son modelos oficiales de Anthropic. Consulta sus fichas y licencias antes de redistribuirlos.</p>
    </section>
  );
}
