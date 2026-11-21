/**
 * KERNEL VOICE — módulo de voz independiente de KERNEL CORE.
 *
 * Aquí viven SOLO las dos capacidades de voz:
 *   - Speech-to-Text  (voz del usuario -> texto)
 *   - Text-to-Speech  (respuesta de KERNEL -> audio)
 *
 * KERNEL CORE no sabe nada de esto: la conversación sigue pasando por /api/chat.
 * Sustituir estos proveedores por soluciones propias/locales no requiere tocar el núcleo.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Modelos por defecto del proveedor actual (intercambiables sin tocar KERNEL CORE). */
export const KERNEL_VOICE_STT_MODEL = "openai/gpt-4o-transcribe";
export const KERNEL_VOICE_TTS_MODEL = "openai/gpt-4o-mini-tts";

/**
 * Voz de KERNEL: masculina, español de España, adulto joven, tono medio-grave,
 * cálida y natural, tranquila, contenida. Nada teatral ni corporativo.
 */
export const KERNEL_VOICE_ID = "ash";

export const KERNEL_VOICE_INSTRUCTIONS =
  "Habla en español de España con acento neutro peninsular. Voz masculina de adulto joven (25-35 años), " +
  "registro medio-grave, cálida y natural, tranquila y segura, cercana como un amigo. Ritmo ligeramente " +
  "pausado pero fluido, nunca robótico. Emoción contenida: sin dramatismo, sin épica, sin tono " +
  "publicitario ni de asistente corporativo. Si el contenido es grave o turbio, baja el tono y ponte " +
  "serio y firme, sin gritar.";

function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Speech-to-Text: devuelve la transcripción del audio recibido. */
export async function kernelVoiceTranscribe(
  audio: File | Blob,
  apiKey: string,
  filename = "recording.wav",
): Promise<Response> {
  const form = new FormData();
  form.append("model", KERNEL_VOICE_STT_MODEL);
  form.append("file", audio, filename);
  // Español fijado y temperatura 0: menos invenciones en audio de móvil.
  form.append("language", "es");
  form.append("temperature", "0");

  const upstream = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || "Transcripción fallida", { status: upstream.status });
  }

  const data = (await upstream.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  return Response.json({ text });
}

/** Text-to-Speech: devuelve el audio (mp3) de la respuesta de KERNEL. */
export async function kernelVoiceSpeak(text: string, apiKey: string): Promise<Response> {
  const upstream = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: KERNEL_VOICE_TTS_MODEL,
      input: text,
      voice: KERNEL_VOICE_ID,
      instructions: KERNEL_VOICE_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || "Síntesis de voz fallida", { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

/** Trocea texto largo para no pasarse del límite de entrada del modelo de voz. */
export function chunkForVoice(text: string, maxWords = 320): string[] {
  const words = (s: string) => (s.match(/\S+/g) ?? []).length;
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (words(sentence) > maxWords) {
      flush();
      const list = sentence.match(/\S+/g) ?? [];
      for (let i = 0; i < list.length; i += maxWords) {
        chunks.push(list.slice(i, i + maxWords).join(" "));
      }
      continue;
    }
    if (current && words(current) + words(sentence) > maxWords) flush();
    current += sentence;
  }
  flush();
  return chunks;
}
