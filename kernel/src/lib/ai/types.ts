/**
 * KERNEL AI ENGINE — contratos comunes.
 *
 * Todas las capas del motor (AI Core, Orchestrator, Model Manager, Inference
 * Engine, Workers, Tools, Connector) hablan con estos tipos. Cambiar de modelo o
 * de backend no obliga a tocar la interfaz de KERNEL.
 */

export type ChatRole = "system" | "user" | "assistant";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string; mediaType: string };

export type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: MessagePart[];
};

export type InferenceConfig = {
  maxNewTokens: number;
  temperature: number;
  topP: number;
  /** Presupuesto de contexto en tokens aproximados. */
  contextTokens: number;
  /** Precisión con la que se cargan los pesos (transformers.js). */
  dtype: "q4f16" | "q4" | "int8" | "fp16" | "fp32";
  device: "webgpu" | "wasm";
};

export type LoadStatus = "idle" | "loading" | "ready" | "error" | "unloading";

export type LoadProgress = {
  status: LoadStatus;
  /** 0–1 cuando el backend lo conoce; null cuando no es medible. */
  fraction: number | null;
  bytesLoaded: number | null;
  bytesTotal: number | null;
  file: string | null;
};

export type StreamEvent =
  | { type: "start"; requestId: string }
  | { type: "token"; requestId: string; token: string }
  | { type: "complete"; requestId: string; text: string; tokensGenerated: number; elapsedMs: number }
  | { type: "cancelled"; requestId: string }
  | { type: "error"; requestId: string; message: string; code: KernelErrorCode };

export type KernelErrorCode =
  | "webgpu-unavailable"
  | "out-of-memory"
  | "download-failed"
  | "model-unavailable"
  | "worker-failed"
  | "cancelled"
  | "network"
  | "unauthorized"
  | "validation"
  | "connector-unavailable"
  | "unknown";

/** Capacidades reales del dispositivo. `estimado` marca lo que NO es medición directa. */
export type HardwareCapabilities = {
  webgpu: {
    disponible: boolean;
    adaptador: string | null;
    vendor: string | null;
    arquitectura: string | null;
    maxBufferBytes: number | null;
    maxStorageBufferBytes: number | null;
    fp16: boolean;
    motivo: string | null;
  };
  cpu: { hilos: number | null; estimado: boolean };
  memoria: { deviceMemoryGB: number | null; jsHeapLimitBytes: number | null; estimado: boolean };
  almacenamiento: { cuotaBytes: number | null; usadoBytes: number | null };
  navegador: {
    userAgent: string;
    movil: boolean;
    wasm: boolean;
    simd: boolean;
    sharedArrayBuffer: boolean;
    workers: boolean;
    cacheApi: boolean;
  };
  medidoEn: number;
};

export type HardwareTier = "alto" | "medio" | "bajo" | "minimo";

export type ModelKind = "text" | "vision";

export type ModelDescriptor = {
  id: string;
  label: string;
  kind: ModelKind;
  /** Repositorio de Hugging Face con export ONNX (transformers.js). */
  repo: string;
  /** Tamaño aproximado de descarga en bytes (dato del repositorio, no medición local). */
  approxBytes: number;
  contextTokens: number;
  /** Requisitos mínimos razonables para intentar la carga. */
  minMemoryGB: number;
  dtype: InferenceConfig["dtype"];
  device: InferenceConfig["device"];
  /** Nivel de hardware a partir del cual el Adaptation Engine lo recomienda. */
  tiers: HardwareTier[];
  notas: string;
};

export type ModelState = {
  id: string;
  status: LoadStatus;
  progress: LoadProgress;
  error: string | null;
};

export type EnginePhase =
  | "inactivo"
  | "detectando-hardware"
  | "preparando-modelo"
  | "listo"
  | "procesando"
  | "error";

export type EngineStatus = {
  phase: EnginePhase;
  mensaje: string;
  backend: string | null;
  backendKind: "local" | "remote" | null;
  modelo: string | null;
  modeloListo: boolean;
  hardware: HardwareCapabilities | null;
  tier: HardwareTier | null;
  config: InferenceConfig | null;
  error: string | null;
};
