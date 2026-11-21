/**
 * EVIDENCE ENGINE — capa modular de análisis de evidencia.
 *
 * Recibe texto, imágenes, URLs, resultados de búsqueda y metadatos, y los clasifica
 * en HECHO OBSERVADO / INFERENCIA / CONCLUSIÓN DE KERNEL. No convierte sospechas en
 * hechos: la naturaleza de cada elemento se conserva explícitamente.
 */

export type EvidenceKind = "hecho_observado" | "inferencia" | "conclusion_kernel";

export type EvidenceSource = "texto" | "imagen" | "url" | "web_search" | "metadato";

export type EvidenceItem = {
  descripcion: string;
  tipo: EvidenceKind;
  origen: EvidenceSource;
  /** 1–4 (escala interna de gravedad de KERNEL). */
  gravedad?: number;
  referencia?: string;
};

export type RiskAssessment = {
  nivel: "G1" | "G2" | "G3" | "G4";
  confianza: number;
  total: number;
  hechos: number;
  inferencias: number;
  conclusiones: number;
  nota: string;
};

export function assessEvidence(items: EvidenceItem[]): RiskAssessment {
  const hechos = items.filter((i) => i.tipo === "hecho_observado").length;
  const inferencias = items.filter((i) => i.tipo === "inferencia").length;
  const conclusiones = items.filter((i) => i.tipo === "conclusion_kernel").length;

  const max = items.reduce((acc, i) => Math.max(acc, Math.round(i.gravedad ?? 1)), 0);
  const nivel = (["G1", "G1", "G2", "G3", "G4"] as const)[Math.min(4, Math.max(0, max))] ?? "G1";
  const base = items.length === 0 ? 0 : (hechos / items.length) * 100;

  return {
    nivel,
    confianza: Math.round(Math.min(92, Math.max(15, base))),
    total: items.length,
    hechos,
    inferencias,
    conclusiones,
    nota: "Clasificación interna de riesgo de KERNEL basada en la proporción de hechos observados. No es una sentencia jurídica.",
  };
}
