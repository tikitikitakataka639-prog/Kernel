/**
 * WORKER BRIDGE — arranque, comunicación, cancelación y liberación del worker
 * de inferencia. Aísla el resto del motor de `postMessage`.
 */
import { KernelEngineError, classifyError } from "@/lib/ai/errors";

export type WorkerOutMsg =
  | { type: "progress"; status: "loading"; fraction: number | null; bytesLoaded: number | null; bytesTotal: number | null; file: string | null }
  | { type: "ready"; modelId: string }
  | { type: "token"; requestId: string; token: string }
  | { type: "complete"; requestId: string; text: string; tokensGenerated: number; elapsedMs: number }
  | { type: "cancelled"; requestId: string }
  | { type: "unloaded" }
  | { type: "error"; requestId: string | null; message: string };

export type WorkerInMsg =
  | { type: "load"; modelId: string; repo: string; kind: "text" | "vision"; dtype: string; device: "webgpu" | "wasm" }
  | { type: "generate"; requestId: string; messages: Array<{ role: string; content: string; images?: string[] }>; config: { maxNewTokens: number; temperature: number; topP: number } }
  | { type: "cancel"; requestId: string }
  | { type: "unload" };

export class WorkerBridge {
  private worker: Worker | null = null;
  private listeners = new Set<(msg: WorkerOutMsg) => void>();

  get activo(): boolean {
    return this.worker !== null;
  }

  /** Crea el worker si no existe. Lanza si el navegador no soporta Workers de módulo. */
  start(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") {
      throw new KernelEngineError("worker-failed", "Este navegador no soporta Web Workers.");
    }
    try {
      const worker = new Worker(new URL("./inference.worker.ts", import.meta.url), {
        type: "module",
        name: "kernel-inference",
      });
      worker.addEventListener("message", (event: MessageEvent<WorkerOutMsg>) => {
        for (const l of this.listeners) l(event.data);
      });
      worker.addEventListener("error", (event) => {
        const message = event.message || "Error no controlado en el worker de inferencia.";
        for (const l of this.listeners) l({ type: "error", requestId: null, message });
      });
      this.worker = worker;
      return worker;
    } catch (error) {
      throw new KernelEngineError("worker-failed", classifyError(error).message);
    }
  }

  on(listener: (msg: WorkerOutMsg) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  post(msg: WorkerInMsg) {
    this.start().postMessage(msg);
  }

  /** Termina el worker: libera modelo, memoria de GPU y el hilo. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
