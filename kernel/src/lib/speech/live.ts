/**
 * KERNEL SPEECH ENGINE — transcripción provisional en tiempo real.
 *
 * Usa el reconocimiento nativo del navegador (local, sin enviar audio a ningún
 * servicio) SOLO para mostrar texto provisional mientras el usuario habla. La
 * transcripción FINAL siempre la produce el SpeechToTextProvider.
 */

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function liveTranscriptSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/** Escucha provisional. Devuelve una función para detenerla. */
export function startLiveTranscript(
  onPartial: (text: string) => void,
  lang?: string,
): () => void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return () => {};
  let stopped = false;
  let recognition: RecognitionLike | null = null;

  const run = () => {
    if (stopped) return;
    const r = new Ctor();
    recognition = r;
    // Sin idioma fijo cuando el navegador puede deducirlo del sistema.
    r.lang = lang ?? navigator.language ?? "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      onPartial(text.trim());
    };
    r.onerror = () => {};
    r.onend = () => {
      if (!stopped) run(); // el navegador corta cada pocos segundos
    };
    try {
      r.start();
    } catch {
      /* ya estaba activo */
    }
  };

  run();

  return () => {
    stopped = true;
    try {
      recognition?.abort();
    } catch {
      /* nada */
    }
    recognition = null;
  };
}
