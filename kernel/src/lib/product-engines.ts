/** Registro de las dos funciones principales de KERNEL. */
export type ProductEngineId = "chat-general" | "mode-police";
export type ProductModelAvailability = "browser-ready" | "webllm-ready";
export type ProductEngine = {
  id: ProductEngineId;
  label: string;
  code: string;
  modelLabel: string;
  nativeModelId: "llama-3.2-3b" | null;
  availability: ProductModelAvailability;
  openPath: "/chat" | "/analisis";
  notes: string;
  vramRequiredMB: number | null;
};

export const CHAT_GENERAL_ENGINE: ProductEngine = {
  id: "chat-general",
  label: "CHAT GENERAL",
  code: "GE-01",
  modelLabel: "Qwen3.5-2B rápido · Q4_K_M (4B opcional)",
  nativeModelId: null,
  availability: "browser-ready",
  openPath: "/chat",
  notes: "Inferencia local en el navegador mediante WebAssembly y WebGPU cuando está disponible. No requiere proveedor de inferencia externo.",
  vramRequiredMB: null,
};

export const MODE_POLICE_ENGINE: ProductEngine = {
  id: "mode-police",
  label: "POLICE MODE",
  code: "PE-01",
  modelLabel: "Llama 3.2 3B · q4f32_1",
  nativeModelId: "llama-3.2-3b",
  availability: "webllm-ready",
  openPath: "/analisis",
  notes: "Modelo MLC ejecutado en el navegador. Los detectores especializados Horizon, MrBERT, Grooming y PaxmodGuard requieren el servicio Police Engine configurado.",
  vramRequiredMB: 2951.51,
};
export const PRODUCT_ENGINES: readonly ProductEngine[] = [CHAT_GENERAL_ENGINE, MODE_POLICE_ENGINE] as const;
export function getProductEngine(id: ProductEngineId): ProductEngine {
  const engine = PRODUCT_ENGINES.find((entry) => entry.id === id);
  if (!engine) throw new Error(`Motor de producto desconocido: ${id}`);
  return engine;
}
