/**
 * Catálogo de modelos WebLLM / MLC disponibles en KERNEL.
 *
 * Datos puros, sin importar WebLLM: seguro para SSR. Los `mlcModelId`, fuentes
 * y librerías coinciden con `prebuiltAppConfig` de @mlc-ai/web-llm 0.2.79 (la
 * versión que usa K.ENGINE); `catalog.test.ts` lo comprueba. Llama 3B usa q4f32_1
 * para evitar depender de shaders FP16 en GPUs/navegadores problemáticos.
 */
export const WEBLLM_VERSION = "0.2.79";
const LIB_PREFIX = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/";

export type NativeModel = {
  id: "qwen2.5-0.5b" | "llama-3.2-1b" | "qwen2.5-1.5b" | "llama-3.2-3b";
  label: string;
  mlcModelId: string;
  source: string;
  modelLib: string;
  vramRequiredMB: number;
};

export const NATIVE_MODELS: readonly NativeModel[] = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B",
    mlcModelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    source: "https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    modelLib: `${LIB_PREFIX}Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
    vramRequiredMB: 944.62,
  },
  {
    id: "llama-3.2-1b",
    label: "Llama 3.2 1B",
    mlcModelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    source: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
    modelLib: `${LIB_PREFIX}Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
    vramRequiredMB: 879.04,
  },
  {
    id: "qwen2.5-1.5b",
    label: "Qwen 2.5 1.5B",
    mlcModelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    source: "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    modelLib: `${LIB_PREFIX}Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
    vramRequiredMB: 1629.75,
  },
  {
    id: "llama-3.2-3b",
    label: "Llama 3.2 3B",
    mlcModelId: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    source: "https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC",
    modelLib: `${LIB_PREFIX}Llama-3.2-3B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm`,
    vramRequiredMB: 2951.51,
  },
];

export const FIRST_TEST_MODEL_ID: NativeModel["id"] = "llama-3.2-3b";

export function getNativeModel(id: string): NativeModel | null {
  return NATIVE_MODELS.find((m) => m.id === id) ?? null;
}
