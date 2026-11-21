/**
 * MODEL MANAGER — registro, carga, descarga y estado de los modelos locales.
 *
 * Reglas: una sola carga a la vez, sin cargas duplicadas del mismo modelo,
 * progreso real reportado por el worker, y liberación explícita del anterior
 * antes de cargar otro (evita duplicar pesos en memoria).
 */
import { classifyError } from "@/lib/ai/errors";
import { MODEL_REGISTRY, getModel } from "@/lib/ai/models/ModelRegistry";
import { WorkerBridge } from "@/lib/ai/workers/WorkerBridge";
import type { InferenceConfig, LoadProgress, ModelDescriptor, ModelState } from "@/lib/ai/types";

const PROGRESO_VACIO: LoadProgress = {
  status: "idle",
  fraction: null,
  bytesLoaded: null,
  bytesTotal: null,
  file: null,
};

export class ModelManager {
  readonly bridge: WorkerBridge;
  private state: ModelState | null = null;
  private cargando: Promise<ModelState> | null = null;
  private cargandoId: string | null = null;
  private listeners = new Set<(state: ModelState | null) => void>();

  constructor(bridge = new WorkerBridge()) {
    this.bridge = bridge;
  }

  get catalogo(): ModelDescriptor[] {
    return MODEL_REGISTRY;
  }

  get estado(): ModelState | null {
    return this.state;
  }

  get modeloListo(): string | null {
    return this.state?.status === "ready" ? this.state.id : null;
  }

  on(listener: (state: ModelState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: ModelState | null) {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  /**
   * Carga un modelo del catálogo. Descarga real desde Hugging Face: solo debe
   * llamarse por acción explícita del usuario, nunca automáticamente.
   */
  load(modelId: string, config: Pick<InferenceConfig, "dtype" | "device">): Promise<ModelState> {
    const descriptor = getModel(modelId);
    if (!descriptor) {
      return Promise.reject(classifyError(new Error(`Modelo desconocido: ${modelId}`)).message);
    }
    if (this.state?.id === modelId && this.state.status === "ready") {
      return Promise.resolve(this.state);
    }
    if (this.cargando && this.cargandoId === modelId) return this.cargando;

    this.cargandoId = modelId;
    this.emit({ id: modelId, status: "loading", progress: { ...PROGRESO_VACIO, status: "loading" }, error: null });

    this.cargando = new Promise<ModelState>((resolve, reject) => {
      const off = this.bridge.on((msg) => {
        if (msg.type === "progress") {
          this.emit({
            id: modelId,
            status: "loading",
            progress: {
              status: "loading",
              fraction: msg.fraction,
              bytesLoaded: msg.bytesLoaded,
              bytesTotal: msg.bytesTotal,
              file: msg.file,
            },
            error: null,
          });
        } else if (msg.type === "ready" && msg.modelId === modelId) {
          off();
          this.cargando = null;
          this.cargandoId = null;
          const listo: ModelState = {
            id: modelId,
            status: "ready",
            progress: { ...PROGRESO_VACIO, status: "ready", fraction: 1 },
            error: null,
          };
          this.emit(listo);
          resolve(listo);
        } else if (msg.type === "error" && msg.requestId === null) {
          off();
          this.cargando = null;
          this.cargandoId = null;
          const { message } = classifyError(new Error(msg.message));
          this.emit({ id: modelId, status: "error", progress: { ...PROGRESO_VACIO, status: "error" }, error: message });
          reject(new Error(message));
        }
      });

      try {
        this.bridge.post({
          type: "load",
          modelId,
          repo: descriptor.repo,
          kind: descriptor.kind,
          dtype: config.dtype,
          device: config.device,
        });
      } catch (error) {
        off();
        this.cargando = null;
        this.cargandoId = null;
        const { message } = classifyError(error);
        this.emit({ id: modelId, status: "error", progress: { ...PROGRESO_VACIO, status: "error" }, error: message });
        reject(new Error(message));
      }
    });

    return this.cargando;
  }

  /** Libera el modelo y el worker: la memoria vuelve al sistema. */
  unload() {
    if (this.state) {
      this.emit({ ...this.state, status: "unloading" });
    }
    this.bridge.terminate();
    this.cargando = null;
    this.cargandoId = null;
    this.emit(null);
  }
}
