import { describe, expect, test } from "bun:test";
import { addSource, createExpediente } from "@/lib/police/expediente";
import { serializeExpedienteJson, serializeExpedienteMarkdown, validateExpedienteForExport } from "@/lib/police/export-expediente";

describe("expediente export", () => {
  test("exports the envelope as JSON with its source trace", () => {
    const base = createExpediente({ title: "Caso exportación" });
    const added = addSource(base, { kind: "user_text", label: "Texto", excerpt: "mensaje" });
    const json = JSON.parse(serializeExpedienteJson(added.expediente));
    expect(json.schema).toBe("kernel-police-expediente");
    expect(json.expediente.sources[0].id).toBe(added.sourceId);
  });
  test("exports Markdown with empty sections and limitations", () => {
    const markdown = serializeExpedienteMarkdown(createExpediente());
    expect(markdown).toContain("## Fuentes");
    expect(markdown).toContain("## Cronología");
    expect(markdown).toContain("no veredictos");
  });
  test("rejects dangling source references", () => {
    const expediente = createExpediente();
    expediente.items.push({ id: "broken", class: "indicio", text: "x", sourceIds: ["missing"] });
    expect(validateExpedienteForExport(expediente).some((e) => e.includes("missing"))).toBe(true);
    expect(() => serializeExpedienteJson(expediente)).toThrow(/no exportable/i);
  });
});
