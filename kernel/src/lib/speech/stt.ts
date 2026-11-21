/**
 * KERNEL SPEECH ENGINE — SpeechToTextProvider.
 *
 * SpeechToTextProvider
 *   ├── ExternalSpeechProvider  (proveedor externo actual vía /api/voice/transcribe)
 *   └── KernelSpeechProvider    (motor propio: TODAVÍA NO EXISTE, no se simula)
 */
import { SpeechError, type SpeechCapture, type SpeechToTextProvider, type Transcription } from "./types";

/** Proveedor externo actual. Toda la dependencia externa vive aquí. */
export class ExternalSpeechProvider implements SpeechToTextProvider {
  readonly id = "external";
  readonly available = true;

  constructor(private readonly endpoint = "/api/voice/transcribe") {}

  async transcribe(capture: SpeechCapture, signal?: AbortSignal): Promise<Transcription> {
    const form = new FormData();
    form.append("audio", capture.blob, "recording.wav");

    let res: Response;
    try {
      res = await fetch(this.endpoint, { method: "POST", body: form, signal: signal ?? null });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") {
        throw new SpeechError("cancelled", "Transcripción cancelada.");
      }
      throw new SpeechError("network", "Sin conexión con el servicio de transcripción.", true);
    }

    if (!res.ok) {
      throw new SpeechError(
        res.status >= 500 ? "network" : "transcription",
        "No he podido transcribir ese audio.",
        true,
      );
    }

    const data = (await res.json().catch(() => ({}))) as {
      text?: string;
      confident?: boolean;
      language?: string;
    };
    const text = cleanTranscript(data.text ?? "");
    return {
      text,
      confident: Boolean(text) && data.confident !== false,
      ...(data.language ? { language: data.language } : {}),
    };
  }
}

/**
 * Motor de transcripción propio de KERNEL. Aún no implementado: se declara para
 * que el Voice Controller pueda cambiar de proveedor sin tocar el Chat Normal.
 */
export class KernelSpeechProvider implements SpeechToTextProvider {
  readonly id = "kernel";
  readonly available = false;

  async transcribe(): Promise<Transcription> {
    throw new SpeechError(
      "transcription",
      "El motor de transcripción propio de KERNEL todavía no está disponible.",
    );
  }
}

/** Quita repeticiones y duplicados que suelen colar los motores de STT. */
export function cleanTranscript(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  // palabra palabra palabra -> palabra
  text = text.replace(/\b(\p{L}{3,})(\s+\1\b)+/giu, "$1");
  // frase repetida pegada dos veces
  text = text.replace(/\b(.{12,}?)\s*\1\b/giu, "$1");
  return text.trim();
}

export function createSpeechToTextProvider(): SpeechToTextProvider {
  const own = new KernelSpeechProvider();
  return own.available ? own : new ExternalSpeechProvider();
}
