import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";
import { nativeChatPrompt } from "@/lib/kernel-prompt";
import { webgpuEngine } from "@/lib/ai/hardware/WebGPUEngine";
import wasmUrl from "wllama64/wasm/wllama.wasm?url";

export type QwenModelId = "qwen35-2b-fast" | "qwen35-4b-deep";

export const QWEN_MODELS = {
  "qwen35-2b-fast": {
    id: "qwen35-2b-fast",
    label: "Qwen3.5-2B Claude Distilled",
    variant: "RÁPIDO",
    repo: "Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF",
    file: "Qwen3.5-2B.Q4_K_M.gguf",
    sizeBytes: 1_270_000_000,
    sizeLabel: "1,27 GB",
    sha256: "6036e3b96a5dca3def9ba6f3aa751acebe081c4f109a8a9352647d0eea055c9d",
    runtime: "wllama64@1.1.1",
    url: "https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF/resolve/efb1952f4822d5fec9c4f018c5cfaf3f5c704383/Qwen3.5-2B.Q4_K_M.gguf",
    contextSize: 2048,
    batchSize: 256,
    maxTokens: 80,
    historyChars: 1200,
    lastUserChars: 2200,
    gpuLayerCandidates: [24, 20, 16, 12, 0],
  },
  "qwen35-4b-deep": {
    id: "qwen35-4b-deep",
    label: "Qwen3.5-4B Claude Distilled",
    variant: "PROFUNDO",
    repo: "Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF",
    file: "Qwen3.5-4B.Q4_K_M.gguf",
    sizeBytes: 2_910_000_000,
    sizeLabel: "2,71 GB",
    sha256: "de8cf2454c46ec34e6b991dc11f5dd42d543926272d8a59d36ceb5a2eaf7962a",
    runtime: "wllama64@1.1.1",
    url: "https://huggingface.co/Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF/resolve/main/Qwen3.5-4B.Q4_K_M.gguf",
    contextSize: 3072,
    batchSize: 128,
    maxTokens: 144,
    historyChars: 2200,
    lastUserChars: 3200,
    gpuLayerCandidates: [16, 12, 8, 0],
  },
} as const;

export const DEFAULT_QWEN_MODEL_ID: QwenModelId = "qwen35-2b-fast";
export const QWEN_MODEL = QWEN_MODELS[DEFAULT_QWEN_MODEL_ID];

type EnginePhase = "idle" | "downloading" | "loading" | "ready" | "generating" | "error";
export type QwenBrowserStatus = {
  phase: EnginePhase;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  backend: string | null;
  modelId: QwenModelId | null;
  detail: string;
  error: string | null;
  lastResponseMs: number | null;
  firstTokenMs: number | null;
  tokensPerSecond: number | null;
};

type CompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null | Array<{ type?: string; text?: string }>;
      // Qwen3.5 emite el canal de razonamiento separado del texto final.
      // Se observa para detectar actividad, pero nunca se muestra al usuario.
      reasoning_content?: string | null;
    };
  }>;
};
type WllamaLike = {
  isSupportWebGPU(): boolean;
  modelManager: {
    getModels(): Promise<Array<{ url: string; size: number }>>;
  };
  loadModelFromUrl(
    source: { url: string },
    options: {
      n_ctx: number;
      n_batch: number;
      n_ubatch: number;
      n_threads: number;
      n_gpu_layers: number;
      cache_ram_mib: number;
      progressCallback: (progress: { loaded: number; total: number }) => void;
      signal?: AbortSignal;
      retries?: number;
      jinja?: boolean;
      default_template_kwargs?: Record<string, unknown>;
    },
  ): Promise<void>;
  createChatCompletion(options: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    max_tokens: number;
    temperature: number;
    top_p: number;
    stream: true;
    abortSignal?: AbortSignal;
    chat_template_kwargs?: Record<string, unknown>;
  }): Promise<AsyncIterable<CompletionChunk>>;
  exit(): Promise<void>;
};


