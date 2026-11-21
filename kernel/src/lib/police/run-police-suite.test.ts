import { afterEach, describe, expect, mock, test } from "bun:test";
import { runPoliceSuite } from "@/lib/police/run-police-suite";
import { serializeExpedienteJson } from "@/lib/police/export-expediente";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("integración KERNEL → cliente Police Engine → expediente", () => {
  test("recorre health/load/analyze/unload, registra fuentes y exporta", async () => {
    const calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      calls.push({ path: url.pathname, method, body });

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.pathname === "/load") {
        return new Response(JSON.stringify({
          ok: true,
          model: { id: body["detector"], version: "test-model", loaded: true, status: "loaded" },
        }), { status: 200 });
      }
      if (url.pathname === "/analyze") {
        return new Response(JSON.stringify({
          ok: true,
          result: {
            model_id: body["detector"],
            model_version: "test-model",
            state: "ok",
            labels: [{ label: "legitimate", score: 0.9 }],
            top_label: "legitimate",
            language: "es",
            relevant_fragments: [],
            raw_scores: { legitimate: 0.9 },
            limitations: ["Resultado simulado para prueba de integración."],
            latency_ms: 1,
            error: null,
          },
        }), { status: 200 });
      }
      if (url.pathname === "/unload") {
        return new Response(JSON.stringify({
          ok: true,
          model: { id: body["detector"], version: "test-model", loaded: false, status: "ready" },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
    }) as unknown as typeof fetch;

    const result = await runPoliceSuite({
      text: "El usuario estaba en Madrid el lunes a las diez. Ayer recibió un mensaje.",
      transcript: "El usuario no estaba en Madrid el lunes a las diez.",
      detectors: ["horizon", "grooming-xlm-roberta-es-en"],
    });

    expect(result.online).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.expediente.sources).toHaveLength(4);
    expect(result.expediente.sources.filter((source) => source.kind === "user_text" || source.kind === "user_transcript")).toHaveLength(2);
    expect(result.expediente.detectorRuns).toHaveLength(2);
    expect(result.expediente.contradictions).toHaveLength(1);
    expect(result.expediente.timeline.some((event) => event.at === "Ayer")).toBe(true);
    expect(calls.filter((call) => call.path === "/load")).toHaveLength(2);
    expect(calls.filter((call) => call.path === "/analyze")).toHaveLength(2);
    expect(calls.filter((call) => call.path === "/unload")).toHaveLength(2);

    const exported = JSON.parse(serializeExpedienteJson(result.expediente));
    expect(exported.schema).toBe("kernel-police-expediente");
    expect(exported.expediente.contradictions).toHaveLength(1);
    expect(exported.expediente.detectorRuns).toHaveLength(2);
  });

  test("la suite predeterminada incluye PaxmodGuard", async () => {
    const analyzed: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url.pathname === "/load") return new Response(JSON.stringify({ ok: true, model: { id: body["detector"], version: "test", loaded: true, status: "loaded" } }), { status: 200 });
      if (url.pathname === "/analyze") {
        analyzed.push(String(body["detector"]));
        return new Response(JSON.stringify({ ok: true, result: {
          model_id: body["detector"], model_version: "test", state: "ok", labels: [], top_label: null,
          language: "es", relevant_fragments: [], raw_scores: {}, limitations: [], latency_ms: 1, error: null,
        } }), { status: 200 });
      }
      if (url.pathname === "/unload") return new Response(JSON.stringify({ ok: true, model: { id: body["detector"], version: "test", loaded: false, status: "ready" } }), { status: 200 });
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as unknown as typeof fetch;
    const result = await runPoliceSuite({ text: "Persona A: tengo 13 años.\nPersona B: no se lo digas a tus padres." });
    expect(result.ok).toBe(true);
    expect(analyzed).toContain("paxmod-guard");
    expect(analyzed).toContain("horizon");
    expect(analyzed).toContain("grooming-xlm-roberta-es-en");
  });
});
