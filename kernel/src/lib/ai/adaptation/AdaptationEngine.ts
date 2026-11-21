/**
 * ADAPTATION ENGINE — adapta el motor al hardware realmente medido.
 *
 * Entrada: HardwareCapabilities (medición real, con lo estimado marcado).
 * Salida: nivel de hardware, configuración de inferencia y modelo recomendado.
 * Extensible: añadir un nivel o un criterio nuevo no obliga a tocar el motor.
 */
import { memoriaUtilGB } from "@/lib/ai/hardware/HardwareDetector";
import { modelsForTier } from "@/lib/ai/models/ModelRegistry";
import type {
  HardwareCapabilities,
  HardwareTier,
  InferenceConfig,
  ModelDescriptor,
  ModelKind,
} from "@/lib/ai/types";

export type AdaptationPlan = {
  tier: HardwareTier;
  config: InferenceConfig;
  modeloRecomendado: ModelDescriptor | null;
  compatibles: ModelDescriptor[];
  /** Motivos legibles de la decisión (se muestran tal cual, sin adornos). */
  razones: string[];
};

export function classifyTier(caps: HardwareCapabilities): { tier: HardwareTier; razones: string[] } {
  const razones: string[] = [];
  const mem = memoriaUtilGB(caps);
  const hilos = caps.cpu.hilos ?? 0;

  if (!caps.navegador.wasm) {
    razones.push("El navegador no soporta WebAssembly: no hay inferencia local posible.");
    return { tier: "minimo", razones };
  }
  if (!caps.webgpu.disponible) {
    razones.push(caps.webgpu.motivo ?? "WebGPU no disponible: se usará WASM (más lento).");
    if (caps.navegador.movil || hilos <= 4) {
      razones.push("Pocos hilos de CPU o navegador móvil: nivel mínimo.");
      return { tier: "minimo", razones };
    }
    return { tier: "bajo", razones };
  }

  razones.push(`WebGPU disponible (${caps.webgpu.adaptador ?? "adaptador sin nombre"}).`);
  const maxBuffer = caps.webgpu.maxBufferBytes ?? 0;
  if (mem !== null && mem >= 8 && maxBuffer >= 1.5 * 1024 ** 3 && !caps.navegador.movil) {
    razones.push(`Memoria estimada ${mem.toFixed(1)} GB y límite de buffer GPU suficiente: nivel alto.`);
    return { tier: "alto", razones };
  }
  if (mem !== null && mem >= 4) {
    razones.push(`Memoria estimada ${mem.toFixed(1)} GB: nivel medio.`);
    return { tier: "medio", razones };
  }
  razones.push(
    mem === null
      ? "El navegador no expone la memoria del dispositivo: se asume nivel bajo por prudencia."
      : `Memoria estimada ${mem.toFixed(1)} GB: nivel bajo.`,
  );
  return { tier: "bajo", razones };
}

export function planFor(caps: HardwareCapabilities, kind: ModelKind = "text"): AdaptationPlan {
  const { tier, razones } = classifyTier(caps);
  const device: InferenceConfig["device"] = caps.webgpu.disponible ? "webgpu" : "wasm";
  const dtype: InferenceConfig["dtype"] = caps.webgpu.disponible
    ? caps.webgpu.fp16
      ? "q4f16"
      : "q4"
    : "int8";

  const compatibles = modelsForTier(tier, kind);
  const modeloRecomendado = compatibles.length > 0 ? (compatibles[compatibles.length - 1] ?? null) : null;

  const maxNewTokens = tier === "alto" ? 768 : tier === "medio" ? 512 : 256;
  const contextTokens = modeloRecomendado?.contextTokens ?? 2048;

  if (!modeloRecomendado) {
    razones.push("Ningún modelo del catálogo cumple los requisitos de este dispositivo para esa tarea.");
  }

  return {
    tier,
    config: { maxNewTokens, temperature: 0.7, topP: 0.9, contextTokens, dtype, device },
    modeloRecomendado,
    compatibles,
    razones,
  };
}
