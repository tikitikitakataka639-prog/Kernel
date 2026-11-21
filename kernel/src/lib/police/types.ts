/** Tipos del cliente KERNEL → Police Engine (proceso local). */

export type PoliceDetectorId = "horizon" | "mrbert-legal" | "paxmod-guard" | "grooming-xlm-roberta-es-en";

export type PoliceModelStatus =
  | "not_installed"
  | "downloading"
  | "ready"
  | "loading"
  | "loaded"
  | "inferring"
  | "error"
  | "unloading";

export type PoliceAnalysisState =
  | "ok"
  | "model_not_ready"
  | "error"
  | "skipped";

export interface PoliceModelInfo {
  id: string;
  name: string;
  version: string;
  license: string;
  status: PoliceModelStatus | string;
  repo_id: string;
  files: string[];
  local_dir: string | null;
  error: string | null;
  memory_rss_mb: number | null;
  loaded: boolean;
  notes: string[];
}

export interface PoliceScoreItem {
  label: string;
  score: number;
}

export interface PoliceAnalysisResult {
  model_id: string;
  model_version: string;
  state: PoliceAnalysisState | string;
  labels: PoliceScoreItem[];
  top_label: string | null;
  language: string | null;
  relevant_fragments: Array<Record<string, unknown>>;
  raw_scores: Record<string, number>;
  limitations: string[];
  latency_ms: number | null;
  error: string | null;
  notes?: string[];
  /** Structured, auditable metadata from detectors; never a legal verdict. */
  metadata?: Record<string, unknown>;
}

export interface PoliceEngineStatus {
  engine: string;
  version: string;
  loaded_model: string | null;
  memory: { rss_mb: number | null; vram_mb: number | null; note?: string };
  detectors: PoliceModelInfo[];
}
