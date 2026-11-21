/**
 * KERNEL SPEECH ENGINE — contratos.
 *
 * Speech Engine
 *   ├── SpeechToTextProvider   (ExternalSpeechProvider | KernelSpeechProvider)
 *   └── TextToSpeechProvider   (ExternalTextToSpeechProvider | BrowserTextToSpeechProvider)
 *
 * El Chat Normal habla con el Voice Controller (useKernelVoice), y el Voice
 * Controller habla SOLO con estas interfaces. Sustituir un proveedor externo por
 * uno propio/local no requiere tocar la interfaz ni el chat.
 */

/** Estados del sistema de voz. Nunca hay dos a la vez. */
export type VoiceState =
  | "idle"
  | "listening"
  | "processing_audio"
  | "transcribing"
  | "transcription_ready"
  | "sending"
  | "thinking"
  | "speaking"
  | "error"
  | "cancelled";

export type SpeechCapture = {
  /** WAV mono completo (con cabecera), listo para cualquier proveedor. */
  blob: Blob;
  sampleRate: number;
  /** Milisegundos de voz detectada (sin silencios). */
  speechMs: number;
  durationMs: number;
};

export type Transcription = {
  text: string;
  /** false = el motor no está seguro; hay que pedir repetición en vez de inventar. */
  confident: boolean;
  language?: string;
};

export interface SpeechToTextProvider {
  readonly id: string;
  readonly available: boolean;
  transcribe(capture: SpeechCapture, signal?: AbortSignal): Promise<Transcription>;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly available: boolean;
  /** Reproduce el texto. Debe resolver al terminar o al ser detenido. */
  speak(text: string, control: SpeechPlaybackControl): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  readonly paused: boolean;
}

export type SpeechPlaybackControl = {
  /** true cuando el usuario ha pedido detener/interrumpir. */
  cancelled: () => void | boolean;
  onStart?: () => void;
};

/** Error de voz con mensaje ya comprensible para el usuario. */
export class SpeechError extends Error {
  readonly code:
    | "unsupported"
    | "permission"
    | "no_microphone"
    | "empty_audio"
    | "no_speech"
    | "transcription"
    | "network"
    | "tts"
    | "cancelled";
  readonly retryable: boolean;

  constructor(code: SpeechError["code"], message: string, retryable = false) {
    super(message);
    this.name = "SpeechError";
    this.code = code;
    this.retryable = retryable;
  }
}
