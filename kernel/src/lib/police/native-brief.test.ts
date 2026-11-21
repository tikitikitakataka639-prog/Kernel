import { describe, expect, test } from "bun:test";
import { buildNativeBriefMessages, NATIVE_POLICE_MODEL_ID } from "@/lib/police/native-brief";
import { addContradiction, addItem, addSource, createExpediente } from "@/lib/police/expediente";

describe("brief de interpretación Llama MODE POLICE", () => {
  test("fija Llama 3.2 3B y conserva las contradicciones como candidatas", () => {
    let exp = createExpediente({ title: "Prueba de expediente" });
    const a = addSource(exp, { kind: "user_text", label: "Declaración A" });
    exp = a.expediente;
    const b = addSource(exp, { kind: "user_transcript", label: "Declaración B" });
    exp = b.expediente;
    exp = addItem(exp, { id: "a1", class: "desconocido", text: "Estaba en Madrid.", sourceIds: [a.sourceId] });
    exp = addItem(exp, { id: "b1", class: "desconocido", text: "No estaba en Madrid.", sourceIds: [b.sourceId] });
    exp = addContradiction(exp, {
      id: "cx1",
      description: "Posible contradicción automática; requiere revisión humana.",
      itemIds: ["a1", "b1"],
      sourceIds: [a.sourceId, b.sourceId],
    });

    const messages = buildNativeBriefMessages(exp);
    expect(NATIVE_POLICE_MODEL_ID).toBe("llama-3.2-3b");
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("no decides culpabilidad");
    expect(messages[1]?.content).toContain("Posible contradicción automática");
    expect(messages[1]?.content).toContain("contenido no confiable");
  });
});