const IDLE: QwenBrowserStatus = {
  phase: "idle", progress: 0, loadedBytes: 0, totalBytes: QWEN_MODEL.sizeBytes,
  backend: null, modelId: null, detail: "Modelo rápido todavía no cargado en este navegador.", error: null,
  lastResponseMs: null, firstTokenMs: null, tokensPerSecond: null,
};
let snapshot: QwenBrowserStatus = IDLE;
let runtime: WllamaLike | null = null;
let loadPromise: Promise<void> | null = null;
let loadPromiseModelId: QwenModelId | null = null;
let activeModelId: QwenModelId | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<QwenBrowserStatus>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useQwenBrowserStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}

export function getLoadedQwenModelId(): QwenModelId | null {
  return activeModelId;
}

export function getQwenModel(modelId: QwenModelId = DEFAULT_QWEN_MODEL_ID) {
  return QWEN_MODELS[modelId];
}

export type QwenBrowserCompatibility = {
  checked: boolean;
  supported: boolean;
  reason: string | null;
};

/**
 * wllama64 Memory64 is retained for the optional 4B profile; the default 2B
 * profile also benefits from the smaller download and lower memory pressure.
 */
export function getQwenBrowserCompatibility(): QwenBrowserCompatibility {
  if (typeof window === "undefined") {
    return { checked: false, supported: false, reason: null };
  }
  if (!window.isSecureContext) {
    return { checked: true, supported: false, reason: "La descarga del modelo requiere HTTPS. Abre KERNEL desde su dirección segura de Vercel." };
  }
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    return { checked: true, supported: false, reason: "El navegador no tiene aislamiento cross-origin activo. Vercel debe servir COOP: same-origin y COEP: require-corp; recarga el sitio después del despliegue." };
  }

  const wasm = WebAssembly as unknown as {
    Memory: new (descriptor: { address: "i64"; initial: bigint; maximum: bigint; shared: true }) => WebAssembly.Memory;
    Suspending?: unknown;
    promising?: unknown;
  };
  if (typeof wasm.Suspending !== "function" || typeof wasm.promising !== "function") {
    return { checked: true, supported: false, reason: "Este navegador no incluye JSPI, necesario para el motor Memory64. Usa Chrome, Edge u Opera Chromium de 64 bits actualizado (Chromium 137 o posterior)." };
  }

  try {
    // Small feature probe: verify the actual shared Memory64 constructor, not only UA.
    new wasm.Memory({ address: "i64", initial: 1n, maximum: 2n, shared: true });
  } catch {
    return { checked: true, supported: false, reason: "Este navegador no admite memoria WebAssembly Memory64 compartida. Usa Chrome, Edge u Opera Chromium de 64 bits, versión 137 o posterior." };
  }
  return { checked: true, supported: true, reason: null };
}

async function createRuntime(): Promise<WllamaLike> {
  // Importación dinámica: Wllama se carga al entrar en Chat General, después del arranque WebGPU.
  const { Wllama } = await import("wllama64");
  const instance = new Wllama({ default: wasmUrl }, { parallelDownloads: 1 });
  return instance as unknown as WllamaLike;
}

function browserThreads(): number {
  const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(6, Math.floor(hardware / 2)));
}

