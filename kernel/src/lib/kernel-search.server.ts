/**
 * KERNEL SEARCH — capacidad de acceso a Internet de KERNEL.
 *
 * Módulo INDEPENDIENTE de KERNEL CORE y del proveedor de modelo. El modelo no
 * implementa la búsqueda: solo invoca este módulo como herramienta interna.
 *
 *   KERNEL CORE -> KERNEL SEARCH -> INTERNET
 *
 * Arquitectura modular: cada proveedor implementa `SearchProvider` y se registra
 * en PROVIDERS por orden de preferencia. Añadir o quitar proveedores no obliga a
 * tocar el motor, la memoria, las herramientas ni la interfaz.
 *
 * PRIVACIDAD: solo se envía la consulta necesaria. Nunca se usan cookies, tokens,
 * credenciales ni contenido tras autenticación, y no se intenta saltar CAPTCHA ni
 * ninguna medida de acceso.
 */

export type SearchHit = {
  titulo: string;
  url: string;
  extracto: string;
  proveedor: string;
};

export type SearchResult = {
  ok: boolean;
  disponible: boolean;
  proveedor: string;
  query: string;
  resumen?: string;
  resultados?: SearchHit[];
  motivo?: string;
};

export type PageRead = {
  ok: boolean;
  url: string;
  titulo?: string;
  contenido?: string;
  motivo?: string;
};

type SearchProvider = {
  id: string;
  /** Config lista para usar, o null si el proveedor no está disponible. */
  config: () => Record<string, string> | null;
  search: (query: string, config: Record<string, string>) => Promise<SearchResult>;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();
}

/** SearXNG autoalojado o de confianza (API JSON). Preferente si está configurado. */
const searxng: SearchProvider = {
  id: "searxng",
  config: () => {
    const url = process.env["SEARXNG_URL"];
    if (!url || url.trim().length === 0) return null;
    const config: Record<string, string> = { url: normalizeBaseUrl(url) };
    const key = process.env["SEARXNG_API_KEY"];
    if (key) config["apiKey"] = key;
    return config;
  },
  search: async (query, config) => {
    const endpoint = new URL(`${config["url"]}/search`);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("language", "es");
    endpoint.searchParams.set("safesearch", "1");

    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": UA };
    if (config["apiKey"]) headers["Authorization"] = `Bearer ${config["apiKey"]}`;

    const res = await fetch(endpoint, { method: "GET", headers });
    if (!res.ok) {
      return {
        ok: false,
        disponible: true,
        proveedor: "searxng",
        query,
        motivo: `La instancia de SearXNG respondió HTTP ${res.status}.`,
      };
    }
    const data = (await res.json()) as {
      answers?: string[];
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const resumen = data.answers?.filter(Boolean).join(" ");
    return {
      ok: true,
      disponible: true,
      proveedor: "searxng",
      query,
      ...(resumen ? { resumen } : {}),
      resultados: (data.results ?? []).slice(0, 8).map((r) => ({
        titulo: r.title ?? "",
        url: r.url ?? "",
        extracto: (r.content ?? "").slice(0, 1200),
        proveedor: "searxng",
      })),
    };
  },
};

/** DuckDuckGo HTML público (sin API key). Búsqueda general abierta por defecto. */
const duckduckgo: SearchProvider = {
  id: "duckduckgo",
  config: () => ({}),
  search: async (query) => {
    const endpoint = new URL("https://html.duckduckgo.com/html/");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("kl", "es-es");
    const res = await fetch(endpoint, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "es-ES,es;q=0.9" },
    });
    if (!res.ok) {
      return {
        ok: false,
        disponible: true,
        proveedor: "duckduckgo",
        query,
        motivo: `El buscador respondió HTTP ${res.status}.`,
      };
    }
    const html = await res.text();
    const resultados: SearchHit[] = [];
    const blocks = html.split(/<div class="result[\s"]/i).slice(1);
    for (const block of blocks) {
      const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      let url = decodeEntities(link[1] ?? "");
      const redirect = url.match(/uddg=([^&]+)/);
      if (redirect?.[1]) url = decodeURIComponent(redirect[1]);
      if (!/^https?:\/\//.test(url)) continue;
      resultados.push({
        titulo: htmlToText(link[2] ?? "").slice(0, 300),
        url,
        extracto: htmlToText(snippet?.[1] ?? "").slice(0, 1200),
        proveedor: "duckduckgo",
      });
      if (resultados.length >= 8) break;
    }
    if (resultados.length === 0) {
      return {
        ok: false,
        disponible: true,
        proveedor: "duckduckgo",
        query,
        motivo: "El buscador no devolvió resultados legibles para esta consulta.",
      };
    }
    return { ok: true, disponible: true, proveedor: "duckduckgo", query, resultados };
  },
};

