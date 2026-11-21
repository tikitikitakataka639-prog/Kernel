/**
 * KERNEL SPEECH ENGINE — catálogo de voces del navegador.
 *
 * Enumera las voces TTS del dispositivo, prioriza español serio y natural,
 * guarda la preferencia del usuario y elige alternativa cuando la voz elegida
 * no está instalada en el móvil.
 */

export type VoiceOption = { uri: string; nombre: string; idioma: string };

const STORAGE_KEY = "kernel.voice.preferencia";

/** Voces que suelen sonar serias y naturales en español (móvil incluido). */
const PREFERIDAS = [
  "monica",
  "paulina",
  "jorge",
  "diego",
  "google español",
  "microsoft alvaro",
  "microsoft elvira",
  "spanish",
];

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Las voces llegan de forma asíncrona en móvil: espera hasta que existan. */
export async function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSynthesisSupported()) return [];
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return now;
  return new Promise((resolve) => {
    const done = (list: SpeechSynthesisVoice[]) => {
      synth.onvoiceschanged = null;
      clearTimeout(timer);
      resolve(list);
    };
    const timer = setTimeout(() => done(synth.getVoices()), timeoutMs);
    synth.onvoiceschanged = () => {
      const list = synth.getVoices();
      if (list.length > 0) done(list);
    };
  });
}

/** Solo voces útiles: español primero, luego el resto. */
export function listVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    const es = v.lang.toLowerCase().startsWith("es");
    const idx = PREFERIDAS.findIndex((p) => name.includes(p));
    return (es ? 0 : 100) + (idx === -1 ? 50 : idx) + (v.lang.toLowerCase() === "es-es" ? -5 : 0);
  };
  return [...voices]
    .sort((a, b) => score(a) - score(b))
    .map((v) => ({ uri: v.voiceURI, nombre: v.name, idioma: v.lang }));
}

export function readVoicePreference(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveVoicePreference(uri: string): void {
  if (typeof window === "undefined") return;
  try {
    if (uri) window.localStorage.setItem(STORAGE_KEY, uri);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Devuelve la voz elegida; si no está en este dispositivo, la mejor alternativa
 * en español y, en último caso, la voz por defecto del sistema.
 */
export function resolveVoice(
  voices: SpeechSynthesisVoice[],
  preferida: string,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const exacta = voices.find((v) => v.voiceURI === preferida);
  if (exacta) return exacta;
  const ordenadas = listVoiceOptions(voices);
  const mejor = ordenadas[0];
  return voices.find((v) => v.voiceURI === mejor?.uri) ?? voices[0] ?? null;
}

/**
 * Desbloquea el audio en móvil: hay que hacerlo dentro de un gesto del usuario
 * o el navegador silencia la primera reproducción (también por Bluetooth).
 */
export function unlockSpeech(): void {
  if (!speechSynthesisSupported()) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume();
    const ping = new SpeechSynthesisUtterance(" ");
    ping.volume = 0;
    ping.lang = "es-ES";
    synth.speak(ping);
  } catch {
    /* nada */
  }
}
