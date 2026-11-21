import { z } from "zod";

export const PLATFORMS = [
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], hint: "URL pública de vídeo o canal, texto, capturas y transcripción aportada." },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.watch"], hint: "URL pública de publicación o perfil, texto y capturas. El contenido que exige sesión no es accesible." },
  { id: "threads", label: "Threads", hosts: ["threads.net", "threads.com"], hint: "URL pública o @usuario, comentarios y capturas. La lectura pública puede estar restringida." },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"], hint: "URL pública de vídeo o perfil, texto, capturas y transcripción aportada." },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"], hint: "URL pública de publicación o perfil, texto y capturas. No se accede a contenido privado." },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"], hint: "URL pública de publicación o perfil, texto, capturas y transcripción aportada." },
  { id: "reddit", label: "Reddit", hosts: ["reddit.com", "redd.it"], hint: "URL pública de hilo o comentario, texto y capturas. No se accede a comunidades restringidas." },
  { id: "other", label: "Otras plataformas", hosts: [], hint: "URL pública HTTP/HTTPS, texto, capturas o transcripción aportada." },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const CATEGORIES = [
  { id: "fraud", label: "Estafas, fraude y suplantación" },
  { id: "phishing", label: "Phishing y enlaces maliciosos" },
  { id: "violence", label: "Amenazas creíbles de violencia" },
  { id: "exploitation", label: "Explotación sexual ilegal y menores" },
  { id: "illegal_goods", label: "Bienes ilegales" },
  { id: "harassment", label: "Acoso, extorsión y amenazas" },
  { id: "other", label: "Otros posibles incumplimientos" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const REVIEW_STATUSES = ["Pendiente de revisión", "Revisado", "Falso positivo", "Confirmado por un revisor"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const alertSchema = z.object({
  categoria: z.enum(["fraud", "phishing", "violence", "exploitation", "illegal_goods", "harassment", "other"]),
  naturaleza: z.enum(["posible_ilegalidad", "posible_infraccion_plataforma", "ofensivo_o_controvertido"]),
  evidencia: z.string().min(1),
  origen: z.enum(["texto_aportado", "imagen_aportada", "lectura_publica", "transcripcion_aportada", "datos_aportados"]),
  referencia: z.string().min(1),
  confianza: z.number().min(0).max(100),
  motivo: z.string().min(1),
});
export type SocialAlert = z.infer<typeof alertSchema>;

export function generateSocialReport(input: {
  platform: PlatformId;
  url: string;
  date: string;
  report: string;
  alerts: Array<SocialAlert & { id: string }>;
  reviews: Record<string, ReviewStatus>;
}): string {
  const platform = PLATFORMS.find((p) => p.id === input.platform);
  return `# INFORME K.E.R.N.E.L.\n\nPlataforma: ${platform?.label}\nOrigen: ${input.url || "contenido aportado sin URL"}\nFecha/hora de análisis: ${input.date}\n\n${input.report}\n\n## ALERTAS Y REVISIÓN HUMANA\n${input.alerts.map((a) => `\n### ${CATEGORIES.find((c) => c.id === a.categoria)?.label}\nNaturaleza: ${a.naturaleza}\nEvidencia: ${a.evidencia}\nReferencia: ${a.origen} · ${a.referencia}\nConfianza estimada: ${a.confianza}%\nMotivo: ${a.motivo}\nEstado: ${input.reviews[a.id] ?? "Pendiente de revisión"}\n`).join("")}\nLa revisión humana no constituye una sentencia jurídica.\n`;
}

export function normalizeSocialTarget(input: string, platform: PlatformId): string {
  const value = input.trim();
  if (!value) return "";
  if (platform === "threads" && /^@?[\w.]+$/.test(value)) return `https://www.threads.net/@${value.replace(/^@/, "")}`;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Introduce una URL pública completa con https://."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Solo se admiten URLs públicas HTTP/HTTPS sin credenciales.");
  const hosts: readonly string[] = PLATFORMS.find((p) => p.id === platform)?.hosts ?? [];
  if (hosts.length && !hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) throw new Error("La URL no corresponde a la plataforma seleccionada.");
  return url.toString();
}

export function validateAnalysisInput(input: { url: string; platform: PlatformId; text: string; transcript: string; images: number; categories: CategoryId[] }) {
  const target = normalizeSocialTarget(input.url, input.platform);
  if (!target && !input.text.trim() && !input.transcript.trim() && input.images === 0) throw new Error("Añade una URL, texto, una transcripción o una captura para analizar.");
  if (!input.categories.length) throw new Error("Selecciona al menos una categoría de análisis.");
  return target;
}

/** Only validated tool outputs become reviewable alerts; never parse prose as evidence. */
export function readSocialAlerts(messages: Array<{ id: string; role: string; parts: readonly unknown[] }>): Array<SocialAlert & { id: string }> {
  return messages.filter((m) => m.role === "assistant").flatMap((m) => m.parts.flatMap((part, index) => {
    if (!part || typeof part !== "object") return [];
    const p = part as { type?: string; state?: string; output?: unknown };
    if (p.type !== "tool-registrar_alertas" || p.state !== "output-available") return [];
    const output = z.object({ alertas: z.array(alertSchema) }).safeParse(p.output);
    return output.success ? output.data.alertas.map((a, i) => ({ ...a, id: `${m.id}-${index}-${i}` })) : [];
  }));
}