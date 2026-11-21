/**
 * KERNEL VOICE — Voice Controller.
 *
 * Chat Normal -> Voice Controller -> Speech Engine (STT / TTS) -> KERNEL AI ENGINE
 *
 * El chat no conoce ningún proveedor: solo usa este controlador. La captura es
 * local (src/lib/speech/capture.ts), el texto provisional lo genera el navegador
 * (src/lib/speech/live.ts) y la transcripción final la firma el
 * SpeechToTextProvider activo. Nada de audio se guarda: los buffers viven en
 * memoria y se sueltan al terminar cada intervención.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MicRecorder, captureSupported } from "@/lib/speech/capture";
import { liveTranscriptSupported, startLiveTranscript } from "@/lib/speech/live";
import { createSpeechToTextProvider } from "@/lib/speech/stt";
import {
  BrowserTextToSpeechProvider,
  ExternalTextToSpeechProvider,
  splitForSpeech,
} from "@/lib/speech/tts";
import {
  listVoiceOptions,
  loadVoices,
  readVoicePreference,
  saveVoicePreference,
  unlockSpeech,
  type VoiceOption,
} from "@/lib/speech/voices";
import { SpeechError, type SpeechCapture, type VoiceState } from "@/lib/speech/types";

export type { VoiceState } from "@/lib/speech/types";
export { splitForSpeech };

export function voiceSupported(): boolean {
  return captureSupported();
}

export function useKernelVoice({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState("");
  const [draft, setDraft] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [autoStop, setAutoStop] = useState(true);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("");

  const stt = useMemo(() => createSpeechToTextProvider(), []);
  const tts = useMemo(() => {
    const external = new ExternalTextToSpeechProvider();
    return { primary: external, fallback: new BrowserTextToSpeechProvider() };
  }, []);

  // Catálogo de voces del dispositivo + preferencia guardada.
  useEffect(() => {
    let vivo = true;
    const guardada = readVoicePreference();
    setVoiceId(guardada);
    tts.fallback.preferencia = guardada;
    void loadVoices().then((list) => {
      if (vivo) setVoices(listVoiceOptions(list));
    });
    return () => {
      vivo = false;
    };
  }, [tts]);

  /** "" = voz propia de KERNEL; cualquier otro valor = voz del dispositivo. */
  const chooseVoice = useCallback(
    (uri: string) => {
      setVoiceId(uri);
      saveVoicePreference(uri);
      tts.fallback.preferencia = uri;
    },
    [tts],
  );


  const recorderRef = useRef<MicRecorder | null>(null);
  const stopLiveRef = useRef<() => void>(() => {});
  const captureRef = useRef<SpeechCapture | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelSpeechRef = useRef(false);
  const spokenRef = useRef<Set<string>>(new Set());
  const lastSpokenTextRef = useRef("");
  const activeTtsRef = useRef(tts.primary as { pause(): void; resume(): void; stop(): void });
  const finishRef = useRef<() => void>(() => {});
  const speakSessionRef = useRef(0);
  const sendRef = useRef<(text: string) => void>(() => {});
  const lastSentRef = useRef("");
  const autoStopRef = useRef(autoStop);
  autoStopRef.current = autoStop;

  const fail = useCallback(
    (error: unknown, retryable = false) => {
      const message =
        error instanceof SpeechError
          ? error.message
          : "Algo ha fallado con la voz. Puedes seguir escribiendo.";
      setVoiceError(message);
      setCanRetry(retryable || (error instanceof SpeechError && error.retryable));
      setState("error");
      onError(message);
    },
    [onError],
  );

  const clearVoiceError = useCallback(() => {
    setVoiceError("");
    setCanRetry(false);
    setState((s) => (s === "error" || s === "cancelled" ? "idle" : s));
  }, []);

  // ---------------------------------------------------------------- TTS -----
  const stopAudio = useCallback(() => {
    cancelSpeechRef.current = true;
    speakSessionRef.current++;
    tts.primary.stop();
    tts.fallback.stop();
    setPaused(false);
    setState((s) => (s === "speaking" ? "idle" : s));
  }, [tts]);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      // Una sola voz a la vez: lo anterior se corta antes de empezar.
      tts.primary.stop();
      tts.fallback.stop();
      const session = ++speakSessionRef.current;
      lastSpokenTextRef.current = text;
      cancelSpeechRef.current = false;
      const control = {
        cancelled: () => cancelSpeechRef.current || session !== speakSessionRef.current,
        onStart: () => setState("speaking"),
      };
      // Voz del dispositivo si el usuario ha elegido una; si no, la de KERNEL.
      const usaDispositivo = Boolean(voiceId) && tts.fallback.available;
      const primary = usaDispositivo ? tts.fallback : tts.primary;
      const fallback = usaDispositivo ? tts.primary : tts.fallback;
      try {
        activeTtsRef.current = primary;
        await primary.speak(text, control);
      } catch {
        if (control.cancelled()) return;
        if (fallback.available) {
          try {
            activeTtsRef.current = fallback;
            await fallback.speak(text, control);
          } catch (error) {
            fail(error);
            return;
          }
        } else {
          fail(new SpeechError("tts", "La voz de KERNEL no está disponible ahora mismo."));
          return;
        }
      } finally {
        if (session === speakSessionRef.current) {
          setPaused(false);
          setState((s) => (s === "speaking" ? "idle" : s));
        }
      }
    },
    [fail, tts, voiceId],
  );

  const pause = useCallback(() => {
    const provider = activeTtsRef.current;
    setPaused((was) => {
      if (was) provider.resume();
      else provider.pause();
      return !was;
    });
  }, []);

  const replay = useCallback(() => {
    const text = lastSpokenTextRef.current;
    if (!text) return;
    stopAudio();
    void speak(text);
  }, [speak, stopAudio]);

  /** Lee una respuesta de KERNEL una sola vez (si la voz está activa). */
  const announce = useCallback(
    (id: string, text: string) => {
      if (!enabled || !text.trim() || spokenRef.current.has(id)) return;
      spokenRef.current.add(id);
      void speak(text);
    },
    [enabled, speak],
  );

  // ---------------------------------------------------------------- STT -----
  const transcribe = useCallback(
    async (capture: SpeechCapture) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState("transcribing");
      setVoiceError("");
      setCanRetry(false);
      try {
        const result = await stt.transcribe(capture, controller.signal);
        if (controller.signal.aborted) return;
        if (!result.text || !result.confident) {
          setVoiceError("No he entendido bien esa parte. ¿Puedes repetirlo?");
          setCanRetry(true);
          setState("error");
          return;
        }
        setDraft(result.text);
        setPartial("");
        setState("transcription_ready");
        // Envío directo: en móvil no hay que tocar nada más. Nunca dos veces
        // el mismo texto (evita respuestas duplicadas).
        if (result.text !== lastSentRef.current) sendRef.current(result.text);
      } catch (error) {
        if (error instanceof SpeechError && error.code === "cancelled") return;
        fail(error, true);
      } finally {
        abortRef.current = null;
      }
    },
    [fail, stt],
  );

  const retry = useCallback(() => {
    const capture = captureRef.current;
    if (!capture) {
      clearVoiceError();
      return;
    }
    void transcribe(capture);
  }, [clearVoiceError, transcribe]);

  // ----------------------------------------------------------- Grabación ----
  const finishListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    stopLiveRef.current();
    stopLiveRef.current = () => {};
    setLevel(0);
    setState("processing_audio");
    try {
      const capture = recorder.finish();
      captureRef.current = capture;
      void transcribe(capture);
    } catch (error) {
      captureRef.current = null;
      setPartial("");
      fail(error);
    }
  }, [fail, transcribe]);

  finishRef.current = finishListening;

  const cancelListening = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    recorder?.cancel();
    stopLiveRef.current();
    stopLiveRef.current = () => {};
    abortRef.current?.abort();
    abortRef.current = null;
    captureRef.current = null;
    setLevel(0);
    setPartial("");
    setDraft("");
    setVoiceError("");
    setCanRetry(false);
    setState("cancelled");
    setTimeout(() => setState((s) => (s === "cancelled" ? "idle" : s)), 900);
  }, []);

  const startListening = useCallback(async () => {
    if (recorderRef.current) return;
    // Gesto del usuario: aprovechamos para desbloquear el audio del móvil
    // (necesario para que suene por el altavoz Bluetooth a la primera).
    unlockSpeech();
    setEnabled(true);
    // Interrupción: si KERNEL está hablando, se calla y escucha.
    stopAudio();
    setPartial("");
    setDraft("");
    setVoiceError("");
    setCanRetry(false);
    captureRef.current = null;

    const recorder = new MicRecorder({
      onLevel: (value) => setLevel(value),
      onSilence: () => {
        if (autoStopRef.current) finishRef.current();
      },
      onMaxDuration: () => finishRef.current(),
      endSilenceMs: 1300,
      maxMs: 120000,
    });
    try {
      await recorder.start();
    } catch (error) {
      fail(error);
      return;
    }
    recorderRef.current = recorder;
    setState("listening");
    if (liveTranscriptSupported()) {
      stopLiveRef.current = startLiveTranscript((text) => setPartial(text));
    }
  }, [fail, stopAudio]);

  const toggleListening = useCallback(() => {
    if (state === "listening") finishListening();
    else if (state === "idle" || state === "error" || state === "cancelled") void startListening();
  }, [finishListening, startListening, state]);

  // ------------------------------------------------------------- Envío ------
  const sendDraft = useCallback(
    (text?: string) => {
      const value = (text ?? draft).trim();
      if (!value) return;
      captureRef.current = null;
      setState("sending");
      setDraft("");
      setPartial("");
      lastSentRef.current = value;
      onTranscript(value);
      setState("thinking");
    },
    [draft, onTranscript],
  );

  sendRef.current = sendDraft;

  const discardDraft = useCallback(() => {
    captureRef.current = null;
    setDraft("");
    setPartial("");
    setState("idle");
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    stopAudio();
  }, [stopAudio]);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      stopLiveRef.current();
      abortRef.current?.abort();
      tts.primary.stop();
      tts.fallback.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    // Salida de voz
    enabled,
    setEnabled: (value: boolean) => (value ? setEnabled(true) : disable()),
    paused,
    pause,
    stopAudio,
    replay,
    speak,
    announce,
    markSpoken: (id: string) => spokenRef.current.add(id),
    // Entrada de voz
    state,
    setState,
    level,
    partial,
    draft,
    setDraft,
    autoStop,
    setAutoStop,
    startListening,
    stopListening: finishListening,
    cancelListening,
    toggleListening,
    sendDraft,
    discardDraft,
    // Diagnóstico
    voiceError,
    canRetry,
    clearVoiceError,
    retry,
    // Voces disponibles ("" = voz propia de KERNEL)
    voices,
    voiceId,
    chooseVoice,
    supported: captureSupported(),
    liveSupported: liveTranscriptSupported(),
    provider: stt.id,
  };
}
