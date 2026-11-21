/**
 * Estado observable del motor local (Fase 2): gestión de modelos WebLLM aislada del chat.
 * Un único motor (nativeEngine) y un único modelo en memoria; cambiar de modelo libera el anterior.
 * El chat normal NO lee este store para elegir transporte: solo el laboratorio y Ajustes.
 */
import { FIRST_TEST_MODEL_ID, getNativeModel, type NativeModel } from "@/lib/kengine-native/catalog";
import { NativeEngineError, nativeEngine } from "@/lib/kengine-native/engine";

export const NATIVE_MODEL_KEY = "kernel.kengine.nativeModel";

export type NativeStatus =
  | { fase: "inactivo"; modelo: NativeModel["id"] }
  | { fase: "sin-webgpu"; modelo: NativeModel["id"]; detalle: string }
  | { fase: "descargando"; modelo: NativeModel["id"]; progreso: number; detalle: string }
  | { fase: "listo"; modelo: NativeModel["id"]; generando: boolean }
  | { fase: "error"; modelo: NativeModel["id"]; code: string; detalle: string };

export type NativeCacheSnapshot = Readonly<Partial<Record<NativeModel["id"], boolean>>>;

type Listener = () => void;

/**
 * localStorage del entorno actual (navegador o shim de tests).
 * No depender solo de `window`: en Bun/CI el test puede definir
 * `globalThis.localStorage` sin `window`.
 */
function nativeStorage(): Storage | null {
  try {
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    if (g.localStorage && typeof g.localStorage.getItem === "function") {
      return g.localStorage;
    }
  } catch {
    // Storage inaccesible (p. ej. modo privado estricto).
  }
  return null;
}

class NativeStore {
  private status: NativeStatus = { fase: "inactivo", modelo: FIRST_TEST_MODEL_ID };
  private listeners = new Set<Listener>();
  private hydrated = false;
  private webgpu: { ok: boolean; reason: string | null; adapter: string | null } | null = null;
  /** Mapa mutable interno; el snapshot público solo cambia cuando se regenera. */
  private cacheMap: Partial<Record<NativeModel["id"], boolean>> = {};
  private cacheSnapshot: NativeCacheSnapshot = Object.freeze({});

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;
  getWebGPU = () => this.webgpu;
  /** Referencia estable entre actualizaciones de caché (useSyncExternalStore). */
  getCachedSnapshot = (): NativeCacheSnapshot => this.cacheSnapshot;

  /** Vista de solo lectura para código que aún usa `.cached`. */
  get cached(): NativeCacheSnapshot {
    return this.cacheSnapshot;
  }

