/**
 * Motor nativo de KERNEL: WebLLM en Web Worker, solo navegador.
 *
 * WebLLM se importa dinámicamente dentro de loadModel(), nunca al evaluar el
 * módulo, para que SSR no evalúe código dependiente de navigator.gpu.
 *
 * Motor del modelo nativo Llama 3.2 3B de Police Mode.
 * Chat General utiliza QwenBrowserChatTransport, integrado en KERNEL.
 */
import type { InitProgressReport, WebWorkerMLCEngine } from "@mlc-ai/web-llm";

import { getNativeModel, NATIVE_MODELS, type NativeModel } from "@/lib/kengine-native/catalog";
import { getModelSource } from "@/lib/kengine-native/sources";

export type NativeEngineErrorCode =
  | "no-browser"
  | "webgpu-unavailable"
  | "unknown-model"
  | "load-failed"
  | "out-of-memory"
  | "not-loaded"
  | "generation-failed"
  | "generation-in-progress"
  | "interrupted";

export class NativeEngineError extends Error {
  constructor(
    readonly code: NativeEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NativeEngineError";
  }
}

const NATIVE_LOAD_IDLE_TIMEOUT_MS = 180_000;
const NATIVE_LOAD_TOTAL_TIMEOUT_MS = 20 * 60_000;
// Differentiated watchdogs for Llama 3.2 3B (Police Mode). Prefill on browser WebGPU
// can exceed 10–30 s; idle only after visible tokens; total is a safety net.
const NATIVE_GENERATION_FIRST_TOKEN_TIMEOUT_MS = 90_000;
const NATIVE_GENERATION_IDLE_TIMEOUT_MS = 30_000;
const NATIVE_GENERATION_TOTAL_TIMEOUT_MS = 180_000; // 3 min hard safety net


function withNativeAbortAndTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new NativeEngineError("interrupted", "Generación interrumpida."));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new NativeEngineError("interrupted", "Generación interrumpida."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new NativeEngineError("generation-failed", message));
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

/**
 * Clasifica errores de carga/generación.
 * OOM: solo frases o el token OOM como palabra (\b), nunca subcadenas de
 * mensajes genéricos como "boom".
 */
export function classifyNativeError(
  error: unknown,
  fallback: NativeEngineErrorCode,
): NativeEngineError {
  if (error instanceof NativeEngineError) return error;
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /out\s*of\s*memory/i.test(msg) ||
    /out-of-memory/i.test(msg) ||
    /\bOOM\b/.test(msg) ||
    /gpu\s*memory\s*(limit|exceeded|allocation)/i.test(msg) ||
    /failed\s+to\s+allocate/i.test(msg) ||
    /memory\s+allocation\s+failed/i.test(msg)
  ) {
    return new NativeEngineError("out-of-memory", msg);
  }
  if (/webgpu|adapter|navigator\.gpu/i.test(msg)) {
    return new NativeEngineError("webgpu-unavailable", msg);
  }
  return new NativeEngineError(fallback, msg);
}

/**
 * appConfig explícito: solo los cuatro modelos MLC admitidos por KERNEL.
 * La URL de descarga sale de sources.ts (hfRepoUrl); catálogo aporta lib y VRAM.
 */
export function buildAppConfig() {
  return {
    model_list: NATIVE_MODELS.map((model) => {
      const source = getModelSource(model.id);
      return {
        model: source?.hfRepoUrl ?? model.source,
        model_id: model.mlcModelId,
        model_lib: model.modelLib,
        vram_required_MB: model.vramRequiredMB,
        overrides: { context_window_size: 2048 },
      };
    }),
    // IndexedDB conserva los artefactos entre sesiones y evita depender de CacheStorage.
    useIndexedDBCache: true,
  };
}

export class NativeEngine {
  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private loadedId: NativeModel["id"] | null = null;
  private loading: Promise<void> | null = null;
  private generating = false;

  get modelId() {
    return this.loadedId;
  }

  get isGenerating() {
    return this.generating;
  }

  /** true si los pesos del modelo ya están en la caché de WebLLM (no se volverán a descargar). */
  async isCached(id: string): Promise<boolean> {
    const model = getNativeModel(id);
    if (!model || typeof window === "undefined") return false;
    try {
      const webllm = await import("@mlc-ai/web-llm");
      return await webllm.hasModelInCache(model.mlcModelId, buildAppConfig());
    } catch {
      return false;
    }
  }

