import { createFileRoute } from "@tanstack/react-router";

import { kernelVoiceTranscribe } from "@/lib/kernel-voice.server";

// Vercel Function request bodies are limited to 4.5 MB. Leave room for the
// multipart boundary and headers rather than advertising the old 20 MB limit.
const MAX_AUDIO_BYTES = 3_500_000;
const MAX_MULTIPART_BYTES = 4_000_000;

function voiceError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/voice/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
          return voiceError(413, "AUDIO_REQUEST_TOO_LARGE", "La petición de audio supera el límite compatible con Vercel (4 MB). Reduce la duración o la calidad.");
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return voiceError(503, "VOICE_PROVIDER_NOT_CONFIGURED", "La transcripción en servidor no está configurada. La web puede seguir funcionando; configura un proveedor de voz compatible para activar esta función.");
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return voiceError(400, "INVALID_MULTIPART", "El formulario de audio no es válido.");
        }
        const audio = form.get("audio");
        if (!(audio instanceof File)) return voiceError(400, "AUDIO_REQUIRED", "Audio requerido.");
        if (audio.size === 0) return voiceError(400, "AUDIO_EMPTY", "El audio está vacío.");
        if (audio.size > MAX_AUDIO_BYTES) {
          return voiceError(413, "AUDIO_TOO_LARGE", "El audio supera los 3,5 MB permitidos por KERNEL para el despliegue web.");
        }

        try {
          return await kernelVoiceTranscribe(audio, key, audio.name || "recording.wav");
        } catch (error) {
          console.error("KERNEL voice transcription provider failed:", error);
          return voiceError(502, "VOICE_PROVIDER_FAILED", "El proveedor de transcripción no respondió correctamente. Revisa la configuración y los logs del servicio.");
        }
      },
    },
  },
});
