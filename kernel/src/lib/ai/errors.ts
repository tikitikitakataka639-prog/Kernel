/**
 * ERROR MANAGER — clasificación única de errores del motor.
 * Nada se traga en silencio: cada fallo sale con código y mensaje en castellano.
 */
import type { KernelErrorCode } from "@/lib/ai/types";

export type ClassifiedError = { code: KernelErrorCode; message: string; original: unknown };

export class KernelEngineError extends Error {
  readonly code: KernelErrorCode;
  constructor(code: KernelErrorCode, message: string) {
    super(message);
    this.name = "KernelEngineError";
    this.code = code;
  }
}

const PATRONES: Array<{ code: KernelErrorCode; test: RegExp; message: string }> = [
  {
    code: "cancelled",
    test: /abort|cancel/i,
    message: "Operación cancelada.",
  },
  {
    code: "out-of-memory",
    test: /out of memory|oom|allocation failed|memoria/i,
    message: "Memoria insuficiente para este modelo. Prueba con un modelo más ligero.",
  },
  {
    code: "webgpu-unavailable",
    test: /webgpu|gpuadapter|no available adapter|device lost/i,
    message: "WebGPU no está disponible o el dispositivo GPU se ha perdido.",
  },
  {
    code: "download-failed",
    test: /failed to fetch|networkerror|load model|404|onnx|unable to load/i,
    message: "No se ha podido descargar el modelo. Comprueba la conexión.",
  },
  {
    code: "worker-failed",
    test: /worker/i,
    message: "El worker del motor ha fallado.",
  },
  {
    code: "network",
    test: /network|timeout|econn/i,
    message: "Fallo de red.",
  },
];

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof KernelEngineError) {
    return { code: error.code, message: error.message, original: error };
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return { code: "cancelled", message: "Operación cancelada.", original: error };
  }
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  for (const p of PATRONES) {
    if (p.test.test(raw)) return { code: p.code, message: `${p.message} (${raw})`, original: error };
  }
  return { code: "unknown", message: raw || "Error desconocido en el motor.", original: error };
}