  get isLoading() {
    return this.loading !== null;
  }

  async checkWebGPU(): Promise<{
    ok: boolean;
    reason: string | null;
    adapter: string | null;
  }> {
    if (typeof navigator === "undefined") {
      return { ok: false, reason: "Fuera del navegador.", adapter: null };
    }

    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      return {
        ok: false,
        reason: "Este navegador no implementa WebGPU.",
        adapter: null,
      };
    }

    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) {
        return {
          ok: false,
          reason: "No hay adaptador GPU disponible para WebGPU.",
          adapter: null,
        };
      }
      const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
      return {
        ok: true,
        reason: null,
        adapter: info?.description || info?.vendor || "GPU compatible",
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "No se pudo consultar WebGPU.",
        adapter: null,
      };
    }
  }

  /**
   * Serializa las cargas. Si dos componentes solicitan modelos distintos a la
   * vez, el segundo espera al primero y después carga el suyo sin pisar el
   * estado ni dejar workers huérfanos.
   */
  async load(id: string, onProgress?: (report: InitProgressReport) => void): Promise<void> {
    if (typeof window === "undefined") {
      throw new NativeEngineError("no-browser", "Solo en el navegador.");
    }

    const model = getNativeModel(id);
    if (!model) {
      throw new NativeEngineError("unknown-model", `Modelo desconocido: ${id}`);
    }
    if (!getModelSource(model.id)) {
      throw new NativeEngineError("unknown-model", `Sin fuente interna: ${id}`);
    }

    if (this.loadedId === model.id && this.engine) return;
    if (this.loading) await this.loading.catch(() => undefined);
    // Otra carga pudo completar mientras esta llamada esperaba.
    if (this.loadedId === model.id && this.engine) return;

    // Reservar el turno antes del primer await evita que dos llamadas
    // simultáneas creen dos workers a la vez.
    const task = (async () => {
      const gpu = await this.checkWebGPU();
      if (!gpu.ok) {
        throw new NativeEngineError(
          "webgpu-unavailable",
          gpu.reason ?? "WebGPU no disponible.",
        );
      }
      await this.loadModel(model, onProgress);
    })();
    this.loading = task;
    try {
      await task;
    } finally {
      if (this.loading === task) this.loading = null;
    }
  }

  private async loadModel(
    model: NativeModel,
    onProgress?: (report: InitProgressReport) => void,
  ): Promise<void> {
    await this.disposeCurrent();
    try {
      // Importación dinámica: no cargar WebLLM durante SSR.
      const webllm = await withNativeAbortAndTimeout(
        import("@mlc-ai/web-llm"),
        new AbortController().signal,
        45_000,
        "La biblioteca WebLLM no se ha inicializado en 45 segundos. Recarga la página y vuelve a intentarlo.",
      );
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
        name: `kernel-webllm-${model.id}`,
      });
      this.worker = worker;

      const startedAt = Date.now();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let rejectWatchdog: ((error: NativeEngineError) => void) | undefined;
      const watchdog = new Promise<never>((_, reject) => { rejectWatchdog = reject; });
      const armWatchdog = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (settled) return;
        const elapsed = Date.now() - startedAt;
        const remaining = NATIVE_LOAD_TOTAL_TIMEOUT_MS - elapsed;
        const wait = Math.min(NATIVE_LOAD_IDLE_TIMEOUT_MS, remaining);
        idleTimer = setTimeout(() => {
          settled = true;
          worker.terminate();
          const message = remaining <= NATIVE_LOAD_IDLE_TIMEOUT_MS
            ? "La carga de Llama 3B superó 20 minutos. Se ha detenido para evitar un bloqueo permanente."
            : "Llama 3B lleva 3 minutos sin comunicar progreso. Se ha detenido la carga; comprueba la conexión, la memoria y vuelve a intentarlo.";
          rejectWatchdog?.(new NativeEngineError("load-failed", message));
        }, Math.max(1, wait));
      };
      armWatchdog();

      try {
        const enginePromise = webllm.CreateWebWorkerMLCEngine(
          worker,
          model.mlcModelId,
          {
            appConfig: buildAppConfig(),
            initProgressCallback: (report) => {
              armWatchdog();
              onProgress?.(report);
            },
          },
        );
        const engine = await Promise.race([enginePromise, watchdog]);
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
        this.engine = engine;
        this.loadedId = model.id;
      } finally {
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
      }
    } catch (error) {
      await this.disposeCurrent();
      throw classifyNativeError(error, "load-failed");
    }
  }

  async generate(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    opts: {
      maxTokens?: number;
      temperature?: number;
      onToken?: (token: string) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<string> {
    const engine = this.engine;
    if (!engine) {
      throw new NativeEngineError("not-loaded", "No hay ningún modelo cargado.");
    }
    if (this.generating) {
      throw new NativeEngineError(
        "generation-in-progress",
        "Ya hay una generación en curso.",
      );
    }

    if (opts.signal?.aborted) {
      throw new NativeEngineError("interrupted", "Generación interrumpida.");
    }
    this.generating = true;
    const controller = new AbortController();
    const onAbort = () => {
      controller.abort();
      engine.interruptGenerate();
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = Date.now() + NATIVE_GENERATION_TOTAL_TIMEOUT_MS;
    try {
      const stream = await withNativeAbortAndTimeout(
        engine.chat.completions.create({
          messages,
          stream: true,
          max_tokens: opts.maxTokens ?? 256,
          temperature: opts.temperature ?? 0.7,
        }),
        controller.signal,
        NATIVE_GENERATION_FIRST_TOKEN_TIMEOUT_MS,
        `Llama 3B no ha emitido el primer token en ${Math.round(NATIVE_GENERATION_FIRST_TOKEN_TIMEOUT_MS / 1000)} s (prefill). Comprueba WebGPU/memoria; se cancela para liberar recursos.`,
      );

      let response = "";
      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        if (controller.signal.aborted) throw new NativeEngineError("interrupted", "Generación interrumpida.");
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          engine.interruptGenerate();
          throw new NativeEngineError("generation-failed", `La generación de Llama 3B superó el límite de seguridad de ${Math.round(NATIVE_GENERATION_TOTAL_TIMEOUT_MS / 1000)} s. Reduce el texto o vuelve a intentarlo.`);
        }
        const step = await withNativeAbortAndTimeout(
          iterator.next(),
          controller.signal,
          Math.min(NATIVE_GENERATION_IDLE_TIMEOUT_MS, remaining),
          `Llama 3B sin progreso de generación durante ${Math.round(NATIVE_GENERATION_IDLE_TIMEOUT_MS / 1000)} s. Se interrumpe para liberar Police Mode.`,
        );
        if (step.done) break;
        const token = step.value.choices[0]?.delta?.content ?? "";
        if (!token) continue;
        response += token;
        opts.onToken?.(token);
      }
      if (!response.trim()) {
        throw new NativeEngineError("generation-failed", "Llama 3B terminó sin emitir texto visible. Comprueba la memoria disponible y vuelve a intentarlo.");
      }
      return response;
    } catch (error) {
      if (opts.signal?.aborted) {
        throw new NativeEngineError("interrupted", "Generación interrumpida.");
      }
      if (error instanceof NativeEngineError && error.code === "generation-failed") {
        engine.interruptGenerate();
        throw error;
      }
      throw classifyNativeError(error, "generation-failed");
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      this.generating = false;
    }
  }

  /**
   * Solo detiene generación (`interruptGenerate`).
   * No cancela CreateWebWorkerMLCEngine / descarga de pesos: WebLLM 0.2.79 no
   * expone abort de inicialización en el factory del worker de forma segura
   * mientras el promise de load está en vuelo. unload() espera a que termine
   * la carga en curso y luego libera.
   */
  interrupt() {
    this.engine?.interruptGenerate();
  }

  /** Libera VRAM y termina el worker; los pesos descargados permanecen en caché. */
  async unload(): Promise<void> {
    // No competir con una inicialización que todavía está creando el worker.
    if (this.loading) await this.loading.catch(() => undefined);
    await this.disposeCurrent();
  }

  private async disposeCurrent(): Promise<void> {
    const engine = this.engine;
    const worker = this.worker;
    this.engine = null;
    this.worker = null;
    this.loadedId = null;

    if (engine) {
      try {
        if (this.generating) engine.interruptGenerate();
        await engine.unload();
      } catch {
        // El worker puede haber terminado o perdido el dispositivo GPU.
      }
    }
    worker?.terminate();
    this.generating = false;
  }
}

export const nativeEngine = new NativeEngine();
