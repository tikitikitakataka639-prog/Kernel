/**
 * Hook de integración mínima con Horizon en ANÁLISIS.
 * No toca chat, puente ni /api/chat.
 */
import { useCallback, useState } from "react";

import {
  policeAnalyze,
  policeHealth,
  policeLoad,
  PoliceEngineUnavailableError,
} from "@/lib/police/client";
import type { PoliceAnalysisResult } from "@/lib/police/types";

export function usePoliceHorizon() {
  const [result, setResult] = useState<PoliceAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);

  const runHorizon = useCallback(async (text: string) => {
    setError("");
    setResult(null);
    const t = text.trim();
    if (!t) {
      setError("Sin texto para el motor policial.");
      return null;
    }
    setBusy(true);
    try {
      const ok = await policeHealth();
      setOnline(ok);
      if (!ok) {
        throw new PoliceEngineUnavailableError();
      }
      const loaded = await policeLoad("horizon", true);
      if (!loaded.loaded) {
        throw new Error(loaded.error || "Horizon no cargó.");
      }
      const analysis = await policeAnalyze({ detector: "horizon", text: t });
      setResult(analysis);
      if (analysis.state !== "ok") {
        setError(analysis.error || `Estado: ${analysis.state}`);
      }
      return analysis;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error del motor policial.";
      setError(msg);
      setResult(null);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { result, error, busy, online, runHorizon };
}
