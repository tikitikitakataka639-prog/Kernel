/**
 * WEBGPU ENGINE — inicialización real y compartida del dispositivo del navegador.
 * La API se inicializa al entrar en KERNEL. Wllama crea su propio dispositivo
 * en el worker de inferencia cuando se cargan las capas del modelo.
 */
import { useSyncExternalStore } from "react";
import { KernelEngineError } from "@/lib/ai/errors";

export type WebGPUState = {
  disponible: boolean;
  motivo: string | null;
  adaptador: string | null;
  fp16: boolean;
  perdido: boolean;
};

const INITIAL_STATE: WebGPUState = {
  disponible: false,
  motivo: "pendiente de inicialización",
  adaptador: null,
  fp16: false,
  perdido: false,
};

export class WebGPUEngine {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private initializing: Promise<WebGPUState> | null = null;
  private state: WebGPUState = INITIAL_STATE;
  private onLost: ((motivo: string) => void) | null = null;
  private listeners = new Set<() => void>();

  private publish(next: WebGPUState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  get estado(): WebGPUState {
    return this.state;
  }

  setOnLost(cb: (motivo: string) => void) {
    this.onLost = cb;
  }

  /** Solicita un adaptador y un dispositivo WebGPU reales; deduplica el arranque. */
  async init(): Promise<WebGPUState> {
    if (this.device && !this.state.perdido) return this.state;
    if (this.initializing) return this.initializing;

    const pending = this.initializeDevice();
    this.initializing = pending;
    try {
      return await pending;
    } finally {
      if (this.initializing === pending) this.initializing = null;
    }
  }

  private async initializeDevice(): Promise<WebGPUState> {
    if (typeof navigator === "undefined") {
      const state = { disponible: false, motivo: "WebGPU solo se puede inicializar en el navegador.", adaptador: null, fp16: false, perdido: false };
      this.publish(state);
      return state;
    }

    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      const state = { disponible: false, motivo: "navigator.gpu no existe. Comprueba que la aceleración gráfica del navegador esté activada.", adaptador: null, fp16: false, perdido: false };
      this.publish(state);
      return state;
    }

    try {
      // Primero se prefiere la GPU de alto rendimiento. Algunos navegadores
      // ignoran esta preferencia en Windows; si no devuelven adaptador, se
      // repite sin preferencias para no bloquear una GPU compatible.
      let adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) adapter = await gpu.requestAdapter();
      if (!adapter) {
        const state = { disponible: false, motivo: "El navegador no ha encontrado ningún adaptador WebGPU. Comprueba opera://gpu, la aceleración gráfica y los controladores.", adaptador: null, fp16: false, perdido: false };
        this.publish(state);
        return state;
      }

      const fp16 = adapter.features.has("shader-f16");
      // Este dispositivo solo verifica y mantiene el estado de la API.
      // Wllama abre su propio GPUDevice dentro del worker de inferencia.
      const device = await adapter.requestDevice();
      this.adapter = adapter;
      this.device = device;
      const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;

      void device.lost.then((detalle) => {
        this.device = null;
        this.adapter = null;
        this.publish({ ...this.state, disponible: false, perdido: true, motivo: detalle.message || detalle.reason || "El dispositivo WebGPU se ha perdido." });
        if (detalle.reason !== "destroyed") this.onLost?.(detalle.message || "dispositivo GPU perdido");
      });

      const state = { disponible: true, motivo: null, adaptador: info?.device || info?.description || "GPU compatible", fp16, perdido: false };
      this.publish(state);
      return state;
    } catch (error) {
      const state = { disponible: false, motivo: error instanceof Error ? error.message : "Fallo inicializando WebGPU.", adaptador: null, fp16: false, perdido: false };
      this.publish(state);
      return state;
    }
  }

  /** Dispositivo activo. Lanza si se pide sin WebGPU real disponible. */
  requireDevice(): GPUDevice {
    if (!this.device) {
      throw new KernelEngineError("webgpu-unavailable", this.state.motivo ?? "WebGPU no inicializado.");
    }
    return this.device;
  }

  dispose() {
    try { this.device?.destroy(); } catch { /* el dispositivo ya podía estar destruido */ }
    this.device = null;
    this.adapter = null;
    this.publish({ ...this.state, disponible: false, motivo: "liberado", perdido: false });
  }
}

export const webgpuEngine = new WebGPUEngine();

export function useWebGPUStatus(): WebGPUState {
  return useSyncExternalStore(webgpuEngine.subscribe, webgpuEngine.getSnapshot, () => INITIAL_STATE);
}
