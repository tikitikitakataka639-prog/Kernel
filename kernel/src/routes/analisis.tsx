import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, FileDown, ImagePlus, RotateCcw, ScanSearch, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { KernelMessages, messageText } from "@/components/kernel/KernelMessages";
import { KernelShell } from "@/components/kernel/KernelShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { CATEGORIES, PLATFORMS, REVIEW_STATUSES, generateSocialReport, readSocialAlerts, validateAnalysisInput, type CategoryId, type PlatformId, type ReviewStatus } from "@/lib/social-analysis";
import { usePoliceGrooming } from "@/lib/police/use-police-grooming";
import { isPoliceEngineConfigured } from "@/lib/police/client";
import { KEngineNativeChatTransport } from "@/lib/kengine-native/transport";
import { nativeEngine } from "@/lib/kengine-native/engine";
import { useNativeEngine } from "@/lib/kengine-native/use-native-engine";
import { NATIVE_POLICE_MODEL_ID } from "@/lib/police/native-brief";
import { PoliceModelManager } from "@/components/kernel/PoliceModelManager";
import { PoliceExpedientePanel } from "@/components/kernel/PoliceExpedientePanel";

export const Route = createFileRoute("/analisis")({
  head: () => ({
    meta: [
      { title: "Análisis de redes sociales — K.E.R.N.E.L." },
      {
        name: "description",
        content:
          "Análisis pasivo de contenido de redes sociales: textos, URLs públicas, capturas y transcripciones con evidencias y revisión humana.",
      },
      { property: "og:title", content: "Análisis de redes sociales — K.E.R.N.E.L." },
      {
        property: "og:description",
        content:
          "Análisis indiciario de redes sociales con evidencias y normativa real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisPage,
});

const PIPELINE = [
  "contenido aportado",
  "K.E.R.N.E.L",
  "Llama 3B local",
  "hechos e indicios",
  "hipótesis alternativas",
  "límites y confianza",
  "expediente",
  "revisión humana",
];

type Shot = { name: string; mediaType: string; url: string; size: number };

// Las capturas solo se previsualizan en este formulario: no se envían al modelo
// de texto ni a una Function. Se mantiene un límite para evitar consumo excesivo
// de memoria en el navegador.
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_TOTAL_IMAGE_BYTES = 2_500_000;
const MAX_ANALYSIS_TEXT_CHARS = 50_000;

function AnalysisPage() {
  const [platform, setPlatform] = useState<PlatformId>("threads");
  const [categories, setCategories] = useState<CategoryId[]>(CATEGORIES.map((c) => c.id));
  const [transcript, setTranscript] = useState("");
  const [inputError, setInputError] = useState("");
  const [analysis, setAnalysis] = useState<{ platform: PlatformId; url: string; date: string; categories: CategoryId[] } | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewStatus>>({});
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    result: groomingResult,
    error: groomingError,
    busy: groomingBusy,
    online: groomingOnline,
    phase: groomingPhase,
    backendNote: groomingBackendNote,
    modelVersion: groomingModelVersion,
    runGrooming,
    reset: resetGrooming,
    unload: unloadGrooming,
    detectorId: groomingDetectorId,
  } = usePoliceGrooming();

  const policeEngineConfigured = isPoliceEngineConfigured();
  const policeNativeStatus = useNativeEngine();
  const analysisTransport = useMemo(() => new KEngineNativeChatTransport("analysis"), []);
  const policeModelReady = policeNativeStatus.status.fase === "listo"
    && policeNativeStatus.status.modelo === NATIVE_POLICE_MODEL_ID
    && nativeEngine.modelId === NATIVE_POLICE_MODEL_ID;
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    transport: analysisTransport,
    onError: (error) => toast.error(error.message || "Llama 3.2 3B no ha podido completar el análisis local."),
  });

  const busy = status === "submitted" || status === "streaming";
  const selectedPlatform = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[2];
  const alerts = useMemo(() => readSocialAlerts(messages).filter((a) => !analysis || analysis.categories.includes(a.categoria)), [messages, analysis]);
  const accessErrors = messages.flatMap((m) => m.parts.flatMap((part) => {
    const p = part as { type: string; state?: string; output?: { ok?: boolean; motivo?: string } };
    return ["tool-leer_threads", "tool-kernel_leer_pagina"].includes(p.type) && p.state === "output-available" && p.output?.ok === false ? [p.output.motivo ?? "No se pudo acceder al contenido público."] : [];
  }));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const lastReport = useMemo(() => {
    const assistants = messages.filter((m) => m.role === "assistant");
    const last = assistants[assistants.length - 1];
    return last ? messageText(last) : "";
  }, [messages]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: Shot[] = [];
    let totalBytes = shots.reduce((sum, shot) => sum + shot.size, 0);
    for (const file of Array.from(files).slice(0, 8)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: supera 1,5 MB. Reduce el tamaño antes de adjuntarla.`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
        toast.error("El conjunto de imágenes supera 2,5 MB. Quita alguna o reduce su tamaño.");
        break;
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, mediaType: file.type, url, size: file.size });
      totalBytes += file.size;
    }
    setShots((prev) => [...prev, ...next].slice(0, 12));
  }

  function startAnalysis() {
    setInputError("");
    if (!policeModelReady) {
      setInputError("Llama 3.2 3B no está cargado. Abre AJUSTES → POLICE MODE, pulsa «Descargar y cargar 3B» y vuelve cuando indique que está en memoria.");
      toast.error("Activa primero Llama 3.2 3B en Ajustes → POLICE MODE.");
      return;
    }
    if (pasted.length + transcript.length > MAX_ANALYSIS_TEXT_CHARS) {
      setInputError("El texto pegado y la transcripción no pueden superar 50.000 caracteres en total.");
      return;
    }
    let target = "";
    try {
      target = validateAnalysisInput({ url, platform, text: pasted, transcript, images: shots.length, categories });
    } catch (e) {
      setInputError(e instanceof Error ? e.message : "Entrada no válida");
      return;
    }
    const date = new Date().toISOString();
    setAnalysis({ platform, url: target, date, categories: [...categories] });
    setMessages([]);
    setReviews({});
    const body = [
      `Plataforma: ${selectedPlatform.label}`,
      target ? `URL de referencia (no consultada por este análisis local): ${target}` : "Sin URL de origen",
      pasted.trim() ? `\nContenido aportado por el usuario (comentarios/bio):\n${pasted.trim()}` : "",
      transcript.trim() ? `\nTranscripción aportada:\n${transcript.trim()}` : "",
      categories.length ? `\nCategorías solicitadas: ${categories.join(", ")}` : "",
      shots.length ? `\nAviso: se han seleccionado ${shots.length} captura(s), pero Llama 3.2 3B no dispone de entrada visual en esta integración y NO se han interpretado. No extraigas conclusiones visuales de ellas.` : "",
    ].filter(Boolean).join("\n");
    void sendMessage({
      role: "user",
      // Las capturas siguen visibles en el formulario, pero no se envían al
      // modelo de texto porque Llama 3.2 3B no tiene proyector visual aquí.
      parts: [{ type: "text", text: body }],
    });
  }

  function exportReport() {
    if (!lastReport) return;
    const blob = new Blob([lastReport], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kernel-analisis-${Date.now()}.txt`;
    a.click();
  }

  function draftComplaint() {
    if (!lastReport) return;
    void sendMessage({
      role: "user",
      parts: [
        {
          type: "text",
          text: `Prepara un borrador de denuncia para ${PLATFORMS.find((p) => p.id === analysis?.platform)?.label ?? selectedPlatform.label}, origen ${analysis?.url || "contenido aportado sin URL"}, basado en el análisis anterior. No envíes nada. Estados de revisión humana (no veredictos jurídicos): ${JSON.stringify(reviews)}.`,
        },
      ],
    });
  }

  return (
    <KernelShell title="ANÁLISIS DE REDES SOCIALES" subtitle="POLICE MODE · ANÁLISIS PASIVO">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col gap-6 p-4 md:p-6">
        <header className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-primary md:text-xl">Análisis de redes sociales</h1>
          <p className="text-xs text-muted-foreground">
            Análisis pasivo e indiciario con Llama 3.2 3B ejecutado en este navegador. No consulta URLs, Internet ni BOE. La suite de detectores (Horizon, MrBERT Legal, PaxmodGuard y Grooming) requiere un servicio Police Engine público independiente; no se simula cuando falta.
          </p>
          <ol className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {PIPELINE.map((step) => (
              <li key={step} className="rounded border border-border px-2 py-0.5">{step}</li>
            ))}
          </ol>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="space-y-4 border border-border p-4" aria-label="Entrada de análisis">
            <h2 className="text-xs uppercase tracking-widest text-primary">Entrada</h2>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Plataforma</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformId)}
                className="w-full border border-border bg-background p-2 text-xs"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">URL pública (opcional)</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="text-xs" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Texto / comentarios / bio</label>
              <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} className="text-xs" placeholder="Pega aquí el contenido textual…" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Transcripción (opcional)</label>
              <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} className="text-xs" placeholder="Transcripción de audio/vídeo…" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Capturas (máx. 12)</label>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPickFiles(e.target.files)} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="mr-1 h-3.5 w-3.5" /> Añadir capturas
                </Button>
                {shots.map((shot, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden border border-border">
                    <img src={shot.url} alt={shot.name} className="h-full w-full object-cover" />
                    <button type="button" className="absolute right-0 top-0 bg-background/80 p-0.5" onClick={() => setShots((s) => s.filter((_, j) => j !== i))} aria-label="Quitar">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground">Categorías</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = categories.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`border px-2 py-1 text-[10px] ${on ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                      onClick={() => setCategories((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {inputError ? <p className="text-[11px] text-destructive" role="alert">{inputError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={startAnalysis}>
                <ScanSearch className="mr-1 h-3.5 w-3.5" /> {busy ? "Analizando…" : "Iniciar análisis social"}
              </Button>
              {busy ? (
                <Button type="button" variant="secondary" onClick={() => stop()}>
                  <Square className="mr-1 h-3.5 w-3.5" /> Detener
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={!lastReport} onClick={exportReport}>
                <FileDown className="mr-1 h-3.5 w-3.5" /> Exportar informe
              </Button>
              <Button type="button" variant="secondary" disabled={!lastReport || busy} onClick={draftComplaint}>
                Borrador denuncia
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setMessages([]); setAnalysis(null); setReviews({}); }}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reiniciar
              </Button>
            </div>
            {analysis && (
              <div className="space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <p>{PLATFORMS.find((p) => p.id === analysis.platform)?.label}</p>
                <p>{new Date(analysis.date).toLocaleString("es-ES")}</p>
                {analysis.url ? <a href={analysis.url} target="_blank" rel="noopener noreferrer" className="block break-all text-primary">{analysis.url}</a> : <p>Sin URL de origen</p>}
              </div>
            )}
          </section>

          <section className="space-y-4 border border-border p-4" aria-label="Resultados y evidencias">
            <h2 className="text-xs uppercase tracking-widest text-primary">Resultados y evidencias</h2>
            <p role="status" className="text-xs text-muted-foreground">
              {busy ? "Analizando…" : error ? "Error de conexión con el motor" : analysis && lastReport ? "Análisis recibido · revisión pendiente" : "Sin análisis en curso"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Police Mode utiliza Llama 3.2 3B en el navegador. Los detectores especializados requieren el servicio Police Engine cuando esté desplegado.
            </p>
            {accessErrors.length > 0 ? (
              <ul className="space-y-1 text-[11px] text-destructive">
                {accessErrors.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            ) : null}
            <KernelMessages messages={messages} thinking={busy} />
            <div ref={bottomRef} />
            {alerts.length === 0 && analysis && !busy ? (
              <p className="text-[11px] text-muted-foreground">Sin alertas registradas. Esto no certifica la ausencia de riesgo.</p>
            ) : null}
            {alerts.map((a) => (
              <article key={a.id} className="space-y-2 border border-border p-3 text-xs">
                <h3 className="font-bold text-primary">{CATEGORIES.find((c) => c.id === a.categoria)?.label}</h3>
                <p className="text-muted-foreground">
                  {a.naturaleza === "posible_ilegalidad"
                    ? "Posible ilegalidad"
                    : a.naturaleza === "posible_infraccion_plataforma"
                      ? "Posible infracción de plataforma"
                      : "Ofensivo o controvertido"}
                </p>
                <blockquote className="break-words border-l border-primary pl-2">{a.evidencia}</blockquote>
                <p className="break-words text-muted-foreground">{a.origen} · {a.referencia}</p>
                <p>Confianza estimada: {a.confianza}%</p>
                <p className="break-words">{a.motivo}</p>
                <label className="block text-muted-foreground">
                  Revisión humana
                  <select
                    aria-label={`Estado de revisión: ${a.referencia}`}
                    value={reviews[a.id] ?? "Pendiente de revisión"}
                    onChange={(e) => setReviews((prev) => ({ ...prev, [a.id]: e.target.value as ReviewStatus }))}
                    className="mt-1 w-full border border-border bg-background p-2 text-xs"
                  >
                    {REVIEW_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </article>
            ))}

            <PoliceExpedientePanel text={pasted} transcript={transcript} url={url} />
            <PoliceModelManager />
            <section className="space-y-2 border-t border-border pt-3" aria-label="Detector de grooming análisis local">
              <h3 className="text-[10px] uppercase tracking-widest text-primary">
                Detector de grooming — análisis local
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Módulo policial independiente conectado a la instancia configurada de Police Engine. No forma parte del chat general. Experimental (TF-IDF + LR + señales heurísticas G01-G09); no equivale a XLM-R validado ni constituye prueba.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={groomingBusy || !policeEngineConfigured}
                  onClick={() => void runGrooming(pasted, transcript)}
                >
                  {groomingBusy ? "ANALIZANDO…" : policeEngineConfigured ? "ANALIZAR CONVERSACIÓN" : "DETECTOR PENDIENTE DE SERVICIO"}
                </Button>
                <Button type="button" variant="secondary" disabled={groomingBusy} onClick={() => resetGrooming()}>
                  LIMPIAR
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={groomingBusy || !policeEngineConfigured}
                  onClick={() => void unloadGrooming()}
                >
                  DESCARGAR MODELO
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Estado: {policeEngineConfigured ? (groomingOnline ? "motor online" : "motor offline") : "servicio no configurado"} · fase={groomingPhase} · {groomingDetectorId} · {groomingModelVersion || "—"}
              </p>
              {groomingBackendNote ? <p className="text-[10px] text-muted-foreground">{groomingBackendNote}</p> : null}
              {groomingError ? <p className="text-[11px] text-destructive" role="alert">{groomingError}</p> : null}
              {groomingResult ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-background p-2 text-[10px]">
                  {JSON.stringify(groomingResult, null, 2)}
                </pre>
              ) : null}
            </section>
          </section>
        </div>
      </div>
      <Toaster />
    </KernelShell>
  );
}
