import { createFileRoute } from "@tanstack/react-router";

import { chunkForVoice, kernelVoiceSpeak } from "@/lib/kernel-voice.server";

function voiceError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/voice/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > 64_000) {
          return voiceError(413, "TEXT_TOO_LARGE", "El texto de voz supera el límite de 64 KB.");
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return voiceError(503, "VOICE_PROVIDER_NOT_CONFIGURED", "La síntesis de voz en servidor no está configurada. La web puede seguir funcionando; configura un proveedor de voz compatible para activar esta función.");
        }

        let body: { text?: unknown };
        try {
          const parsed: unknown = await request.json();
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return voiceError(400, "INVALID_BODY", "El cuerpo debe ser un objeto JSON.");
          }
          if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 64_000) {
            return voiceError(413, "TEXT_TOO_LARGE", "El cuerpo de la petición supera los 64 KB.");
          }
          body = parsed as { text?: unknown };
        } catch {
          return voiceError(400, "INVALID_JSON", "El cuerpo de la petición no contiene JSON válido.");
        }

        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return voiceError(400, "TEXT_REQUIRED", "Texto requerido.");
        if (text.length > 12_000) return voiceError(413, "TEXT_TOO_LARGE", "El texto supera los 12.000 caracteres permitidos.");

        // El cliente pide un fragmento a la vez; aquí solo garantizamos el límite.
        const chunk = chunkForVoice(text)[0] ?? text;
        try {
          return await kernelVoiceSpeak(chunk, key);
        } catch (error) {
          console.error("KERNEL voice synthesis provider failed:", error);
          return voiceError(502, "VOICE_PROVIDER_FAILED", "El proveedor de síntesis de voz no respondió correctamente. Revisa la configuración y los logs del servicio.");
        }
      },
    },
  },
});
