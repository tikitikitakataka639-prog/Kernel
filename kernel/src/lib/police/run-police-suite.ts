/**
 * Ejecuta detectores del Police Engine en secuencia (un modelo en memoria).
 * Incluye PaxmodGuard. No toca WebLLM ni /api/chat.
 */
import {
  policeAnalyze,
  policeHealth,
  policeLoad,
  policeUnload,
  PoliceEngineUnavailableError,
} from "@/lib/police/client";
import type { PoliceAnalysisResult, PoliceDetectorId } from "@/lib/police/types";
import {
  addContradiction,
  addItem,
  addSource,
  addTimelineEvent,
  createExpediente,
  recordDetectorRun,
  type Expediente,
} from "@/lib/police/expediente";
import { mapDetectorResultToExpediente } from "@/lib/police/map-detector-result";
import { extractTemporalReferences } from "@/lib/police/timeline";
import { detectPolarityContradictions, type ContradictionStatement } from "@/lib/police/contradictions";

export type PoliceSuiteInput = {
  text: string;
  transcript?: string;
  query?: string;
  title?: string;
  url?: string;
  detectors?: Array<Exclude<PoliceDetectorId, never>>;
};

export type PoliceSuiteProgress = {
  detector: string;
  phase: "loading" | "analyzing" | "unloading" | "done" | "error";
  message?: string;
};

export type PoliceSuiteResult = {
  ok: boolean;
  online: boolean;
  expediente: Expediente;
  results: Partial<Record<string, PoliceAnalysisResult>>;
  errors: Partial<Record<string, string>>;
};

const DEFAULT_DETECTORS: PoliceDetectorId[] = [
  "horizon",
  "paxmod-guard",
  "grooming-xlm-roberta-es-en",
];