  private set(next: NativeStatus) {
    this.status = next;
    for (const fn of this.listeners) fn();
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private commitCache(next: Partial<Record<NativeModel["id"], boolean>>) {
    this.cacheMap = next;
    this.cacheSnapshot = Object.freeze({ ...next });
    this.notify();
  }

  /** Lee preferencias guardadas; llamar desde useEffect. */
  hydrate() {
    if (this.hydrated) return;
    const storage = nativeStorage();
    // En SSR sin storage no hay nada que hidratar; en cliente/tests sí.
    if (!storage && typeof window === "undefined") return;
    this.hydrated = true;
    const saved = storage?.getItem(NATIVE_MODEL_KEY) ?? null;
    const model = saved ? getNativeModel(saved) : null;
    if (model && this.status.fase === "inactivo") this.set({ fase: "inactivo", modelo: model.id });
    else this.set({ ...this.status });
    void this.refreshCache();
    void this.refreshWebGPU();
  }

  async refreshWebGPU() {
    this.webgpu = await nativeEngine.checkWebGPU();
    this.notify();
  }

  async refreshCache() {
    const next: Partial<Record<NativeModel["id"], boolean>> = {};
    for (const m of ["qwen2.5-0.5b", "llama-3.2-1b", "qwen2.5-1.5b", "llama-3.2-3b"] as const) {
      next[m] = await nativeEngine.isCached(m);
    }
    this.commitCache(next);
  }

  select(id: NativeModel["id"]) {
    if (this.status.fase === "descargando" || (this.status.fase === "listo" && this.status.generando)) return;
    const storage = nativeStorage();
    storage?.setItem(NATIVE_MODEL_KEY, id);
    if (nativeEngine.modelId !== id) this.set({ fase: "inactivo", modelo: id });
    else this.set({ ...this.status, modelo: id });
  }

  async load(): Promise<void> {
    const modelo = this.status.modelo;
    if (this.status.fase === "descargando") return;
    if (this.status.fase === "listo" && nativeEngine.modelId === modelo) return;
    const gpu = await nativeEngine.checkWebGPU();
    this.webgpu = gpu;
    if (!gpu.ok) {
      this.set({ fase: "sin-webgpu", modelo, detalle: gpu.reason ?? "WebGPU no disponible." });
      return;
    }
    this.set({ fase: "descargando", modelo, progreso: 0, detalle: "Preparando…" });
    try {
      await nativeEngine.load(modelo, (r) =>
        this.set({ fase: "descargando", modelo, progreso: r.progress, detalle: r.text }),
      );
      this.commitCache({ ...this.cacheMap, [modelo]: true });
      this.set({ fase: "listo", modelo, generando: false });
    } catch (e) {
      const err = e instanceof NativeEngineError ? e : new NativeEngineError("load-failed", String(e));
      if (err.code === "webgpu-unavailable") {
        this.set({ fase: "sin-webgpu", modelo, detalle: err.message });
        return;
      }
      this.set({
        fase: "error",
        modelo,
        code: err.code,
        detalle:
          err.code === "out-of-memory"
            ? `Memoria insuficiente para ${modelo}. Prueba un modelo más pequeño.`
            : err.message,
      });
    }
  }

  /** Descarga un modelo a IndexedDB y lo deja fuera de memoria. */
  async download(id: NativeModel["id"]): Promise<void> {
    if (this.status.fase === "descargando") return;
    if (this.status.fase === "listo" && this.status.generando) return;
    if (this.status.fase === "listo" && nativeEngine.modelId === id) {
      this.commitCache({ ...this.cacheMap, [id]: true });
      return;
    }
    const storage = nativeStorage();
    storage?.setItem(NATIVE_MODEL_KEY, id);
    // Reserva el turno antes del primer await para impedir dos descargas simultáneas.
    this.set({ fase: "descargando", modelo: id, progreso: 0, detalle: "Comprobando WebGPU…" });
    const gpu = await nativeEngine.checkWebGPU();
    this.webgpu = gpu;
    if (!gpu.ok) {
      this.set({ fase: "sin-webgpu", modelo: id, detalle: gpu.reason ?? "WebGPU no disponible." });
      return;
    }
    this.set({ fase: "descargando", modelo: id, progreso: 0, detalle: "Preparando descarga…" });
    try {
      await nativeEngine.load(id, (r) =>
        this.set({ fase: "descargando", modelo: id, progreso: r.progress, detalle: r.text }),
      );
      this.commitCache({ ...this.cacheMap, [id]: true });
      await nativeEngine.unload();
      this.set({ fase: "inactivo", modelo: id });
    } catch (e) {
      const err = e instanceof NativeEngineError ? e : new NativeEngineError("load-failed", String(e));
      if (err.code === "webgpu-unavailable") {
        this.set({ fase: "sin-webgpu", modelo: id, detalle: err.message });
        return;
      }
      this.set({
        fase: "error",
        modelo: id,
        code: err.code,
        detalle:
          err.code === "out-of-memory"
            ? `Memoria insuficiente para ${id}. Prueba un modelo más pequeño.`
            : err.message,
      });
    }
  }

  /**
   * Solo interrumpe una generación en curso (`interruptGenerate`).
   * No cancela descarga ni inicialización de WebLLM: la API pública no ofrece
   * abort seguro de CreateWebWorkerMLCEngine; usar unload() tras completar o fallar.
   */
  interrupt() {
    nativeEngine.interrupt();
  }

  async unload() {
    await nativeEngine.unload();
    this.set({ fase: "inactivo", modelo: this.status.modelo });
  }

  setGenerating(generando: boolean) {
    if (this.status.fase === "listo") this.set({ ...this.status, generando });
  }

  fail(code: string, detalle: string) {
    if (code === "interrupted") return this.setGenerating(false);
    if (nativeEngine.modelId) this.set({ fase: "listo", modelo: this.status.modelo, generando: false });
    else this.set({ fase: "error", modelo: this.status.modelo, code, detalle });
  }
}

export const nativeStore = new NativeStore();

export function nativeLabel(s: NativeStatus): string {
  const m = getNativeModel(s.modelo)?.label ?? s.modelo;
  switch (s.fase) {
    case "sin-webgpu":
      return "Motor nativo · WebGPU no disponible";
    case "descargando":
      return `Motor nativo · ${nativeStore.cached[s.modelo] ? "cargando" : "descargando"} ${m} ${Math.round(s.progreso * 100)}%`;
    case "listo":
      return `Motor nativo · ${s.generando ? "generando" : "preparado"} · ${m}`;
    case "error":
      return `Motor nativo · error (${s.code})`;
    default:
      return `Motor nativo · ${m} ${nativeStore.cached[s.modelo] ? "en caché, sin cargar" : "no descargado"}`;
  }
}
