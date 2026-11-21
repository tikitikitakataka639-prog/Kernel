import { afterEach, describe, expect, test } from "bun:test";
import { runPoliceSuite } from "@/lib/police/run-police-suite";
import { serializeExpedienteJson, serializeExpedienteMarkdown } from "@/lib/police/export-expediente";

const originalFetch = globalThis.fetch;
const productionOrigin = "https://project-kernel-release-1-0-0.lovable.app";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const liveTest = process.env["KERNEL_POLICE_REAL_MODEL_TESTS"] === "1" ? test : test.skip;

describe("recorrido real KERNEL → Police Engine → expediente", () => {
  liveTest("usa HTTP y pesos reales, registra resultados y exporta el expediente", async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Origin", productionOrigin);
      return originalFetch(input, { ...init, headers });
    }) as unknown as typeof fetch;

    const result = await runPoliceSuite({
      text: "El usuario estaba en Madrid el lunes a las diez. Ayer recibió un mensaje.",
      transcript: "El usuario no estaba en Madrid el lunes a las diez.",
      detectors: ["horizon", "mrbert-legal"],
    });

    expect(result.online).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.expediente.detectorRuns).toHaveLength(2);
    expect(result.expediente.contradictions).toHaveLength(1);
    expect(result.expediente.timeline.some((event) => event.at === "Ayer")).toBe(true);

    const json = JSON.parse(serializeExpedienteJson(result.expediente));
    const markdown = serializeExpedienteMarkdown(result.expediente);
    expect(json.schema).toBe("kernel-police-expediente");
    expect(json.expediente.detectorRuns).toHaveLength(2);
    expect(markdown).toContain("POSIBLE CONTRADICCIÓN AUTOMÁTICA");
    expect(markdown.toLowerCase()).toContain("horizon");
  }, 180_000);
});
