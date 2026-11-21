import { describe, expect, test } from "bun:test";

import {
  addSource,
  createExpediente,
  summarizeExpediente,
} from "@/lib/police/expediente";
import { mapDetectorResultToExpediente } from "@/lib/police/map-detector-result";
import { buildNativeBriefMessages } from "@/lib/police/native-brief";
import type { PoliceAnalysisResult } from "@/lib/police/types";

describe("expediente",
 () => {
  test("crea expediente vacío con notas de no-veredicto",
 () => {
    const exp = createExpediente({ title: "Caso prueba" });
    expect(exp.items).toHaveLength(0);
    expect(exp.notes.some((n) => /no confirman identidad/i.test(n))).toBe(true);
  });

  test("fuentes e ítems rastreables",
 () => {
    let exp = createExpediente();
    const { expediente, sourceId } = addSource(exp, {
      kind: "user_text",
      label: "Texto",
      excerpt: "hola",
    });
    exp = expediente;
    expect(exp.sources[0]?.id).toBe(sourceId);
  });
});

describe("mapDetectorResultToExpediente",
 () => {
  test("resultado ok produce indicios, no hechos de culpabilidad",
 () => {
    const result: PoliceAnalysisResult = {
      model_id: "horizon",
      model_version: "base-onnx-int8-v1",
      state: "ok",
      labels: [
        { label: "fraud", score: 0.7 },
        { label: "legitimate", score: 0.3 },
      ],
      top_label: "fraud",
      language: "es",
      relevant_fragments: [{ text: "urgente transferir" }],
      raw_scores: { fraud: 0.7, legitimate: 0.3 },
      limitations: ["Solo analiza texto"],
      latency_ms: 12,
      error: null,
      metadata: { grooming_assessment: { risk_level: "isolated_signals", model_score_calibrated: false } },
    };
    const exp = mapDetectorResultToExpediente(createExpediente(), result);
    expect(exp.detectorRuns).toHaveLength(1);
    expect(exp.detectorRuns[0]?.topLabel).toBe("fraud");
    expect(exp.detectorRuns[0]?.metadata?.["grooming_assessment"]).toBeDefined();
    expect(exp.items[0]?.detector?.metadata?.["grooming_assessment"]).toBeDefined();
    const classes = exp.items.map((i) => i.class);
    expect(classes).toContain("indicio");
    expect(classes).toContain("desconocido"); // limitaciones
    expect(exp.items.every((i) => i.class !== "hecho" || !/culpab/i.test(i.text))).toBe(
      true,
    );
    expect(exp.items.some((i) => /no es veredicto/i.test(i.text))).toBe(true);
  });

  test("model_not_ready → desconocido",
 () => {
    const result: PoliceAnalysisResult = {
      model_id: "paxmod-guard",
      model_version: "0.1.1",
      state: "model_not_ready",
      labels: [],
      top_label: null,
      language: null,
      relevant_fragments: [],
      raw_scores: {},
      limitations: ["No se han descargado los pesos"],
      latency_ms: null,
      error: "not loaded",
    };
    const exp = mapDetectorResultToExpediente(createExpediente(), result);
    expect(exp.items.some((i) => i.class === "desconocido")).toBe(true);
  });
});

describe("native-brief",
 () => {
  test("buildNativeBriefMessages incluye reglas anti-veredicto",
 () => {
    const exp = mapDetectorResultToExpediente(createExpediente({ title: "T" }), {
      model_id: "grooming-xlm-roberta-es-en",
      model_version: "0.1.1-experimental-sklearn",
      state: "ok",
      labels: [{ label: "grooming_risk", score: 0.6 }],
      top_label: "grooming_risk",
      language: "es",
      relevant_fragments: [],
      raw_scores: { grooming_risk: 0.6, benign: 0.4 },
      limitations: ["EXPERIMENTAL"],
      latency_ms: 5,
      error: null,
    });
    const msgs = buildNativeBriefMessages(exp);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[0]?.content).toMatch(/NO son veredictos/i);
    expect(msgs[1]?.content).toMatch(/grooming/i);
    expect(summarizeExpediente(exp)).toMatch(/Detectores/);
  });
});
