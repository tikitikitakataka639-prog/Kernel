/**
 * KERNEL SPEECH ENGINE — captura local de audio.
 *
 * Todo ocurre en el navegador: micrófono -> PCM -> VAD -> recorte de silencios
 * -> remuestreo con filtro -> WAV 16 kHz mono. Nada se guarda en disco ni se
 * envía a ningún sitio desde aquí; el WAV se entrega al Voice Controller y este
 * decide si lo manda al proveedor de transcripción.
 */
import { SpeechError, type SpeechCapture } from "./types";

const TARGET_RATE = 16000;
const FRAME_SIZE = 4096;

/** Umbral mínimo de energía para considerar que hay habla (RMS 0..1). */
const MIN_SPEECH_RMS = 0.014;
/** Habla acumulada mínima para molestar al STT (ms). */
export const MIN_SPEECH_MS = 320;
/** Margen de silencio que se conserva al recortar (ms). */
const PAD_MS = 350;

export type CaptureOptions = {
  /** Nivel de entrada 0..1 para la animación de onda. */
  onLevel?: (level: number) => void;
  /** true en cuanto se detecta voz por primera vez. */
  onSpeechStart?: () => void;
  /** Silencio prolongado tras hablar: fin automático (si está activado). */
  onSilence?: () => void;
  /** ms de silencio tras voz que cierran la intervención. */
  endSilenceMs?: number;
  /** Corte de seguridad. */
  maxMs?: number;
  onMaxDuration?: () => void;
};

type Frame = { data: Float32Array; speech: boolean };

function rmsOf(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / Math.max(1, frame.length));
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return all;
}

/** Remuestreo con media de ventana (paso bajo básico) para evitar aliasing. */
function resample(all: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return all;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(all.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(all.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += all[j]!;
      n++;
    }
    out[i] = n > 0 ? sum / n : 0;
  }
  return out;
}

/** Normaliza el nivel sin reventar el ruido de fondo (ganancia acotada). */
function normalize(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  if (peak < 0.001) return samples;
  const gain = Math.min(6, 0.92 / peak);
  if (gain <= 1.05) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i]! * gain));
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function captureSupported(): boolean {
  if (typeof window === "undefined") return false;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Boolean(
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" && AC,
  );
}

/** Grabadora de una intervención. Un objeto = una intervención. */
export class MicRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private frames: Frame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private noiseFloor = 0.006;
  private speechMs = 0;
  private lastSpeechAt = 0;
  private startedAt = 0;
  private speechAnnounced = false;
  private closed = false;

  constructor(private readonly options: CaptureOptions = {}) {}

  get isRecording(): boolean {
    return Boolean(this.ctx) && !this.closed;
  }

  async start(): Promise<void> {
    if (!captureSupported()) {
      throw new SpeechError(
        "unsupported",
        "Este navegador no permite grabar audio. El chat de texto sigue disponible.",
      );
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Pedimos buena calidad; el navegador ajusta a lo que soporte el equipo.
          sampleRate: 48000,
        } as MediaTrackConstraints,
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new SpeechError(
          "permission",
          "No me has dado permiso para el micrófono. Actívalo en el candado del navegador y vuelve a intentarlo.",
        );
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new SpeechError("no_microphone", "No encuentro ningún micrófono conectado.");
      }
      throw new SpeechError("no_microphone", "No he podido abrir el micrófono.");
    }

    this.stream = stream;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
    this.node = node;

    const frameMs = (FRAME_SIZE / ctx.sampleRate) * 1000;
    let calibrated = 0;
    this.startedAt = Date.now();

    node.onaudioprocess = (event) => {
      const data = new Float32Array(event.inputBuffer.getChannelData(0));
      const rms = rmsOf(data);

      // Calibración del ruido de fondo con los primeros ~400 ms.
      if (calibrated * frameMs < 400) {
        calibrated++;
        this.noiseFloor = this.noiseFloor * 0.7 + rms * 0.3;
      }

      this.options.onLevel?.(Math.min(1, rms * 8));

      const threshold = Math.max(MIN_SPEECH_RMS, this.noiseFloor * 2.6);
      const speech = rms > threshold;
      if (speech) {
        this.speechMs += frameMs;
        this.lastSpeechAt = Date.now();
        if (!this.speechAnnounced && this.speechMs >= MIN_SPEECH_MS) {
          this.speechAnnounced = true;
          this.options.onSpeechStart?.();
        }
      } else if (this.speechMs === 0) {
        // Solo silencio antes de hablar: no acumules memoria infinita.
        if (this.frames.length > Math.ceil(2500 / frameMs)) this.frames.shift();
      }
      this.frames.push({ data, speech });
    };

    this.source.connect(node);
    node.connect(ctx.destination);

    const endSilence = this.options.endSilenceMs ?? 1800;
    const maxMs = this.options.maxMs ?? 120000;
    this.timer = setInterval(() => {
      const now = Date.now();
      if (now - this.startedAt > maxMs) {
        this.options.onMaxDuration?.();
        return;
      }
      if (this.speechMs < MIN_SPEECH_MS || this.lastSpeechAt === 0) return;
      if (now - this.lastSpeechAt > endSilence) this.options.onSilence?.();
    }, 200);
  }

  /** Corta el micrófono y devuelve el WAV recortado. */
  finish(): SpeechCapture {
    const rate = this.ctx?.sampleRate ?? TARGET_RATE;
    const frames = this.frames;
    const speechMs = this.speechMs;
    this.dispose();

    if (speechMs < MIN_SPEECH_MS) {
      throw new SpeechError("no_speech", "No he detectado voz. Prueba a hablar un poco más cerca.");
    }

    const first = frames.findIndex((f) => f.speech);
    let last = -1;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i]!.speech) {
        last = i;
        break;
      }
    }
    const frameMs = ((frames[0]?.data.length ?? FRAME_SIZE) / rate) * 1000;
    const padding = Math.max(1, Math.round(PAD_MS / Math.max(1, frameMs)));
    const from = Math.max(0, first - padding);
    const to = Math.min(frames.length, last + padding + 1);
    const useful = frames.slice(from, to).map((f) => f.data);

    const samples = normalize(resample(concat(useful), rate, TARGET_RATE));
    if (samples.length < TARGET_RATE * 0.2) {
      throw new SpeechError("empty_audio", "La grabación ha salido vacía. Inténtalo otra vez.");
    }
    return {
      blob: encodeWav(samples, TARGET_RATE),
      sampleRate: TARGET_RATE,
      speechMs,
      durationMs: (samples.length / TARGET_RATE) * 1000,
    };
  }

  /** Cancela sin producir audio. */
  cancel(): void {
    this.frames = [];
    this.dispose();
  }

  private dispose(): void {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.node) {
      this.node.onaudioprocess = null;
      this.node.disconnect();
      this.node = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close().catch(() => {});
    this.frames = this.frames.slice();
  }
}