/** Wikipedia (API pública) como red de seguridad enciclopédica. */
const wikipedia: SearchProvider = {
  id: "wikipedia",
  config: () => ({}),
  search: async (query) => {
    const endpoint = new URL("https://es.wikipedia.org/w/api.php");
    endpoint.searchParams.set("action", "query");
    endpoint.searchParams.set("list", "search");
    endpoint.searchParams.set("srsearch", query);
    endpoint.searchParams.set("srlimit", "5");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("origin", "*");
    const res = await fetch(endpoint, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      return {
        ok: false,
        disponible: true,
        proveedor: "wikipedia",
        query,
        motivo: `Wikipedia respondió HTTP ${res.status}.`,
      };
    }
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    const resultados = (data.query?.search ?? []).map((r) => ({
      titulo: r.title ?? "",
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent((r.title ?? "").replace(/ /g, "_"))}`,
      extracto: htmlToText(r.snippet ?? "").slice(0, 800),
      proveedor: "wikipedia",
    }));
    if (resultados.length === 0) {
      return {
        ok: false,
        disponible: true,
        proveedor: "wikipedia",
        query,
        motivo: "Sin resultados en Wikipedia.",
      };
    }
    return { ok: true, disponible: true, proveedor: "wikipedia", query, resultados };
  },
};

/** Registro de proveedores por orden de preferencia. */
const PROVIDERS: SearchProvider[] = [searxng, duckduckgo, wikipedia];

export type SearchStatus = { disponible: boolean; proveedor: string | null; proveedores: string[] };

/** Estado de KERNEL SEARCH sin realizar ninguna llamada externa. */
export function kernelSearchStatus(): SearchStatus {
  const activos = PROVIDERS.filter((p) => p.config() !== null).map((p) => p.id);
  return {
    disponible: activos.length > 0,
    proveedor: activos[0] ?? null,
    proveedores: activos,
  };
}

/**
 * Búsqueda abierta en Internet. Recorre los proveedores disponibles en orden y
 * devuelve el primero que aporte resultados; los fallos se degradan al siguiente.
 */
export async function kernelSearch(query: string): Promise<SearchResult> {
  const limpio = query.trim().slice(0, 400);
  if (limpio.length === 0) {
    return {
      ok: false,
      disponible: true,
      proveedor: "ninguno",
      query,
      motivo: "Consulta vacía.",
    };
  }

  const fallos: string[] = [];
  for (const provider of PROVIDERS) {
    const config = provider.config();
    if (!config) continue;
    try {
      const result = await provider.search(limpio, config);
      if (result.ok) return result;
      fallos.push(`${provider.id}: ${result.motivo ?? "sin resultados"}`);
    } catch (error) {
      fallos.push(
        `${provider.id}: ${error instanceof Error ? error.message : "fallo de red"}`,
      );
    }
  }

  return {
    ok: false,
    disponible: PROVIDERS.some((p) => p.config() !== null),
    proveedor: "ninguno",
    query: limpio,
    motivo:
      fallos.length > 0
        ? `Ningún proveedor devolvió resultados (${fallos.join(" | ")}). No inventes resultados.`
        : "No hay proveedores de búsqueda disponibles. No inventes resultados.",
  };
}

const BLOCKED_HOSTS = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Lectura de una página PÚBLICA. Sin cookies, sin credenciales, sin tokens y sin
 * intentos de saltar autenticación ni CAPTCHA: si la página exige sesión, se
 * informa y se abandona.
 */
export async function kernelReadPage(rawUrl: string): Promise<PageRead> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, url: rawUrl, motivo: "URL no válida." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, url: rawUrl, motivo: "Solo se admiten URLs http/https." };
  }
  if (BLOCKED_HOSTS.test(url.hostname)) {
    return { ok: false, url: rawUrl, motivo: "Destino interno bloqueado por seguridad." };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-ES,es;q=0.9" },
      redirect: "follow",
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        url: url.toString(),
        motivo: `La página exige autenticación o bloquea el acceso (HTTP ${res.status}). No se intenta saltar la restricción.`,
      };
    }
    if (!res.ok) {
      return { ok: false, url: url.toString(), motivo: `HTTP ${res.status}.` };
    }
    const html = await res.text();
    const titulo = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 300);
    const contenido = htmlToText(html).slice(0, 12000);
    if (contenido.length === 0) {
      return { ok: false, url: url.toString(), titulo, motivo: "Sin contenido legible." };
    }
    return { ok: true, url: url.toString(), titulo, contenido };
  } catch (error) {
    return {
      ok: false,
      url: url.toString(),
      motivo: error instanceof Error ? error.message : "fallo de red",
    };
  }
}
