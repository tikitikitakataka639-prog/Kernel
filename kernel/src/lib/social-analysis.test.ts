import { describe, expect, test } from "bun:test";
import { alertSchema, PLATFORMS, REVIEW_STATUSES, generateSocialReport, normalizeSocialTarget, readSocialAlerts, validateAnalysisInput, type SocialAlert } from "./social-analysis";

describe("social analysis rules", () => {
  test("offers all eight requested platforms", () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual(["youtube", "facebook", "threads", "tiktok", "instagram", "x", "reddit", "other"]);
  });
  test("text alone is analyzable", () => {
    expect(validateAnalysisInput({ url: "", platform: "reddit", text: "comentario aportado", transcript: "", images: 0, categories: ["fraud"] })).toBe("");
  });
  test("transcript alone is analyzable", () => {
    expect(validateAnalysisInput({ url: "", platform: "youtube", text: "", transcript: "Transcripción aportada", images: 0, categories: ["violence"] })).toBe("");
  });
  test("rejects mismatched platforms", () => expect(() => normalizeSocialTarget("https://www.instagram.com/p/abc", "youtube")).toThrow("plataforma"));
  test("Threads handles remain supported", () => expect(normalizeSocialTarget("@usuario", "threads")).toBe("https://www.threads.net/@usuario"));
  test("rejects credential-bearing URLs", () => expect(() => normalizeSocialTarget("https://user:password@reddit.com", "reddit")).toThrow("credenciales"));
  test("does not accept non-web URLs", () => expect(() => normalizeSocialTarget("file:///secret", "other")).toThrow("HTTP/HTTPS"));
  test("requires content", () => expect(() => validateAnalysisInput({ url: "", platform: "x", text: "", transcript: "", images: 0, categories: ["other"] })).toThrow("Añade"));
  test("requires a chosen category", () => expect(() => validateAnalysisInput({ url: "", platform: "x", text: "texto", transcript: "", images: 0, categories: [] })).toThrow("categoría"));
  test("never invents alerts from prose", () => expect(readSocialAlerts([{ id: "1", role: "assistant", parts: [{ type: "text", text: "Fraude confirmado" }] }])).toEqual([]));
  test("confidence cannot exceed 100", () => expect(alertSchema.safeParse({ categoria: "fraud", naturaleza: "posible_ilegalidad", evidencia: "texto", origen: "texto_aportado", referencia: "comentario", confianza: 101, motivo: "motivo" }).success).toBe(false));

  const alert: SocialAlert & { id: string } = { id: "a1", categoria: "fraud", naturaleza: "posible_ilegalidad", evidencia: "Transferencia solicitada", origen: "texto_aportado", referencia: "comentario 2", confianza: 72, motivo: "Solicitud sospechosa" };
  test("exports source, timestamp and evidence without duplication", () => {
    const report = generateSocialReport({ platform: "reddit", url: "https://reddit.com/r/example", date: "2026-10-11T00:57:00Z", report: "Indicios aportados", alerts: [alert], reviews: {} });
    expect(report).toContain("https://reddit.com/r/example");
    expect(report).toContain("2026-10-11T00:57:00Z");
    expect(report.split(alert.evidencia).length - 1).toBe(1);
  });
  test("exports pending review by default and each human review state", () => {
    for (const state of REVIEW_STATUSES) {
      const report = generateSocialReport({ platform: "threads", url: "", date: "2026-10-11T00:57:00Z", report: "Indicios", alerts: [alert], reviews: state === "Pendiente de revisión" ? {} : { a1: state } });
      expect(report).toContain(`Estado: ${state}\n`);
    }
  });
  test("only completed validated tool alerts reach human review", () => {
    const output = { alertas: [alert] };
    expect(readSocialAlerts([{ id: "m1", role: "assistant", parts: [{ type: "tool-registrar_alertas", state: "output-available", output }] }])).toEqual([{ ...alert, id: "m1-0-0" }]);
    expect(readSocialAlerts([{ id: "m1", role: "assistant", parts: [{ type: "tool-registrar_alertas", state: "input-available", output }] }])).toEqual([]);
    expect(readSocialAlerts([{ id: "m1", role: "assistant", parts: [{ type: "tool-registrar_alertas", state: "output-available", output: { alertas: [{ ...alert, confianza: 101 }] } }] }])).toEqual([]);
  });
});