import type { Expediente } from "@/lib/police/expediente";

export type ExpedienteExportFormat = "json" | "md";

type ExportEnvelope = {
  schema: "kernel-police-expediente";
  schemaVersion: 1;
  exportedAt: string;
  expediente: Expediente;
};

export function validateExpedienteForExport(exp: Expediente): string[] {
  const errors: string[] = [];
  const sourceIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const source of exp.sources) {
    if (!source.id || sourceIds.has(source.id)) errors.push("ID de fuente vacío o duplicado.");
    sourceIds.add(source.id);
  }
  for (const item of exp.items) {
    if (!item.id || itemIds.has(item.id)) errors.push("ID de ítem vacío o duplicado.");
    itemIds.add(item.id);
    for (const sourceId of item.sourceIds) {
      if (!sourceIds.has(sourceId)) errors.push("El ítem " + item.id + " referencia una fuente inexistente: " + sourceId);
    }
    for (const [label, score] of Object.entries(item.detector?.scores ?? {})) {
      if (!Number.isFinite(score)) errors.push("Score no finito en " + item.id + ": " + label);
    }
  }
  for (const event of exp.timeline) {
    for (const sourceId of event.sourceIds) {
      if (!sourceIds.has(sourceId)) errors.push("El evento " + event.id + " referencia una fuente inexistente: " + sourceId);
    }
  }
  for (const contradiction of exp.contradictions) {
    for (const itemId of contradiction.itemIds) {
      if (!itemIds.has(itemId)) errors.push("La contradicción " + contradiction.id + " referencia un ítem inexistente: " + itemId);
    }
    for (const sourceId of contradiction.sourceIds) {
      if (!sourceIds.has(sourceId)) errors.push("La contradicción " + contradiction.id + " referencia una fuente inexistente: " + sourceId);
    }
  }
  for (const run of exp.detectorRuns) {
    for (const [label, score] of Object.entries(run.scores)) {
      if (!Number.isFinite(score)) errors.push("Score no finito en ejecución " + run.detectorId + ": " + label);
    }
  }
  return errors;
}

function createEnvelope(expediente: Expediente): ExportEnvelope {
  const errors = validateExpedienteForExport(expediente);
  if (errors.length) throw new Error("Expediente no exportable: " + errors.join(" "));
  return { schema: "kernel-police-expediente", schemaVersion: 1, exportedAt: new Date().toISOString(), expediente };
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

export function serializeExpedienteJson(expediente: Expediente): string {
  return JSON.stringify(createEnvelope(expediente), null, 2);
}

export function serializeExpedienteMarkdown(expediente: Expediente): string {
  const data = createEnvelope(expediente).expediente;
  const lines = [
    "# " + (clean(data.title) || "Expediente MODE POLICE"),
    "",
    "- ID: " + data.id,
    "- Creado: " + data.createdAt,
    "- Actualizado: " + data.updatedAt,
    "- Exportado: " + new Date().toISOString(),
    "",
    "> Documento de apoyo técnico. Los resultados automáticos son indicios, no veredictos ni pruebas de identidad o culpabilidad.",
    "",
    "## Fuentes",
    "",
  ];
  if (!data.sources.length) lines.push("- No hay fuentes registradas.", "");
  for (const source of data.sources) {
    lines.push("### " + (clean(source.label) || source.id), "- ID: " + source.id, "- Tipo: " + source.kind, "- Referencia: " + (clean(source.ref) || "No disponible"), "- Fragmento: " + (clean(source.excerpt) || "No disponible"), "");
  }
  const classes = [["hecho", "Hechos"], ["indicio", "Indicios"], ["hipotesis", "Hipótesis"], ["desconocido", "Desconocidos"]] as const;
  lines.push("## Clasificación", "");
  for (const pair of classes) {
    lines.push("### " + pair[1], "");
    const items = data.items.filter((item) => item.class === pair[0]);
    if (!items.length) lines.push("- Ninguno registrado.", "");
    for (const item of items) {
      lines.push("- **" + item.id + "**: " + clean(item.text), "  - Fuentes: " + (item.sourceIds.join(", ") || "Sin referencias"));
      if (item.detector) lines.push("  - Detector: " + item.detector.id + " · versión: " + item.detector.modelVersion + " · estado: " + item.detector.state, "  - Etiqueta principal: " + (item.detector.topLabel ?? "No disponible"), "  - Scores: " + JSON.stringify(item.detector.scores), "  - Limitaciones: " + (item.detector.limitations.join("; ") || "No especificadas"));
      lines.push("");
    }
  }
  lines.push("## Cronología", "");
  if (!data.timeline.length) lines.push("- No hay eventos registrados.", "");
  for (const event of data.timeline) lines.push("- **" + (event.at ?? "Fecha desconocida") + "**: " + clean(event.description), "  - Fuentes: " + (event.sourceIds.join(", ") || "Sin referencias"), "");
  lines.push("## Contradicciones", "");
  if (!data.contradictions.length) lines.push("- No hay contradicciones registradas.", "");
  for (const item of data.contradictions) lines.push("- " + clean(item.description), "  - Ítems: " + (item.itemIds.join(", ") || "Sin referencias"), "  - Fuentes: " + (item.sourceIds.join(", ") || "Sin referencias"), "");
  lines.push("## Ejecuciones de detectores", "");
  if (!data.detectorRuns.length) lines.push("- No hay ejecuciones registradas.", "");
  for (const run of data.detectorRuns) lines.push("### " + run.detectorId, "- Versión: " + run.modelVersion, "- Estado: " + run.state, "- Etiqueta principal: " + (run.topLabel ?? "No disponible"), "- Scores: " + JSON.stringify(run.scores), "- Latencia: " + (run.latencyMs ?? "No disponible") + " ms", "- Error: " + (run.error ?? "Ninguno"), "- Limitaciones: " + (run.limitations.join("; ") || "No especificadas"), "- Fecha: " + run.ranAt, "");
  lines.push("## Notas", "");
  for (const note of data.notes) lines.push("- " + clean(note));
  if (!data.notes.length) lines.push("- Ninguna.");
  return lines.join("\n");
}

export function downloadExpediente(expediente: Expediente, format: ExpedienteExportFormat): void {
  const content = format === "json" ? serializeExpedienteJson(expediente) : serializeExpedienteMarkdown(expediente);
  const mime = format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
  const extension = format === "json" ? "json" : "md";
  const safeId = expediente.id.replace(/[^a-zA-Z0-9_-]/g, "_") || "kernel-expediente";
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeId + "." + extension;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
