import { Mic, Pause, Play, RotateCcw, Square, VolumeX, Volume2 } from "lucide-react";

import voiceIcon from "@/assets/kernel-voice.png.asset.json";
import type { VoiceState } from "@/lib/kernel-voice";
import type { VoiceOption } from "@/lib/speech/voices";

const LABEL: Record<VoiceState, string> = {
  idle: "KERNEL VOICE",
  listening: "ESCUCHANDO...",
  processing_audio: "PREPARANDO AUDIO...",
  transcribing: "TRANSCRIBIENDO...",
  transcription_ready: "TRANSCRIPCIÓN LISTA",
  sending: "ENVIANDO...",
  thinking: "K.E.R.N.E.L ESTÁ PENSANDO...",
  speaking: "K.E.R.N.E.L ESTÁ HABLANDO...",
  error: "ERROR DE VOZ",
  cancelled: "CANCELADO",
};

export function KernelVoiceButton({
  state,
  enabled,
  paused,
  supported,
  level = 0,
  partial,
  transcript,
  error,
  canRetry,
  voices = [],
  voiceId = "",
  onChooseVoice,
  onRetry,
  onToggleListening,
  onCancelListening,
  onToggleEnabled,
  onPause,
  onStop,
}: {
  state: VoiceState;
  enabled: boolean;
  paused: boolean;
  supported: boolean;
  level?: number;
  partial?: string;
  transcript?: string;
  error?: string;
  canRetry?: boolean;
  voices?: VoiceOption[];
  voiceId?: string;
  onChooseVoice?: (uri: string) => void;
  onRetry?: () => void;
  onToggleListening: () => void;
  onCancelListening?: () => void;
  onToggleEnabled: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  if (!supported) {
    return (
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        KERNEL VOICE no disponible en este navegador · chat de texto operativo
      </p>
    );
  }

  const listening = state === "listening";
  const trabajando = state === "processing_audio" || state === "transcribing";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleListening}
          aria-label={listening ? "Detener KERNEL VOICE" : "Iniciar KERNEL VOICE"}
          aria-pressed={listening}
          disabled={trabajando}
          className="relative shrink-0 rounded-full transition-transform disabled:opacity-60"
        >
          {listening && (
            <span
              className="absolute inset-0 rounded-full ring-2 ring-[#00FF66] kernel-pulse"
              style={{ transform: `scale(${1 + Math.min(0.35, level * 0.35)})` }}
            />
          )}
          <img
            src={voiceIcon.url}
            alt=""
            className={`size-11 rounded-full ${listening ? "" : "opacity-90"}`}
            style={listening ? { filter: "drop-shadow(0 0 6px #00FF66)" } : undefined}
          />
        </button>

        <button
          type="button"
          onClick={onToggleListening}
          disabled={trabajando}
          className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {listening ? <Square className="size-3" /> : <Mic className="size-3" />}
          {listening ? "detener" : "hablar"}
        </button>

        {listening && onCancelListening && (
          <button
            type="button"
            onClick={onCancelListening}
            className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
          >
            cancelar
          </button>
        )}

        <span
          className="text-[10px] uppercase tracking-[0.3em]"
          style={{ color: state === "idle" ? undefined : "#00FF66" }}
        >
          {LABEL[state]}
        </span>

        {state === "speaking" && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPause}
              aria-label={paused ? "Reproducir voz" : "Pausar voz"}
              className="border border-border p-1 text-muted-foreground hover:text-primary"
            >
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </button>
            <button
              type="button"
              onClick={onStop}
              aria-label="Detener voz"
              className="border border-border p-1 text-muted-foreground hover:text-destructive"
            >
              <Square className="size-3" />
            </button>
          </span>
        )}

        <button
          type="button"
          onClick={onToggleEnabled}
          aria-label={enabled ? "Silenciar la voz de K.E.R.N.E.L" : "Activar la voz de K.E.R.N.E.L"}
          className="ml-auto border border-border p-1 text-muted-foreground hover:text-primary"
        >
          {enabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </button>
      </div>

      {voices.length > 0 && onChooseVoice && (
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          voz
          <select
            value={voiceId}
            onChange={(e) => onChooseVoice(e.target.value)}
            className="min-w-0 flex-1 border border-border bg-card px-2 py-1 text-[11px] normal-case tracking-normal text-foreground"
          >
            <option value="">Voz de K.E.R.N.E.L (recomendada)</option>
            {voices.map((v) => (
              <option key={v.uri} value={v.uri}>
                {v.nombre} · {v.idioma}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div className="flex items-center gap-2 border border-destructive/60 bg-card px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-destructive">{error}</span>
          {canRetry && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto flex items-center gap-1 border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              <RotateCcw className="size-3" /> reintentar
            </button>
          )}
        </div>
      )}

      {!error && (partial || transcript) && (
        <p className="border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
          <span className="mr-2 text-[9px] uppercase tracking-widest text-primary">
            {transcript ? "transcripción:" : "escuchando:"}
          </span>
          {transcript || partial}
        </p>
      )}
    </div>
  );
}
