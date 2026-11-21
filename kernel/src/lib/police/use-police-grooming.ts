/**
 * Hook KERNEL → detector de grooming (Police Engine local).
 * No toca Chat General ni sus conversaciones.
 */
import { useCallback, useRef, useState } from "react";

import {
  policeAnalyze,
  policeHealth,
  policeLoad,
  policeUnload,
  isPoliceEngineConfigured,
  PoliceEngineUnavailableError,
} from "@/lib/police/client";
import type { PoliceAnalysisResult } from "@/lib/police/types";

export const GROOMING_DETECTOR_ID = "grooming-xlm-roberta-es-en" as const;

export type GroomingPhase =
  | "idle"
  | "checking_engine"
  | "loading"
  | "inferring"
  | "done"
  | "error";

function combineConversation(pasted: string, transcript: string): string {
  const a = pasted.trim();
  const b = transcript.trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}\n\n${b}`;
}

export function usePoliceGrooming() {
  const [result, setResult] = useState<PoliceAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<GroomingPhase>("idle");
  const [backendNote, setBackendNote] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const inFlight = useRef(false);
  const configured = isPoliceEngineConfigured();

  const reset = useCallback(() => {
    setResult(null);
    setError("");
    setBackendNote("");
    setModelVersion("");
    setPhase("idle");
  }, []);

  const unload = useCallback(async () => {
    if (!isPoliceEngineConfigured()) return;
    try {
      await policeUnload(GROOMING_DETECTOR_ID);
    } catch {
      /* motor puede estar caído */
    }
  }, []);

  const runGrooming = useCallback(async (pasted: string, transcript = "") => {
    if (inFlight.current) {
      setError("Ya hay un análisis de grooming en curso. Espera a que termine.");
      return null;
    }
    setError("");
    setResult(null);
    if (!isPoliceEngineConfigured()) {
      const message = "Grooming automático pendiente: no existe un servicio público Police Engine conectado. No se ha ejecutado ningún detector ni se ha calculado una puntuación. Usa el chat Police Mode con Llama 3B para analizar el texto.";
      setOnline(false);
      setError(message);
      setPhase("error");
      return null;
    }
    setBackendNote("");
    setModelVersion("");
    const t = combineConversation(pasted, transcript);
    if (!t) {
      setError("Sin conversación para el detector de grooming. Aporta texto o transcripción.");
      setPhase("error");
      return null;
    }
    inFlight.current = true;
    setBusy(true);
    setPhase("checking_engine");
    try {
      const ok = await policeHealth();
      setOnline(ok);
      if (!ok) {
        throw new PoliceEngineUnavailableError(
          "El detector Grooming requiere el servicio público Police Engine. En este despliegue no está conectado, por lo que no se ha ejecutado ni se ha generado una puntuación. El análisis conversacional local sigue disponible.",
        );
      }
      setPhase("loading");
      const loaded = await policeLoad(GROOMING_DETECTOR_ID, true);
      if (!loaded.loaded) {
        throw new Error(
          loaded.error ||
            "Grooming detector no cargó. Genera el checkpoint experimental o el fine-tune XLM-R.",
        );
      }
      const notes = loaded.notes ?? [];
      const note =
        notes.find((n) => /backend/i.test(n)) ||
        notes.find((n) => /experimental/i.test(n)) ||
        "";
      setBackendNote(note);
      setModelVersion(loaded.version || "");
      setPhase("inferring");
      const analysis = await policeAnalyze({
        detector: GROOMING_DETECTOR_ID,
        text: t,
      });
      setResult(analysis);
      setModelVersion(analysis.model_version || loaded.version || "");
      if (analysis.state !== "ok") {
        setError(analysis.error || `Estado: ${analysis.state}`);
        setPhase("error");
      } else {
        setPhase("done");
      }
      return analysis;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error del detector de grooming.";
      setError(msg);
      setResult(null);
      setPhase("error");
      if (e instanceof PoliceEngineUnavailableError) setOnline(false);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return {
    result,
    error,
    busy,
    online,
    phase,
    backendNote,
    modelVersion,
    runGrooming,
    reset,
    unload,
    detectorId: GROOMING_DETECTOR_ID,
    configured,
  };
}
