/**
 * Traduce PoliceAnalysisResult → elementos de expediente.
 * No eleva puntuaciones a veredictos jurídicos ni de identidad.
 */
import type { PoliceAnalysisResult } from "@/lib/police/types";
import {
  addItem,
  addSource,
  recordDetectorRun,
  type Expediente,
} from "@/lib/police/expediente";

export function mapDetectorResultToExpediente(
  exp: Expediente,
  result: PoliceAnalysisResult,
  opts?: { inputSourceId?: string; inputSourceIds?: string[] },
): Expediente {
  const scores: Record<string, number> = { ...(result.raw_scores ?? {}) };
  for (const s of result.labels ?? []) {
    if (typeof s.score === "number") scores[s.label] = s.score;
  }

  let next = recordDetectorRun(exp, {
    detectorId: result.model_id,
    modelVersion: result.model_version,
    state: String(result.state),
    topLabel: result.top_label,
    scores,
    limitations: [...(result.limitations ?? [])],
    latencyMs: result.latency_ms,
    error: result.error,
    ranAt: new Date().toISOString(),
    ...(result.metadata ? { metadata: result.metadata } : {}),
  });

  const { expediente: withSrc, sourceId } = addSource(next, {
    kind: "detector",
    label: `Detector ${result.model_id}`,
    ref: result.model_id,
    excerpt: result.top_label
      ? `top_label=${result.top_label} (score, no veredicto)`
      : `state=${result.state}`,
  });
  next = withSrc;

  const sourceIds = [...new Set([...(opts?.inputSourceIds ?? []), ...(opts?.inputSourceId ? [opts.inputSourceId] : []), sourceId])];

  const detectorMeta = {
    id: result.model_id,
    modelVersion: result.model_version,
    state: String(result.state),
    topLabel: result.top_label,
    scores,
    limitations: [...(result.limitations ?? [])],
    latencyMs: result.latency_ms,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };

  if (result.state === "license_blocked") {
    return addItem(next, {
      class: "desconocido",
      text: `Detector ${result.model_id} bloqueado por licencia. No se ejecutó inferencia.`,
      sourceIds,
      detector: detectorMeta,
    });
  }

  if (result.state !== "ok") {
    return addItem(next, {
      class: "desconocido",
      text:
        result.error ||
        `Detector ${result.model_id} no produjo análisis válido (state=${result.state}).`,
      sourceIds,
      detector: detectorMeta,
    });
  }

  // Resultado OK: el score es un indicio estadístico, no un hecho probado.
  const scoreSummary = Object.entries(scores)
    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(4) : v}`)
    .join(", ");

  next = addItem(next, {
    class: "indicio",
    text: [
      `Salida del detector ${result.model_id} (${result.model_version}).`,
      result.top_label
        ? `Etiqueta de mayor score: «${result.top_label}» (no es veredicto).`
        : "Sin etiqueta dominante.",
      scoreSummary ? `Scores: ${scoreSummary}.` : "",
      "No confirma identidad de personas ni responsabilidad penal.",
    ]
      .filter(Boolean)
      .join(" "),
    sourceIds,
    detector: detectorMeta,
  });

  // Fragmentos aportados por el detector = indicios textuales, no hechos.
  for (const frag of result.relevant_fragments ?? []) {
    const text =
      typeof frag["text"] === "string"
        ? frag["text"]
        : typeof frag["note"] === "string"
          ? String(frag["note"])
          : null;
    if (!text) continue;
    next = addItem(next, {
      class: "indicio",
      text: `Fragmento señalado por ${result.model_id}: ${text.slice(0, 800)}`,
      sourceIds,
      detector: detectorMeta,
    });
  }

  for (const lim of result.limitations ?? []) {
    next = addItem(next, {
      class: "desconocido",
      text: `Limitación declarada por ${result.model_id}: ${lim}`,
      sourceIds,
      detector: detectorMeta,
    });
  }

  return next;
}