function errorMessage(error: unknown): string {
  if (error instanceof PoliceEngineUnavailableError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export async function runPoliceSuite(
  input: PoliceSuiteInput,
  onProgress?: (p: PoliceSuiteProgress) => void,
): Promise<PoliceSuiteResult> {
  const text = [input.text, input.transcript ?? ""].map((value) => value.trim()).filter(Boolean).join("\n\n");
  let exp = createExpediente({ title: input.title ?? "Expediente MODE POLICE" });
  const results: PoliceSuiteResult["results"] = {};
  const errors: PoliceSuiteResult["errors"] = {};

  if (!text) {
    return { ok: false, online: false, expediente: exp, results, errors: { suite: "Sin texto para analizar." } };
  }

  const inputSourceIds: string[] = [];
  const declarationStatements: ContradictionStatement[] = [];
  exp = { ...exp, notes: [...exp.notes,
    "Las referencias temporales absolutas y relativas se conservan literalmente; las relativas no se convierten a fechas sin una referencia temporal fiable.",
    "Las posibles contradicciones automáticas se basan únicamente en frases casi idénticas con polaridad explícitamente opuesta; requieren revisión humana y no demuestran falsedad."
  ] };
  if (input.text.trim()) {
    const source = addSource(exp, {
      kind: "user_text",
      label: "Texto aportado por el usuario",
      excerpt: input.text.trim().slice(0, 400),
    });
    exp = source.expediente;
    inputSourceIds.push(source.sourceId);
    declarationStatements.push({ text: input.text, sourceId: source.sourceId });
    for (const reference of extractTemporalReferences(input.text)) {
      exp = addTimelineEvent(exp, {
        at: reference.value,
        description: (reference.kind === "relative" ? "Referencia temporal relativa literal" : "Fecha literal detectada") + " (pendiente de revisión): " + reference.excerpt,
        sourceIds: [source.sourceId],
      });
    }
  }
  if (input.transcript?.trim()) {
    const source = addSource(exp, {
      kind: "user_transcript",
      label: "Transcripción aportada por el usuario",
      excerpt: input.transcript.trim().slice(0, 400),
    });
    exp = source.expediente;
    inputSourceIds.push(source.sourceId);
    declarationStatements.push({ text: input.transcript, sourceId: source.sourceId });
    for (const reference of extractTemporalReferences(input.transcript)) {
      exp = addTimelineEvent(exp, {
        at: reference.value,
        description: (reference.kind === "relative" ? "Referencia temporal relativa literal" : "Fecha literal detectada") + " en transcripción (pendiente de revisión): " + reference.excerpt,
        sourceIds: [source.sourceId],
      });
    }
  }
  if (input.url?.trim()) {
    const source = addSource(exp, {
      kind: "user_url",
      label: "URL aportada",
      ref: input.url.trim(),
    });
    exp = source.expediente;
    inputSourceIds.push(source.sourceId);
  }

  const contradictionCandidates = detectPolarityContradictions(declarationStatements);
  contradictionCandidates.forEach((candidate, index) => {
    const candidateId = "auto-cx-" + Date.now() + "-" + index;
    const positiveId = candidateId + "-positive";
    const negativeId = candidateId + "-negative";
    const sourceIds = [...new Set([candidate.positive.sourceId, candidate.negative.sourceId])];
    exp = addItem(exp, {
      id: positiveId,
      class: "desconocido",
      text: "Declaración literal pendiente de verificación: " + candidate.positive.text,
      sourceIds: [candidate.positive.sourceId],
    });
    exp = addItem(exp, {
      id: negativeId,
      class: "desconocido",
      text: "Declaración literal pendiente de verificación: " + candidate.negative.text,
      sourceIds: [candidate.negative.sourceId],
    });
    exp = addContradiction(exp, {
      id: candidateId,
      description: "POSIBLE CONTRADICCIÓN AUTOMÁTICA (revisión humana obligatoria): las dos declaraciones comparten el mismo contenido normalizado, pero tienen polaridad opuesta. No demuestra que ninguna sea falsa.",
      itemIds: [positiveId, negativeId],
      sourceIds,
    });
  });
  if (contradictionCandidates.length) {
    exp = { ...exp, notes: [...exp.notes, "Se detectaron " + contradictionCandidates.length + " posibles contradicciones literales. La heurística solo detecta negación explícita sobre frases prácticamente idénticas; no detecta contradicciones semánticas generales."] };
  }

  if (!(await policeHealth())) {
    exp = {
      ...exp,
      notes: [...exp.notes, "DETECTORES NO EJECUTADOS: no hay un servicio público Police Engine configurado. Este archivo contiene únicamente el material aportado, referencias temporales literales y heurísticas de contradicción descritas; Horizon, MrBERT Legal, Grooming y PaxmodGuard no han generado puntuaciones ni resultados."],
      updatedAt: new Date().toISOString(),
    };
    return { ok: false, online: false, expediente: exp, results, errors };
  }

  const requested = input.detectors?.length ? input.detectors : DEFAULT_DETECTORS;
  const detectors = [...new Set(requested)];

  for (const detector of detectors) {
    let modelVersion = "unknown";
    let analysisRecorded = false;
    onProgress?.({ detector, phase: "loading" });

    try {
      const loaded = await policeLoad(detector, true);
      modelVersion = loaded.version || "unknown";
      if (!loaded.loaded) {
        throw new Error(loaded.error || detector + " no quedó cargado.");
      }

      onProgress?.({ detector, phase: "analyzing" });
      const analysis = detector === "mrbert-legal"
        ? await policeAnalyze({ detector, text, ...(input.query?.trim() ? { query: input.query.trim() } : {}) })
        : await policeAnalyze({ detector, text });

      results[detector] = analysis;
      exp = mapDetectorResultToExpediente(exp, analysis, { inputSourceIds });
      analysisRecorded = true;

      if (analysis.state !== "ok") {
        errors[detector] = analysis.error || "state=" + analysis.state;
        onProgress?.({ detector, phase: "error", message: errors[detector] });
      } else {
        onProgress?.({ detector, phase: "done" });
      }
    } catch (error) {
      const message = errorMessage(error);
      errors[detector] = message;
      if (!analysisRecorded) {
        exp = recordDetectorRun(exp, {
          detectorId: detector,
          modelVersion,
          state: "error",
          topLabel: null,
          scores: {},
          limitations: ["No se obtuvo un resultado de análisis válido."],
          latencyMs: null,
          error: message,
          ranAt: new Date().toISOString(),
        });
      }
      onProgress?.({ detector, phase: "error", message });
    } finally {
      onProgress?.({ detector, phase: "unloading" });
      try {
        await policeUnload(detector);
      } catch (error) {
        const message = "No se pudo confirmar la descarga: " + errorMessage(error);
        errors[detector + ":unload"] = message;
        exp = {
          ...exp,
          notes: [...exp.notes, detector + ": " + message],
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  const hasSuccessfulAnalysis = Object.values(results).some((result) => result?.state === "ok");
  return { ok: hasSuccessfulAnalysis, online: true, expediente: exp, results, errors };
}
