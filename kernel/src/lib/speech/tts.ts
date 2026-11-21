/**
 * KERNEL SPEECH ENGINE — TextToSpeechProvider.
 *
 * TextToSpeechProvider
 *   ├── ExternalTextToSpeechProvider  (voz de KERNEL vía /api/voice/speak)
 *   └── BrowserTextToSpeechProvider   (voces del propio navegador, seleccionables)
 *
 * Reglas: una sola reproducción a la vez (nunca se solapan) y salida por el
 * dispositivo de audio activo del sistema, para que funcione con altavoz
 * Bluetooth sin configurar nada.
 */
import { SpeechError, type SpeechPlaybackControl, type TextToSpeechProvider } from "./types";
import { loadVoices, readVoicePreference, resolveVoice, speechSynthesisSupported } from "./voices";

/** Trocea el texto para empezar a hablar antes y no cortar frases. */
export function splitForSpeech(text: string, maxChars = 480): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " el enlace ")
    .replace(/[*_#>`]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?\n]+[.!?\n]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export class ExternalTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "external";
  readonly available = true;
  private audio: HTMLAudioElement | null = null;
  private stopped = false;
  private session = 0;
  paused = false;

  constructor(private readonly endpoint = "/api/voice/speak") {}

  private async fetchChunk(text: string): Promise<Blob> {
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("tts");
      return await res.blob();
    } catch {
      throw new SpeechError("tts", "La voz de KERNEL no está disponible ahora mismo.");
    }
  }

  async speak(text: string, control: SpeechPlaybackControl): Promise<void> {
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;

    // Cualquier reproducción anterior queda invalidada: nunca dos voces a la vez.
    this.stop();
    const session = ++this.session;
    this.stopped = false;
    this.paused = false;
    const vivo = () => session === this.session && !this.stopped && !control.cancelled();

    let started = false;
    // Descarga en paralelo al reproducir: menos silencios entre frases.
    let next: Promise<Blob> | null = this.fetchChunk(chunks[0]!);

    for (let i = 0; i < chunks.length; i++) {
      if (!vivo()) break;
      let blob: Blob;
      try {
        blob = await (next ?? this.fetchChunk(chunks[i]!));
      } catch (error) {
        if (started) break; // ya se ha oído algo: no molestes con un error
        throw error;
      }
      next = chunks[i + 1] ? this.fetchChunk(chunks[i + 1]!) : null;
      if (!vivo()) break;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.setAttribute("playsinline", "");
      this.audio = audio;
      if (!started) {
        started = true;
        control.onStart?.();
      }
      await new Promise<void>((resolve) => {
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          resolve();
        };
        audio.onended = end;
        audio.onerror = end;
        void audio.play().catch(end);
      });
      URL.revokeObjectURL(url);
      if (this.audio === audio) this.audio = null;
    }
    this.paused = false;
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.paused = true;
    }
  }

  resume(): void {
    if (this.audio?.paused) {
      void this.audio.play().catch(() => {});
      this.paused = false;
    }
  }

  stop(): void {
    this.stopped = true;
    this.session++;
    this.paused = false;
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
    }
  }
}

/** Voz del propio dispositivo (funciona sin red y sale por el altavoz activo). */
export class BrowserTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "browser";
  paused = false;
  private session = 0;
  /** voiceURI elegido por el usuario; vacío = alternativa automática. */
  preferencia = readVoicePreference();

  get available(): boolean {
    return speechSynthesisSupported();
  }

  async speak(text: string, control: SpeechPlaybackControl): Promise<void> {
    if (!this.available) throw new SpeechError("tts", "Tu navegador no puede leer texto en voz alta.");
    const chunks = splitForSpeech(text, 200);
    if (chunks.length === 0) return;

    this.stop();
    const session = ++this.session;
    const vivo = () => session === this.session && !control.cancelled();

    const voices = await loadVoices();
    const voice = resolveVoice(voices, this.preferencia);
    let started = false;

    for (const chunk of chunks) {
      if (!vivo()) break;
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang ?? "es-ES";
        utterance.rate = 1;
        utterance.pitch = 0.95;
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          resolve();
        };
        utterance.onend = end;
        utterance.onerror = end;
        if (!started) {
          started = true;
          control.onStart?.();
        }
        window.speechSynthesis.speak(utterance);
      });
    }
    this.paused = false;
  }

  pause(): void {
    if (this.available) {
      window.speechSynthesis.pause();
      this.paused = true;
    }
  }

  resume(): void {
    if (this.available) {
      window.speechSynthesis.resume();
      this.paused = false;
    }
  }

  stop(): void {
    this.paused = false;
    this.session++;
    if (this.available) window.speechSynthesis.cancel();
  }
}
