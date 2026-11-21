/**
 * CHAT LIBRARY + CONVERSATION MEMORY (nivel 1 y 2).
 *
 * Librería de conversaciones de Chat Normal, persistida en el navegador. Es la capa
 * intermedia entre la interfaz y el KERNEL AI ENGINE:
 *   Chat Normal -> Chat Library -> Conversation Memory -> KERNEL AI ENGINE
 *
 * Modular y sustituible: si en el futuro la persistencia pasa a un backend o la
 * memoria a búsqueda semántica (nivel 3), solo cambia este archivo.
 */
import type { UIMessage } from "ai";

const KEY = "kernel.chats.v1";

export type KernelChat = {
  id: string;
  titulo: string;
  creado: number;
  actualizado: number;
  messages: UIMessage[];
  /** Metadatos: nº de imágenes adjuntas, etc. */
  meta: { imagenes: number };
};

function browser(): boolean {
  return typeof window !== "undefined";
}

export function newId(): string {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function loadChats(): KernelChat[] {
  if (!browser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as KernelChat[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((c) => c && typeof c.id === "string")
          .map((c) => ({ ...c, meta: c.meta ?? { imagenes: 0 } }))
          .sort((a, b) => b.actualizado - a.actualizado)
      : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: KernelChat[]): void {
  if (!browser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(chats));
  } catch {
    /* cuota agotada: la conversación sigue viva en memoria */
  }
}

export function getChat(id: string): KernelChat | null {
  return loadChats().find((c) => c.id === id) ?? null;
}

export function createChat(id = newId()): KernelChat {
  const now = Date.now();
  const chat: KernelChat = {
    id,
    titulo: "Conversación nueva",
    creado: now,
    actualizado: now,
    messages: [],
    meta: { imagenes: 0 },
  };
  saveChats([chat, ...loadChats().filter((c) => c.id !== id)]);
  return chat;
}

export function upsertChat(chat: KernelChat): void {
  saveChats([chat, ...loadChats().filter((c) => c.id !== chat.id)]);
}

export function deleteChat(id: string): void {
  saveChats(loadChats().filter((c) => c.id !== id));
}

export function renameChat(id: string, titulo: string): void {
  saveChats(
    loadChats().map((c) => (c.id === id ? { ...c, titulo: titulo.trim() || c.titulo } : c)),
  );
}

export function messageText(message: UIMessage): string {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
}

export function autoTitle(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  if (!first) return null;
  const text = messageText(first).replace(/\s+/g, " ").trim();
  if (!text) return "Conversación con capturas";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

/** Persiste los mensajes de una conversación y actualiza título y metadatos. */
export function persistMessages(id: string, messages: UIMessage[]): void {
  const chats = loadChats();
  const existing = chats.find((c) => c.id === id) ?? createChat(id);
  const imagenes = messages.reduce(
    (acc, m) => acc + m.parts.filter((p) => p.type === "file").length,
    0,
  );
  const titulo =
    existing.titulo === "Conversación nueva" ? (autoTitle(messages) ?? existing.titulo) : existing.titulo;
  upsertChat({
    ...existing,
    titulo,
    messages,
    meta: { imagenes },
    actualizado: Date.now(),
  });
}

export function searchChats(chats: KernelChat[], query: string): KernelChat[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter(
    (c) =>
      c.titulo.toLowerCase().includes(q) ||
      c.messages.some((m) => messageText(m).toLowerCase().includes(q)),
  );
}

/**
 * MEMORIA RELEVANTE (nivel 2): selección acotada, no se envía todo el historial.
 * Nivel 3 (memoria semántica con embeddings) queda pendiente y se implementará
 * sustituyendo solo esta función.
 */
export function recallMemory(chat: KernelChat | null, prompt: string): {
  resumen?: string;
  fragmentos: string[];
} {
  if (!chat || chat.messages.length === 0) return { fragmentos: [] };
  const words = prompt
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 4);

  const scored = chat.messages
    .slice(0, Math.max(0, chat.messages.length - 8))
    .map((m) => {
      const text = messageText(m).replace(/\s+/g, " ").trim();
      const score = words.reduce((acc, w) => acc + (text.toLowerCase().includes(w) ? 1 : 0), 0);
      return { text, score, role: m.role };
    })
    .filter((x) => x.text.length > 0 && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    resumen: `Conversación "${chat.titulo}" iniciada el ${new Date(chat.creado).toLocaleDateString("es-ES")}, ${chat.messages.length} mensajes previos.`,
    fragmentos: scored.map((s) => `${s.role === "user" ? "Usuario" : "KERNEL"}: ${s.text.slice(0, 300)}`),
  };
}
