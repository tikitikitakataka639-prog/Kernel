const THREADS_HOSTS = ["threads.net", "www.threads.net", "threads.com", "www.threads.com"];

export function extractThreadsUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)"'<]+/g) ?? [];
  return matches
    .filter((url) => {
      try {
        return THREADS_HOSTS.includes(new URL(url).hostname);
      } catch {
        return false;
      }
    })
    .slice(0, 3);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ThreadsCapture = {
  url: string;
  ok: boolean;
  status?: number;
  content?: string;
  error?: string;
};

/**
 * Lectura pública (sin sesión) de un perfil o post de Threads.
 * Threads bloquea buena parte del contenido a visitantes anónimos, por eso el
 * resultado puede venir vacío: en ese caso KERNEL pedirá los comentarios pegados.
 */
export async function captureThreads(url: string): Promise<ThreadsCapture> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return { url, ok: false, status: res.status, error: `HTTP ${res.status}` };
    const html = await res.text();
    const meta = [
      ...html.matchAll(/<meta[^>]+(?:property|name)="(og:[^"]+|description)"[^>]+content="([^"]*)"/gi),
    ]
      .map((m) => `${m[1]}: ${m[2]}`)
      .join("\n");
    const body = htmlToText(html).slice(0, 6000);
    const content = [meta, body].filter(Boolean).join("\n\n");
    return { url, ok: content.length > 0, content, status: res.status };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : "fetch failed" };
  }
}