async function checkBrowserStorage(model: (typeof QWEN_MODELS)[QwenModelId]) {
  if (typeof navigator === "undefined" || !navigator.storage) return;
  try {
    await navigator.storage.persist?.();
    const estimate = await navigator.storage.estimate?.();
    if (typeof estimate?.quota === "number" && typeof estimate.usage === "number") {
      const available = estimate.quota - estimate.usage;
      // No se bloquea si el navegador no informa cuota; si la informa y no cabe,
      // se evita iniciar una descarga de varios GB que terminará fallando.
      if (available < model.sizeBytes * 1.08) {
        throw new Error(
          `El navegador informa de solo ${formatBytes(available)} libres para guardar el modelo. ` +
          `Necesita al menos ${model.sizeLabel} más espacio temporal. Libera almacenamiento y vuelve a intentarlo.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("El navegador informa")) throw error;
    // La denegación de almacenamiento persistente no impide usar IndexedDB.
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

const RUNTIME_INIT_TIMEOUT_MS = 45_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 180_000;
const MODEL_INIT_TIMEOUT_MS = 8 * 60_000;
// Watchdogs differentiated by phase. Prefill (first token) can take tens of seconds
// on mid-range GPUs/CPUs; generation idle is measured only after visible progress;
// total is a hard safety net, not a target response length.
const FAST_FIRST_TOKEN_TIMEOUT_MS = 90_000;   // prefill + first visible token
const FAST_GENERATION_IDLE_TIMEOUT_MS = 45_000; // max silence after progress
const FAST_GENERATION_TOTAL_TIMEOUT_MS = 300_000; // 5 min hard safety net
const DEEP_FIRST_TOKEN_TIMEOUT_MS = 120_000;
const DEEP_GENERATION_IDLE_TIMEOUT_MS = 60_000;
const DEEP_GENERATION_TOTAL_TIMEOUT_MS = 600_000; // 10 min hard safety net


function timeoutError(message: string): Error {
  const error = new Error(message);
  error.name = "QwenTimeoutError";
  return error;
}

function withPromiseTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function awaitWithAbortAndTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Operación cancelada.", "AbortError"));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => { cleanup(); reject(new DOMException("Operación cancelada.", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(timeoutError(message)); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

async function loadModelWithWatchdog(
  candidate: WllamaLike,
  model: (typeof QWEN_MODELS)[QwenModelId],
  gpuLayers: number,
  progressCallback: (progress: { loaded: number; total: number }) => void,
  useCachedModel: boolean,
): Promise<void> {
  const controller = new AbortController();
  let stage: "download" | "initialization" = useCachedModel ? "initialization" : "download";
  let lastLoaded = -1;
  let activeTimeoutMs = useCachedModel ? MODEL_INIT_TIMEOUT_MS : DOWNLOAD_IDLE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectWatchdog: ((reason: Error) => void) | undefined;

  const watchdog = new Promise<never>((_, reject) => { rejectWatchdog = reject; });
  const armWatchdog = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const message = stage === "download"
        ? "La descarga lleva 3 minutos sin recibir datos. Se ha cancelado para evitar un proceso infinito. Comprueba Hugging Face, la conexión y vuelve a intentarlo."
        : "La inicialización del modelo ha superado 8 minutos. Se ha cancelado para evitar que KERNEL se quede procesando indefinidamente. Comprueba la memoria disponible del navegador.";
      controller.abort();
      rejectWatchdog?.(timeoutError(message));
    }, activeTimeoutMs);
  };

  const trackedProgress = (progress: { loaded: number; total: number }) => {
    progressCallback(progress);
    if (progress.loaded > lastLoaded) {
      lastLoaded = progress.loaded;
      if (progress.total > 0 && progress.loaded >= progress.total) {
        stage = "initialization";
        activeTimeoutMs = MODEL_INIT_TIMEOUT_MS;
      } else {
        stage = "download";
        activeTimeoutMs = DOWNLOAD_IDLE_TIMEOUT_MS;
      }
      armWatchdog();
    }
  };

  armWatchdog();
  try {
    await Promise.race([
      candidate.loadModelFromUrl(
        { url: model.url },
        {
          n_ctx: model.contextSize,
          n_batch: model.batchSize,
          n_ubatch: 128,
          n_threads: browserThreads(),
          n_gpu_layers: gpuLayers,
          cache_ram_mib: 256,
          // Qwen3.5 incluye una plantilla Jinja; sin activarla puede formatearse
          // incorrectamente el prompt aunque el GGUF se haya cargado bien.
          jinja: true,
          default_template_kwargs: { enable_thinking: false },
          progressCallback: trackedProgress,
          signal: controller.signal,
          retries: 3,
        },
      ),
      watchdog,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadQwenBrowserModel(modelId: QwenModelId = DEFAULT_QWEN_MODEL_ID): Promise<void> {
  const model = QWEN_MODELS[modelId];
  if (runtime && activeModelId === modelId) {
    publish({ phase: "ready", modelId, progress: 1, detail: `${model.label} está cargado y listo.`, error: null });
    return;
  }
  if (loadPromise) {
    if (loadPromiseModelId === modelId) return loadPromise;
    throw new Error("Hay otro perfil de Qwen cargándose. Espera a que termine antes de cambiar de modelo.");
  }

  loadPromiseModelId = modelId;
  loadPromise = (async () => {
    let candidate: WllamaLike | null = null;
    try {
      // Al cambiar de perfil solo se mantiene un modelo residente en RAM/VRAM.
      if (runtime && activeModelId !== modelId) {
        const oldRuntime = runtime;
        runtime = null;
        activeModelId = null;
        try { await withPromiseTimeout(oldRuntime.exit(), 10_000, "No se pudo liberar el modelo anterior."); } catch { /* se continúa con un runtime limpio */ }
      }

      const compatibility = getQwenBrowserCompatibility();
      if (compatibility.checked && !compatibility.supported) throw new Error(compatibility.reason ?? "Este navegador no admite el runtime del modelo.");
      if (!compatibility.checked) throw new Error("El modelo solo puede activarse desde el navegador, no durante la renderización del servidor.");
      publish({ phase: "loading", modelId, progress: 0, loadedBytes: 0, totalBytes: model.sizeBytes,
        backend: null, detail: "Inicializando dispositivo WebGPU del navegador…", error: null });
      const gpuState = await webgpuEngine.init();
      if (!gpuState.disponible && modelId === DEFAULT_QWEN_MODEL_ID) {
        throw new Error(`El perfil RÁPIDO requiere WebGPU y no se ha podido inicializar: ${gpuState.motivo ?? "adaptador no disponible"}. Comprueba la aceleración gráfica del navegador y sus controladores.`);
      }
      publish({ phase: "downloading", modelId, progress: 0, loadedBytes: 0, totalBytes: model.sizeBytes,
        backend: null, detail: `Preparando ${model.label} con ${gpuState.adaptador ?? "GPU"}…`, error: null });

      candidate = await withPromiseTimeout(createRuntime(), RUNTIME_INIT_TIMEOUT_MS,
        "El runtime WebAssembly no ha arrancado en 45 segundos. Recarga KERNEL y vuelve a intentarlo.");

      let modelCached = false;
      try {
        const cachedModels = await withPromiseTimeout(candidate.modelManager.getModels(), 30_000,
          "La caché local del modelo no responde. Recarga la página e inténtalo de nuevo.");
        modelCached = cachedModels.some((entry) => entry.url === model.url && entry.size >= model.sizeBytes * 0.95);
      } catch (cacheError) {
        publish({ detail: "No se pudo consultar la caché; se comprobará durante la carga…" });
        console.warn("KERNEL: no se pudo consultar la caché OPFS de Qwen", cacheError);
      }
      if (!modelCached) await checkBrowserStorage(model);

      publish({ phase: modelCached ? "loading" : "downloading", progress: modelCached ? 1 : 0,
        detail: modelCached ? `${model.label} encontrado en caché. Preparando memoria…` : `Preparando descarga de ${model.sizeLabel} desde Hugging Face…` });

      let downloadComplete = modelCached;
      const progressCallback = (progress: { loaded: number; total: number }) => {
        const total = progress.total > 0 ? progress.total : model.sizeBytes;
        const ratio = Math.min(1, Math.max(0, progress.loaded / total));
        const completed = progress.loaded >= total;
        if (completed) downloadComplete = true;
        publish({ phase: completed ? "loading" : "downloading", modelId, loadedBytes: progress.loaded,
          totalBytes: total, progress: ratio, detail: completed
            ? `Descarga completada. Inicializando ${model.label}…`
            : `Descargando ${model.label}: ${formatBytes(progress.loaded)} / ${formatBytes(total)}.` });
      };

      const gpuAvailable = candidate.isSupportWebGPU() && gpuState.disponible;
      if (!gpuAvailable && modelId === DEFAULT_QWEN_MODEL_ID) {
        throw new Error("El navegador ha creado un dispositivo WebGPU, pero el runtime Wllama no detecta su backend WebGPU. No se ha iniciado CPU para no incumplir el objetivo rápido. Recarga la página y comprueba opera://gpu.");
      }
      // El perfil RÁPIDO no cae silenciosamente a CPU: en CPU no puede
      // sostener el objetivo de latencia que se promete en la interfaz.
      const layerPlan = gpuAvailable
        ? (modelId === DEFAULT_QWEN_MODEL_ID
          ? model.gpuLayerCandidates.filter((layers) => layers > 0)
          : [...model.gpuLayerCandidates])
        : [0];
      let loaded = false;
      let selectedGpuLayers = 0;
      let lastGpuError: unknown = null;

      for (let index = 0; index < layerPlan.length; index++) {
        const gpuLayers = layerPlan[index]!;
        if (!candidate) {
          candidate = await withPromiseTimeout(createRuntime(), RUNTIME_INIT_TIMEOUT_MS,
            "No se pudo reiniciar el runtime tras ajustar el reparto de memoria GPU.");
        }
        try {
          publish({ phase: "loading", modelId, detail: gpuLayers > 0
            ? `Optimizando aceleración WebGPU (${gpuLayers} capas)…`
            : "Activando el modo CPU de compatibilidad; la respuesta puede tardar más de 10 segundos." });
          await loadModelWithWatchdog(candidate, model, gpuLayers, progressCallback, downloadComplete);
          selectedGpuLayers = gpuLayers;
          loaded = true;
          break;
        } catch (loadError) {
          if (loadError instanceof Error && loadError.name === "QwenTimeoutError") throw loadError;
          lastGpuError = loadError;
          try { await candidate.exit(); } catch { /* libera el contexto parcial */ }
          candidate = null;
          if (downloadComplete) modelCached = true;
          if (gpuLayers === 0) throw loadError;
          publish({ phase: "loading", modelId,
            detail: `La configuración GPU de ${gpuLayers} capas no cabe o ha fallado. Probando un reparto más pequeño…` });
        }
      }
      if (!loaded || !candidate) throw lastGpuError instanceof Error ? lastGpuError : new Error("El modelo no ha podido inicializarse.");

      runtime = candidate;
      activeModelId = modelId;
      const backend = selectedGpuLayers > 0
        ? `WebGPU · ${gpuState.adaptador ?? "GPU"} · ${selectedGpuLayers} capas`
        : "WASM CPU · sin aceleración GPU";
      publish({ phase: "ready", modelId, progress: 1, loadedBytes: model.sizeBytes, totalBytes: model.sizeBytes,
        backend, detail: `${model.label} cargado. ${selectedGpuLayers > 0 ? `Aceleración WebGPU activa en ${gpuState.adaptador ?? "la GPU"}.` : "Sin aceleración GPU (WASM CPU). Los watchdogs de fase permiten más tiempo, pero la generación será más lenta."}`,
        error: null });
    } catch (error) {
      if (candidate && candidate !== runtime) {
        try { await withPromiseTimeout(candidate.exit(), 8_000, ""); } catch { /* liberar lo que el runtime permita */ }
      }
      const message = error instanceof Error ? error.message : "No se pudo cargar el modelo.";
      publish({ phase: "error", modelId, backend: null, error: message,
        detail: `La carga de ${model.label} ha finalizado con un error; puedes volver a intentarlo.` });
      throw error;
    } finally {
      loadPromise = null;
      loadPromiseModelId = null;
    }
  })();
  return loadPromise;
}

export type GeneralMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Filtra los bloques <think> si el backend los devuelve mezclados en content.
 * Mantiene un sufijo corto entre fragmentos para detectar etiquetas partidas
 * por el streaming y nunca muestra razonamiento interno en la interfaz.
 */
function createReasoningMarkupFilter() {
  let pending = "";
  let insideThink = false;
  return (chunk: string, flush = false): string => {
    pending += chunk;
    let output = "";
    while (pending.length) {
      const lower = pending.toLowerCase();
      if (insideThink) {
        const end = lower.indexOf("</think>");
        if (end >= 0) {
          pending = pending.slice(end + 8);
          insideThink = false;
          continue;
        }
        if (flush) { pending = ""; break; }
        // Conserva el sufijo que podría ser el comienzo de </think>.
        const keep = Math.min(7, pending.length);
        pending = pending.slice(-keep);
        break;
      }
      const start = lower.indexOf("<think>");
      if (start >= 0) {
        output += pending.slice(0, start);
        pending = pending.slice(start + 7);
        insideThink = true;
        continue;
      }
      if (flush) { output += pending; pending = ""; break; }
      // Conserva los últimos 6 caracteres por si <think> llega fragmentado.
      const keep = Math.min(6, pending.length);
      output += pending.slice(0, pending.length - keep);
      pending = pending.slice(-keep);
      break;
    }
    return output;
  };
}

export async function generateWithQwen(
  messages: GeneralMessage[],
  abortSignal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<void> {
  if (!runtime || !activeModelId) throw new Error("El modelo todavía se está preparando. Espera a que termine la carga automática de Qwen en Chat General.");
  const active = runtime;
  const model = QWEN_MODELS[activeModelId];
  const fast = activeModelId === DEFAULT_QWEN_MODEL_ID;
  const idleTimeout = fast ? FAST_GENERATION_IDLE_TIMEOUT_MS : DEEP_GENERATION_IDLE_TIMEOUT_MS;
  const totalTimeout = fast ? FAST_GENERATION_TOTAL_TIMEOUT_MS : DEEP_GENERATION_TOTAL_TIMEOUT_MS;
  const firstTokenTimeout = fast ? FAST_FIRST_TOKEN_TIMEOUT_MS : DEEP_FIRST_TOKEN_TIMEOUT_MS;
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  if (abortSignal.aborted) controller.abort();
  else abortSignal.addEventListener("abort", relayAbort, { once: true });

  const startedAt = Date.now();
  const deadline = startedAt + totalTimeout;
  let emittedText = 0;
  let firstTokenMs: number | null = null;
  const filterReasoningMarkup = createReasoningMarkupFilter();
  publish({ phase: "generating", modelId: activeModelId, detail: `${model.label}: generando respuesta breve…`,
    error: null, lastResponseMs: null, firstTokenMs: null, tokensPerSecond: null });
  try {
    const stream = await awaitWithAbortAndTimeout(
      active.createChatCompletion({
        messages,
        max_tokens: model.maxTokens,
        temperature: 0.55,
        top_p: 0.88,
        stream: true,
        abortSignal: controller.signal,
        chat_template_kwargs: { enable_thinking: false },
      }),
      controller.signal,
      firstTokenTimeout,
      `El motor no ha emitido el primer token en ${Math.round(firstTokenTimeout / 1000)} s (fase de prefill). Se cancela para liberar recursos. Esto no implica necesariamente un fallo de GPU; el prefill puede ser lento en este dispositivo.`,
    );

    const iterator = stream[Symbol.asyncIterator]();
    let receivedAnyChunk = false;
    let reasoningCharacters = 0;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        controller.abort();
        throw timeoutError(`La generación superó el límite de seguridad de ${Math.round(totalTimeout / 1000)} s. Reduce el contexto o prueba el otro perfil.`);
      }
      // Idle timeout applies only after first visible progress; until then use remaining first-token budget.
      const stepTimeout = emittedText === 0
        ? Math.min(idleTimeout, remaining, Math.max(1, firstTokenTimeout - (Date.now() - startedAt)))
        : Math.min(idleTimeout, remaining);
      const step = await awaitWithAbortAndTimeout(iterator.next(), controller.signal,
        stepTimeout,
        emittedText === 0
          ? (snapshot.backend?.startsWith("WebGPU")
            ? `Watchdog de prefill: ${Math.round(firstTokenTimeout / 1000)} s sin primer token. WebGPU y capas están configurados, pero eso no prueba que el prefill haya terminado ni que el modelo esté bloqueado. Cancelado para liberar recursos.`
            : `Watchdog de prefill: ${Math.round(firstTokenTimeout / 1000)} s sin primer token. Backend: ${snapshot.backend ?? "ninguno"}. La ausencia de texto puede ser prefill lento, no un fallo de GPU.`)
          : `Sin progreso de generación durante ${Math.round(idleTimeout / 1000)} s tras el primer token; se libera el motor.`,
      );
      if (step.done) break;
      receivedAnyChunk = true;
      const delta = step.value.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.reasoning_content === "string") reasoningCharacters += delta.reasoning_content.length;
      const content = delta.content;
      const contentText = typeof content === "string" ? content
        : Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : "";
      if (contentText) {
        const safeText = filterReasoningMarkup(contentText, false);
        if (safeText) {
          if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
          emittedText += safeText.length;
          onDelta(safeText);
        }
      }
      if (controller.signal.aborted) break;
    }

    const remainingSafeText = filterReasoningMarkup("", true);
    if (remainingSafeText) {
      if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
      emittedText += remainingSafeText.length;
      onDelta(remainingSafeText);
    }
    if (abortSignal.aborted) return;
    if (!emittedText) {
      const suffix = reasoningCharacters > 0
        ? "El modelo solo emitió razonamiento interno y no produjo texto visible."
        : receivedAnyChunk ? "El motor terminó sin contenido de respuesta." : "El motor terminó sin emitir fragmentos.";
      throw new Error(`${suffix} Prueba otra formulación o el perfil profundo.`);
    }
    const elapsedMs = Date.now() - startedAt;
    const estimatedTokens = Math.max(1, Math.round(emittedText / 3.8));
    publish({ phase: "ready", modelId: activeModelId, lastResponseMs: elapsedMs, firstTokenMs,
      tokensPerSecond: Math.round((estimatedTokens / (elapsedMs / 1000)) * 10) / 10,
      detail: `Respuesta completada en ${(elapsedMs / 1000).toFixed(1)} s · ${model.label}.` });
  } catch (error) {
    if (error instanceof Error && error.name === "QwenTimeoutError" && !abortSignal.aborted) {
      // La señal de la petición detiene el cálculo, pero conserva el modelo ya
      // cargado en memoria: no obligamos a descargar/reinicializar 1,27 GB.
      controller.abort();
    }
    if (abortSignal.aborted) return;
    const message = error instanceof Error ? error.message : "Error desconocido durante la generación.";
    publish({ phase: runtime ? "ready" : "error", modelId: runtime ? activeModelId : null,
      backend: runtime ? snapshot.backend : null,
      detail: runtime ? `El modelo permanece cargado, pero esta petición se detuvo: ${message}`
        : `El motor local no está disponible: ${message} Actívalo desde Ajustes.`, error: message });
    throw error;
  } finally {
    abortSignal.removeEventListener("abort", relayAbort);
    if (runtime === active) {
      publish({ phase: "ready", modelId: activeModelId,
        detail: abortSignal.aborted ? "Generación detenida. El modelo sigue listo." : snapshot.detail });
    } else if (snapshot.phase !== "error") {
      publish({ phase: "error", modelId: null, backend: null,
        detail: "El motor local se ha cerrado. Vuelve a Ajustes para reactivarlo desde la caché del navegador." });
    }
  }
}

export function isQwenBrowserReady(): boolean {
  return Boolean(runtime);
}

export function uiMessagesToQwen(messages: UIMessage[]): GeneralMessage[] {
  const model = QWEN_MODELS[activeModelId ?? DEFAULT_QWEN_MODEL_ID];
  const extract = (message: UIMessage) => message.parts
    .map((part) => part.type === "text" ? part.text : part.type === "file"
      ? "[ADJUNTO NO INTERPRETADO: el modelo de texto no ha recibido ni leído el contenido del archivo.]" : "")
    .filter(Boolean).join("\n").trim();
  const turns = messages.filter((message) => message.role === "user" || message.role === "assistant")
    .slice(fastMode() ? -6 : -8)
    .map((message) => ({ role: message.role as "user" | "assistant", content: extract(message) }))
    .filter((message) => message.content.length > 0);
  const lastUser = [...turns].reverse().find((message) => message.role === "user");
  if (lastUser && lastUser.content.length > model.lastUserChars) {
    lastUser.content = `${lastUser.content.slice(0, model.lastUserChars - 50)}\n[fragmento largo recortado]`;
  }
  let used = 0;
  const history = turns.slice(0, -1).reverse().filter((turn) => {
    if (used + turn.content.length > model.historyChars) return false;
    used += turn.content.length;
    return true;
  }).reverse();
  return [{ role: "system", content: nativeChatPrompt(fastMode() ? "minimo" : "completo") },
    ...history, ...(turns.length ? [turns[turns.length - 1]!] : [])];
}

function fastMode(): boolean {
  return (activeModelId ?? DEFAULT_QWEN_MODEL_ID) === DEFAULT_QWEN_MODEL_ID;
}

