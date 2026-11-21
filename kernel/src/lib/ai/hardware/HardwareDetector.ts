/**
 * HARDWARE DETECTOR — mide de verdad lo que el navegador expone.
 *
 * Reglas: lo que no se puede medir se devuelve como null y se marca `estimado`.
 * No se inventa VRAM, ni núcleos, ni soporte de GPU.
 */
import type { HardwareCapabilities } from "@/lib/ai/types";

let cache: HardwareCapabilities | null = null;

function detectSimd(): boolean {
  try {
    // Módulo WASM mínimo con una instrucción SIMD (v128.const). Si valida, hay SIMD.
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
      15, 253, 98, 11,
    ]);
    return typeof WebAssembly !== "undefined" && WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

async function detectWebGPU(): Promise<HardwareCapabilities["webgpu"]> {
  const vacio = {
    disponible: false,
    adaptador: null,
    vendor: null,
    arquitectura: null,
    maxBufferBytes: null,
    maxStorageBufferBytes: null,
    fp16: false,
  };
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { ...vacio, motivo: "navigator.gpu no existe en este navegador." };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ...vacio, motivo: "El navegador soporta WebGPU pero no hay adaptador GPU disponible." };
    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
    return {
      disponible: true,
      adaptador: info?.device || info?.description || "adaptador WebGPU",
      vendor: info?.vendor ?? null,
      arquitectura: info?.architecture ?? null,
      maxBufferBytes: adapter.limits.maxBufferSize ?? null,
      maxStorageBufferBytes: adapter.limits.maxStorageBufferBindingSize ?? null,
      fp16: adapter.features.has("shader-f16"),
      motivo: null,
    };
  } catch (error) {
    return { ...vacio, motivo: error instanceof Error ? error.message : "Fallo consultando WebGPU." };
  }
}

export async function detectHardware(force = false): Promise<HardwareCapabilities> {
  if (cache && !force) return cache;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const perf = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };

  let cuotaBytes: number | null = null;
  let usadoBytes: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      cuotaBytes = est.quota ?? null;
      usadoBytes = est.usage ?? null;
    }
  } catch {
    /* sin permisos: se queda en null, no se inventa */
  }

  const webgpu = await detectWebGPU();

  cache = {
    webgpu,
    cpu: {
      hilos: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null,
      estimado: false,
    },
    memoria: {
      deviceMemoryGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      jsHeapLimitBytes: perf.memory?.jsHeapSizeLimit ?? null,
      // navigator.deviceMemory viene redondeado por el navegador: es aproximado por definición.
      estimado: true,
    },
    almacenamiento: { cuotaBytes, usadoBytes },
    navegador: {
      userAgent: navigator.userAgent,
      movil: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
      wasm: typeof WebAssembly !== "undefined",
      simd: detectSimd(),
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      workers: typeof Worker !== "undefined",
      cacheApi: typeof caches !== "undefined",
    },
    medidoEn: Date.now(),
  };
  return cache;
}

/** Memoria de trabajo utilizable (GB) según lo medido; null si el navegador no lo expone. */
export function memoriaUtilGB(caps: HardwareCapabilities): number | null {
  if (caps.memoria.deviceMemoryGB) return caps.memoria.deviceMemoryGB;
  if (caps.memoria.jsHeapLimitBytes) return caps.memoria.jsHeapLimitBytes / 1024 ** 3;
  return null;
}
