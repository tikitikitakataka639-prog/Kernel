import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Expediente } from "@/lib/police/expediente";
import { summarizeExpediente } from "@/lib/police/expediente";
import { downloadExpediente, type ExpedienteExportFormat } from "@/lib/police/export-expediente";
import { runPoliceSuite, type PoliceSuiteProgress } from "@/lib/police/run-police-suite";
import { buildNativeBriefMessages, NATIVE_POLICE_MODEL_ID } from "@/lib/police/native-brief";
import { NativeEngineError, nativeEngine } from "@/lib/kengine-native/engine";
import { nativeStore } from "@/lib/kengine-native/store";
import { useNativeEngine } from "@/lib/kengine-native/use-native-engine";
import { isPoliceEngineConfigured } from "@/lib/police/client";

type Props = { text: string; transcript?: string; url?: string; includeMrBert?: boolean };

export function PoliceExpedientePanel({ text, transcript = "", url, includeMrBert = false }: Props) {
  const [exp, setExp] = useState<Expediente | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState("");
  const [summary, setSummary] = useState("");
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeReport, setNativeReport] = useState("");
  const [nativeError, setNativeError] = useState("");
  const [mrbertEnabled, setMrbertEnabled] = useState(includeMrBert);
  const { status: nativeStatus } = useNativeEngine();
  const policeEngineConfigured = isPoliceEngineConfigured();

  const nativeReady = nativeStatus.fase === "listo"
    && nativeStatus.modelo === NATIVE_POLICE_MODEL_ID
    && nativeEngine.modelId === NATIVE_POLICE_MODEL_ID
    && !nativeStatus.generando;

  const run = useCallback(async () => {
    setBusy(true);
    setErrors("");
    setProgress("Iniciando suite policial…");
    setExp(null);
    setSummary("");
    setNativeReport("");
    setNativeError("");
    try {
      const detectors = mrbertEnabled
        ? (["horizon", "paxmod-guard", "grooming-xlm-roberta-es-en", "mrbert-legal"] as const)
        : (["horizon", "paxmod-guard", "grooming-xlm-roberta-es-en"] as const);
      const result = await runPoliceSuite(
        { text, transcript, ...(url ? { url } : {}), title: "Expediente POLICE MODE", detectors: [...detectors] },
        (p: PoliceSuiteProgress) => setProgress(p.detector + ": " + p.phase + (p.message ? " · " + p.message : "")),
      );
      setExp(result.expediente);
      setSummary(summarizeExpediente(result.expediente));
      const messages = Object.entries(result.errors).map(([key, value]) => key + ": " + value);
      // La ausencia de detectores es un estado informativo conocido, no un error
      // de ejecución del expediente local. El expediente guarda la limitación en notes.
      setErrors(result.online && messages.length ? messages.join(" · ") : "");
    } catch (e) {
      setErrors(e instanceof Error ? e.message : "Error en la suite policial.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [text, transcript, url, mrbertEnabled]);

  const interpret = useCallback(async () => {
    if (!exp || !nativeReady || nativeBusy) return;
    setNativeBusy(true);
    setNativeError("");
    setNativeReport("");
    nativeStore.setGenerating(true);
    try {
      const report = await nativeEngine.generate(buildNativeBriefMessages(exp), { maxTokens: 384, temperature: 0.2 });
      setNativeReport(report.trim());
      if (!report.trim()) setNativeError("Llama 3B no ha generado contenido.");
    } catch (e) {
      const err = e instanceof NativeEngineError
        ? e
        : new NativeEngineError("generation-failed", e instanceof Error ? e.message : String(e));
      nativeStore.fail(err.code, err.message);
      setNativeError(err.message);
    } finally {
      nativeStore.setGenerating(false);
      setNativeBusy(false);
    }
  }, [exp, nativeReady, nativeBusy]);

  const exportFile = useCallback((format: ExpedienteExportFormat) => {
    if (!exp) return;
    try {
      downloadExpediente(exp, format);
    } catch (e) {
      setErrors(e instanceof Error ? e.message : "No se pudo exportar el expediente.");
    }
  }, [exp]);

  return (
    <section className="space-y-3 border-t border-border pt-3" aria-label="Expediente POLICE MODE">
      <h3 className="text-[10px] uppercase tracking-widest text-primary">Expediente · análisis y detectores</h3>
      <p className="text-[10px] text-muted-foreground">
        El análisis conversacional y la interpretación del expediente se ejecutan con Llama 3.2 3B en este navegador.
        Horizon, MrBERT Legal, PaxmodGuard y Grooming (experimental) son detectores automáticos independientes:
        {policeEngineConfigured ? " se ejecutan mediante el servicio Police Engine configurado." : " no hay un servicio público Police Engine conectado. Se puede crear un expediente local, pero no se ejecutan detectores ni se generan puntuaciones."} No se generan puntuaciones ficticias.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || !(text.trim() || transcript.trim())} onClick={() => void run()}>
          {busy ? (policeEngineConfigured ? "EJECUTANDO DETECTORES…" : "CREANDO EXPEDIENTE…") : policeEngineConfigured ? "EJECUTAR SUITE POLICIAL" : "CREAR EXPEDIENTE LOCAL"}
        </Button>
        <Button type="button" variant="secondary" disabled={!exp || busy} onClick={() => exportFile("json")}>EXPORTAR JSON</Button>
        <Button type="button" variant="secondary" disabled={!exp || busy} onClick={() => exportFile("md")}>EXPORTAR INFORME MD</Button>
        <label className="flex items-center gap-2 px-2 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={mrbertEnabled} disabled={busy || !policeEngineConfigured} onChange={(event) => setMrbertEnabled(event.target.checked)} />
          Incluir MrBERT Legal (similitud; más pesado)
        </label>
      </div>
      {progress ? <p className="text-[11px] text-muted-foreground" role="status">{progress}</p> : null}
      {errors ? <p className="text-[11px] text-destructive" role="alert">{errors}</p> : null}
      {summary ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-background p-2 text-[10px] text-muted-foreground">{summary}</pre> : null}
      {exp ? (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">
            Fuentes: {exp.sources.length} · Ítems: {exp.items.length} · Cronología: {exp.timeline.length} · Contradicciones: {exp.contradictions.length} · Ejecuciones: {exp.detectorRuns.length}
          </p>
          {exp.items.length ? (
            <ul className="max-h-56 space-y-2 overflow-auto text-[11px]">
              {exp.items.map((item) => (
                <li key={item.id} className="border border-border p-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-primary">{item.class}</span>
                  <p className="mt-1 text-foreground">{item.text}</p>
                  <p className="mt-1 break-all text-[9px] text-muted-foreground">Fuentes: {item.sourceIds.join(", ") || "Sin referencias"}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-[11px] text-muted-foreground">El expediente no contiene ítems de detector.</p>}
          {exp.sources.length > 0 ? (
            <section className="space-y-1 border-t border-border pt-2">
              <h5 className="text-[9px] uppercase tracking-widest text-primary">Fuentes trazables</h5>
              {exp.sources.map((source) => (
                <p key={source.id} className="break-words text-[10px] text-muted-foreground">
                  {source.id} · {source.kind} · {source.label}{source.ref ? " · " + source.ref : ""}
                </p>
              ))}
            </section>
          ) : null}
          <section className="space-y-1 border-t border-border pt-2">
            <h5 className="text-[9px] uppercase tracking-widest text-primary">Cronología</h5>
            {exp.timeline.length ? exp.timeline.map((event) => (
              <p key={event.id} className="text-[10px] text-muted-foreground">
                {event.at ?? "Fecha desconocida"} · {event.description} · fuentes: {event.sourceIds.join(", ") || "—"}
              </p>
            )) : <p className="text-[10px] text-muted-foreground">Sin referencias temporales registradas.</p>}
          </section>
          <section className="space-y-1 border-t border-border pt-2">
            <h5 className="text-[9px] uppercase tracking-widest text-primary">Contradicciones</h5>
            {exp.contradictions.length ? exp.contradictions.map((item) => (
              <p key={item.id} className="text-[10px] text-muted-foreground">{item.description}</p>
            )) : <p className="text-[10px] text-muted-foreground">Ninguna registrada; esto no demuestra que no existan.</p>}
          </section>
          <section className="space-y-1 border-t border-border pt-2">
            <h5 className="text-[9px] uppercase tracking-widest text-primary">Ejecuciones de detectores</h5>
            {exp.detectorRuns.map((run, index) => (
              <p key={run.detectorId + "-" + index} className="text-[10px] text-muted-foreground">
                {run.detectorId} · {run.modelVersion} · {run.state} · {run.latencyMs ?? "—"} ms{run.error ? " · " + run.error : ""}
              </p>
            ))}
          </section>
        </div>
      ) : null}
      <section className="space-y-2 border-t border-border pt-3" aria-label="Interpretación nativa del expediente">
        <h4 className="text-[10px] uppercase tracking-widest text-primary">Interpretación asistida · Llama 3.2 3B</h4>
        <p className="text-[10px] text-muted-foreground">
          Utiliza el modelo WebLLM local ya cargado. No descarga ni cambia de modelo automáticamente.
          La interpretación no añade hechos al expediente ni sustituye los resultados originales.
        </p>
        <p className="text-[10px] text-muted-foreground" role="status">
          Estado: {nativeReady ? "Llama 3B preparado" : "requiere cargar " + NATIVE_POLICE_MODEL_ID + " en Ajustes"}
        </p>
        <Button type="button" variant="secondary" disabled={!exp || !nativeReady || nativeBusy || busy} onClick={() => void interpret()}>
          {nativeBusy ? "INTERPRETANDO EXPEDIENTE…" : "INTERPRETAR CON LLAMA 3B"}
        </Button>
        {nativeError ? <p className="text-[11px] text-destructive" role="alert">{nativeError}</p> : null}
        {nativeReport ? (
          <article className="max-h-96 space-y-1 overflow-auto border border-border bg-background p-3">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Interpretación generada · no es un hecho probado</p>
            <pre className="whitespace-pre-wrap font-sans text-[11px] text-foreground">{nativeReport}</pre>
          </article>
        ) : null}
      </section>
    </section>
  );
}
