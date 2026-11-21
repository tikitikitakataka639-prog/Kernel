/**
 * Fuentes internas de los modelos nativos de KERNEL.
 *
 * Las páginas HTML de Hugging Face son referencias documentales integradas.
 * La descarga de pesos NO usa esas copias estáticas: usa las rutas reales del
 * repositorio (`resolve/main/...`) a través del mecanismo de WebLLM y su caché persistente del navegador.
 *
 * No conectar este módulo al chat normal.
 */
import type { NativeModel } from "@/lib/kengine-native/catalog";

export type ModelSourceId = NativeModel["id"];

/** Artefactos típicos de un repo MLC en Hugging Face (pesos + config). */
export type ModelArtifactKind =
  | "mlc-chat-config"
  | "ndarray-cache"
  | "params-shard"
  | "tokenizer"
  | "tokenizer-config"
  | "other";

export type ModelSource = {
  /** Identificador KERNEL (inmutable). */
  id: ModelSourceId;
  /** Etiqueta UI. */
  label: string;
  /** ID que consume WebLLM / MLC. */
  mlcModelId: string;
  /** URL canónica del repo en Hugging Face. */
  hfRepoUrl: string;
  /** Organización/repo en HF (path). */
  hfRepoPath: string;
  /**
   * Referencia documental integrada (copia estática de la página HF).
   * Solo documentación; no sirve para bajar pesos.
   */
  referencePage: string;
  /** Prefijo de descarga real de ficheros. */
  resolveBase: string;
};

const HF = "https://huggingface.co";

/**
 * Catálogo de fuentes: una entrada por modelo oficial.
 * Los HTML de referencia viven en public/kengine-native/sources/.
 */
export const MODEL_SOURCES: readonly ModelSource[] = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B",
    mlcModelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    hfRepoPath: "mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    hfRepoUrl: `${HF}/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC`,
    referencePage: "/kengine-native/sources/qwen2.5-0.5b.html",
    resolveBase: `${HF}/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main`,
  },
  {
    id: "llama-3.2-1b",
    label: "Llama 3.2 1B",
    mlcModelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    hfRepoPath: "mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
    hfRepoUrl: `${HF}/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC`,
    referencePage: "/kengine-native/sources/llama-3.2-1b.html",
    resolveBase: `${HF}/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main`,
  },
  {
    id: "qwen2.5-1.5b",
    label: "Qwen 2.5 1.5B",
    mlcModelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    hfRepoPath: "mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    hfRepoUrl: `${HF}/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC`,
    referencePage: "/kengine-native/sources/qwen2.5-1.5b.html",
    resolveBase: `${HF}/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main`,
  },
  {
    id: "llama-3.2-3b",
    label: "Llama 3.2 3B",
    mlcModelId: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    hfRepoPath: "mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC",
    hfRepoUrl: `${HF}/mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC`,
    referencePage: "/kengine-native/sources/llama-3.2-3b.html",
    resolveBase: `${HF}/mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC/resolve/main`,
  },
] as const;

export function getModelSource(id: string): ModelSource | null {
  return MODEL_SOURCES.find((s) => s.id === id) ?? null;
}

/** URL real de un artefacto en el repo HF (descarga, no la página HTML). */
export function resolveModelFile(id: ModelSourceId, filename: string): string | null {
  const src = getModelSource(id);
  if (!src) return null;
  const name = filename.replace(/^\/+/, "");
  return `${src.resolveBase}/${name}`;
}

/**
 * Artefactos de configuración que suelen existir en repos MLC.
 * Los shards `params_shard_N.bin` se descubren vía ndarray-cache / WebLLM.
 */
export const CORE_CONFIG_FILES = [
  "mlc-chat-config.json",
  "ndarray-cache.json",
  "tokenizer.json",
  "tokenizer_config.json",
] as const;

export function coreConfigUrls(id: ModelSourceId): string[] {
  return CORE_CONFIG_FILES.map((f) => resolveModelFile(id, f)!).filter(Boolean);
}

/**
 * Contrato de descarga: quién baja los pesos.
 * - WebLLM: CreateWebWorkerMLCEngine / hasModelInCache con appConfig.model = hfRepoUrl
 * - Caché: IndexedDB del navegador (useIndexedDBCache: true en engine)
 * - HTML de referencia: solo documentación local; no participa en la descarga
 */
export const DOWNLOAD_CONTRACT = {
  mechanism: "webllm" as const,
  cache: "indexeddb" as const,
  htmlRole: "reference-only" as const,
  chatCoupled: false,
};
