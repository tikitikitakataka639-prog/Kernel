/**
 * Cliente HTTP hacia KERNEL POLICE ENGINE.
 * En Vercel solo usa un endpoint público configurado explícitamente.
 * localhost queda reservado a desarrollo local; nunca apunta al PC del visitante.
 */
import type {
  PoliceAnalysisResult,
  PoliceDetectorId,
  PoliceEngineStatus,
  PoliceModelInfo,
} from "@/lib/police/types";

const configuredBase = (import.meta.env["VITE_KERNEL_POLICE_URL"] ?? "").trim();
const DEFAULT_BASE = configuredBase || (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

function isAllowedPoliceBase(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const loopback = host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host.startsWith("127.");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (import.meta.env.PROD && (parsed.protocol !== "https:" || loopback)) return false;
    return true;
  } catch {
    return false;
  }
}

/** True only when a valid public Police Engine URL was explicitly configured. */
export function isPoliceEngineConfigured(): boolean {
  return Boolean(DEFAULT_BASE && isAllowedPoliceBase(DEFAULT_BASE));
}

export class PoliceEngineUnavailableError extends Error {
  constructor(message = "KERNEL POLICE ENGINE no está configurado o no responde. En Vercel define VITE_KERNEL_POLICE_URL con la URL HTTPS pública del servicio; localhost solo funciona durante desarrollo en tu propio equipo.") {
    super(message);
    this.name = "PoliceEngineUnavailableError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  base = DEFAULT_BASE,
): Promise<T> {
  const targetBase = (base ?? DEFAULT_BASE).trim();
  if (!targetBase) throw new PoliceEngineUnavailableError();
  if (!isAllowedPoliceBase(targetBase)) {
    throw new PoliceEngineUnavailableError(import.meta.env.PROD
      ? "En producción, Police Engine debe usar una URL HTTPS pública; no uses localhost ni direcciones HTTP."
      : "La URL del Police Engine debe ser una dirección HTTP o HTTPS válida.");
  }
  const normalizedBase = targetBase.replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${normalizedBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new PoliceEngineUnavailableError();
  }
  let data: T & { ok?: boolean; error?: string };
  try {
    data = (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(`Police Engine devolvió una respuesta no JSON (HTTP ${res.status}). Comprueba la ruta y el servicio.`);
  }
  if (!res.ok) {
    throw new Error(
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `Police engine HTTP ${res.status}`,
    );
  }
  return data;
}

export async function policeHealth(base?: string): Promise<boolean> {
  try {
    await request<{ ok: boolean }>("/health", { method: "GET" }, base);
    return true;
  } catch {
    return false;
  }
}

export async function policeStatus(base?: string): Promise<PoliceEngineStatus> {
  return request<PoliceEngineStatus>("/status", { method: "GET" }, base);
}

export async function policeDownload(
  detector: PoliceDetectorId,
  base?: string,
): Promise<PoliceModelInfo> {
  const data = await request<{ ok: boolean; model: PoliceModelInfo }>(
    "/download",
    { method: "POST", body: JSON.stringify({ detector }) },
    base,
  );
  return data.model;
}

export async function policeLoad(
  detector: PoliceDetectorId,
  preferCpu = true,
  base?: string,
): Promise<PoliceModelInfo> {
  const data = await request<{ ok: boolean; model: PoliceModelInfo }>(
    "/load",
    { method: "POST", body: JSON.stringify({ detector, prefer_cpu: preferCpu }) },
    base,
  );
  return data.model;
}

export async function policeUnload(
  detector?: PoliceDetectorId,
  base?: string,
): Promise<PoliceModelInfo | PoliceEngineStatus> {
  const data = await request<{ ok: boolean; model?: PoliceModelInfo } & PoliceEngineStatus>(
    "/unload",
    { method: "POST", body: JSON.stringify({ detector }) },
    base,
  );
  return data.model ?? data;
}

export async function policeAnalyze(
  input: {
    detector: PoliceDetectorId;
    text: string;
    query?: string;
    corpus?: string[];
  },
  base?: string,
): Promise<PoliceAnalysisResult> {
  const data = await request<{ ok: boolean; result: PoliceAnalysisResult }>(
    "/analyze",
    { method: "POST", body: JSON.stringify(input) },
    base,
  );
  return data.result;
}
