import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { buildKernelBridgePrompt, isComplaintDraftRequest } from "@/lib/kernel-chat-context";

const msg = (id: string, role: "user" | "assistant", text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

describe("kernel chat context", () => {
  test("incluye personalidad, historial reciente y mensaje actual", () => {
    const result = buildKernelBridgePrompt([
      msg("1", "user", "Me llamo X"),
      msg("2", "assistant", "Entendido"),
      msg("3", "user", "¿Qué recuerdas de lo que te conté?"),
    ]);
    expect(result.prompt).toContain("Eres K.E.R.N.E.L.");
    expect(result.prompt).toContain("USUARIO: Me llamo X");
    expect(result.prompt).toContain("¿Qué recuerdas de lo que te conté?");
  });
  test("activa el modo denuncia solo ante una petición de redacción", () => {
    expect(isComplaintDraftRequest("Prepara un borrador de denuncia")).toBe(true);
    expect(isComplaintDraftRequest("¿Qué significa una denuncia?")).toBe(false);
  });
  test("marca las peticiones de denuncia sin subir del límite del puente", () => {
    const result = buildKernelBridgePrompt([msg("1", "user", "Prepara una denuncia con estos hechos: X")]);
    expect(result.complaintDraft).toBe(true);
    expect(result.prompt.length).toBeLessThanOrEqual(8_000);
    expect(result.prompt).toContain("[DATO NO APORTADO]");
  });
});
