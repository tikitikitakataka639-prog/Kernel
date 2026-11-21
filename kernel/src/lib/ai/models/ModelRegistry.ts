/**
 * MODEL REGISTRY — catálogo de modelos que KERNEL puede ejecutar.
 *
 * Añadir un modelo nuevo = añadir una entrada aquí. Ni el motor, ni el Model
 * Manager, ni el Inference Engine, ni la interfaz se tocan.
 *
 * Todos los repos son exports ONNX ejecutables por transformers.js en el
 * navegador (WebGPU cuando hay, WASM cuando no).
 */
import type { HardwareTier, ModelDescriptor, ModelKind } from "@/lib/ai/types";

export const MODEL_REGISTRY: ModelDescriptor[] = [
  {
    id: "smollm2-360m",
    label: "SmolLM2 360M Instruct (ultraligero)",
    kind: "text",
    repo: "HuggingFaceTB/SmolLM2-360M-Instruct",
    approxBytes: 280 * 1024 * 1024,
    contextTokens: 2048,
    minMemoryGB: 2,
    dtype: "q4f16",
    device: "webgpu",
    tiers: ["minimo", "bajo", "medio", "alto"],
    notas: "Modelo de respaldo para equipos limitados o sin WebGPU (cae a WASM).",
  },
  {
    id: "qwen25-05b",
    label: "Qwen2.5 0.5B Instruct (ligero)",
    kind: "text",
    repo: "onnx-community/Qwen2.5-0.5B-Instruct",
    approxBytes: 400 * 1024 * 1024,
    contextTokens: 4096,
    minMemoryGB: 3,
    dtype: "q4f16",
    device: "webgpu",
    tiers: ["bajo", "medio", "alto"],
    notas: "Equilibrio entre tamaño y calidad para equipos normales.",
  },
  {
    id: "qwen25-15b",
    label: "Qwen2.5 1.5B Instruct (avanzado)",
    kind: "text",
    repo: "onnx-community/Qwen2.5-1.5B-Instruct",
    approxBytes: 1.1 * 1024 * 1024 * 1024,
    contextTokens: 8192,
    minMemoryGB: 6,
    dtype: "q4f16",
    device: "webgpu",
    tiers: ["alto"],
    notas: "Requiere WebGPU y memoria suficiente. Descarga de ~1 GB.",
  },
  {
    id: "qwen2vl-2b",
    label: "Qwen2-VL 2B Instruct (visión)",
    kind: "vision",
    repo: "onnx-community/Qwen2-VL-2B-Instruct",
    approxBytes: 1.6 * 1024 * 1024 * 1024,
    contextTokens: 4096,
    minMemoryGB: 8,
    dtype: "q4f16",
    device: "webgpu",
    tiers: ["alto"],
    notas: "Multimodal local (texto + imagen). Descarga grande; solo con WebGPU.",
  },
];

export function getModel(id: string): ModelDescriptor | null {
  return MODEL_REGISTRY.find((m) => m.id === id) ?? null;
}

export function modelsForTier(tier: HardwareTier, kind?: ModelKind): ModelDescriptor[] {
  return MODEL_REGISTRY.filter((m) => m.tiers.includes(tier) && (!kind || m.kind === kind));
}
