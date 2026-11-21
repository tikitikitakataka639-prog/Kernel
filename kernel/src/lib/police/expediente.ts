/**
 * Expediente de investigación MODE POLICE.
 *
 * Estructura compartida entre detectores, UI de /analisis y (futuro) resumen
 * con Llama 3.2 3B nativo. No sustituye /api/chat.
 *
 * Reglas:
 * - No inventar hechos ni completar lagunas.
 * - Scores de detectores → indicios u observaciones, nunca veredicto.
 * - Cada elemento debe poder rastrearse a una fuente.
 */

export type EvidenceClass = "hecho" | "indicio" | "hipotesis" | "desconocido";

export type SourceKind =
  | "user_text"
  | "user_url"
  | "user_transcript"
  | "user_image"
  | "detector"
  | "system";

export type ExpedienteSource = {
  id: string;
  kind: SourceKind;
  label: string;
  /** Referencia corta (URL, detector id, etc.). */
  ref?: string;
  excerpt?: string;
};

export type TimelineEvent = {
  id: string;
  /** ISO o etiqueta temporal aportada por el usuario; null si desconocida. */
  at: string | null;
  description: string;
  sourceIds: string[];
};

export type Contradiction = {
  id: string;
  description: string;
  itemIds: string[];
  sourceIds: string[];
};

export type ExpedienteItem = {
  id: string;
  class: EvidenceClass;
  text: string;
  sourceIds: string[];
  /** Solo metadatos de detector; no son prueba de identidad ni culpabilidad. */
  detector?: {
    id: string;
    modelVersion: string;
    state: string;
    topLabel: string | null;
    scores: Record<string, number>;
    limitations: string[];
    latencyMs: number | null;
    metadata?: Record<string, unknown>;
  };
};

export type DetectorRunRecord = {
  detectorId: string;
  modelVersion: string;
  state: string;
  topLabel: string | null;
  scores: Record<string, number>;
  limitations: string[];
  latencyMs: number | null;
  error: string | null;
  ranAt: string;
  metadata?: Record<string, unknown>;
};

export type Expediente = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  sources: ExpedienteSource[];
  items: ExpedienteItem[];
  timeline: TimelineEvent[];
  contradictions: Contradiction[];
  detectorRuns: DetectorRunRecord[];
  notes: string[];
};

export function createExpediente(partial?: {
  title?: string;
  id?: string;
}): Expediente {
  const now = new Date().toISOString();
  return {
    id: partial?.id ?? `exp-${now}`,
    createdAt: now,
    updatedAt: now,
    title: partial?.title ?? "Expediente de análisis",
    sources: [],
    items: [],
    timeline: [],
    contradictions: [],
    detectorRuns: [],
    notes: [
      "Los scores de detectores no confirman identidad ni culpabilidad.",
      "La información ausente se registra como desconocido, no se inventa.",
    ],
  };
}

export function touchExpediente(exp: Expediente): Expediente {
  return { ...exp, updatedAt: new Date().toISOString() };
}

export function addSource(
  exp: Expediente,
  source: Omit<ExpedienteSource, "id"> & { id?: string },
): { expediente: Expediente; sourceId: string } {
  const id = source.id ?? `src-${exp.sources.length + 1}-${Date.now()}`;
  const next: ExpedienteSource = {
    id,
    kind: source.kind,
    label: source.label,
    ...(source.ref !== undefined ? { ref: source.ref } : {}),
    ...(source.excerpt !== undefined ? { excerpt: source.excerpt.slice(0, 500) } : {}),
  };
  return {
    sourceId: id,
    expediente: touchExpediente({
      ...exp,
      sources: [...exp.sources, next],
    }),
  };
}

export function addItem(
  exp: Expediente,
  item: Omit<ExpedienteItem, "id"> & { id?: string },
): Expediente {
  const id = item.id ?? `item-${exp.items.length + 1}-${Date.now()}`;
  return touchExpediente({
    ...exp,
    items: [
      ...exp.items,
      {
        id,
        class: item.class,
        text: item.text,
        sourceIds: [...item.sourceIds],
        ...(item.detector !== undefined ? { detector: item.detector } : {}),
      },
    ],
  });
}

export function addTimelineEvent(
  exp: Expediente,
  event: Omit<TimelineEvent, "id"> & { id?: string },
): Expediente {
  const id = event.id ?? `tl-${exp.timeline.length + 1}-${Date.now()}`;
  return touchExpediente({
    ...exp,
    timeline: [
      ...exp.timeline,
      {
        id,
        at: event.at,
        description: event.description,
        sourceIds: [...event.sourceIds],
      },
    ],
  });
}

export function addContradiction(
  exp: Expediente,
  c: Omit<Contradiction, "id"> & { id?: string },
): Expediente {
  const id = c.id ?? `cx-${exp.contradictions.length + 1}-${Date.now()}`;
  return touchExpediente({
    ...exp,
    contradictions: [
      ...exp.contradictions,
      {
        id,
        description: c.description,
        itemIds: [...c.itemIds],
        sourceIds: [...c.sourceIds],
      },
    ],
  });
}

export function recordDetectorRun(
  exp: Expediente,
  run: DetectorRunRecord,
): Expediente {
  return touchExpediente({
    ...exp,
    detectorRuns: [...exp.detectorRuns, run],
  });
}

/** Resumen legible sin elevar scores a veredictos. */
export function summarizeExpediente(exp: Expediente): string {
  const counts = {
    hecho: exp.items.filter((i) => i.class === "hecho").length,
    indicio: exp.items.filter((i) => i.class === "indicio").length,
    hipotesis: exp.items.filter((i) => i.class === "hipotesis").length,
    desconocido: exp.items.filter((i) => i.class === "desconocido").length,
  };
  const lines = [
    `# ${exp.title}`,
    `Actualizado: ${exp.updatedAt}`,
    `Fuentes: ${exp.sources.length}`,
    `Ítems: hecho=${counts.hecho} indicio=${counts.indicio} hipótesis=${counts.hipotesis} desconocido=${counts.desconocido}`,
    `Ejecuciones de detector: ${exp.detectorRuns.length}`,
    `Contradicciones registradas: ${exp.contradictions.length}`,
    `Eventos en cronología: ${exp.timeline.length}`,
  ];
  if (exp.detectorRuns.length) {
    lines.push("", "## Detectores (no son veredictos)");
    for (const r of exp.detectorRuns) {
      lines.push(
        `- ${r.detectorId} · estado=${r.state} · top=${r.topLabel ?? "—"} · v=${r.modelVersion}`,
      );
    }
  }
  return lines.join("\n");
}
