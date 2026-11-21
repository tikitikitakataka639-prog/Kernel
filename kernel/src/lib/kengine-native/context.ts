/**
 * Preparación del contexto para el motor local. Puro y sin WebLLM: testeable.
 * KERNEL conserva el historial completo; aquí solo se recorta lo que se envía
 * al modelo con presupuestos compactos para reducir prefill y latencia.
 */
import type { UIMessage } from "ai";

import type { NativeModel } from "@/lib/kengine-native/catalog";
import { nativeAnalysisPrompt, nativeChatPrompt } from "@/lib/kernel-prompt";

export type NativeChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Presupuesto aproximado (caracteres de historial y tokens de salida) por modelo. */
export const CONTEXT_BUDGET: Record<
  NativeModel["id"],
  { historyChars: number; maxTokens: number; prompt: "minimo" | "completo" }
> = {
  "qwen2.5-0.5b": { historyChars: 1800, maxTokens: 96, prompt: "minimo" },
  "llama-3.2-1b": { historyChars: 2000, maxTokens: 112, prompt: "minimo" },
  "qwen2.5-1.5b": { historyChars: 2400, maxTokens: 128, prompt: "minimo" },
  "llama-3.2-3b": { historyChars: 2800, maxTokens: 144, prompt: "minimo" },
};

function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export function buildNativeMessages(
  messages: UIMessage[],
  modelId: NativeModel["id"],
  mode: "chat" | "analysis" = "chat",
): NativeChatMessage[] {
  const budget = CONTEXT_BUDGET[modelId];
  const turns: NativeChatMessage[] = [];
  let used = 0;
  // Del más reciente al más antiguo hasta agotar el presupuesto.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    let content = textOf(m);
    if (!content) continue;
    const room = budget.historyChars - used;
    if (room <= 0) break;
    if (content.length > room) {
      // El último mensaje del usuario siempre entra, recortado por el principio.
      if (turns.length > 0) break;
      content = content.slice(content.length - room);
    }
    used += content.length;
    turns.unshift({ role: m.role, content });
  }
  // El modelo debe empezar por un turno de usuario.
  while (turns[0]?.role === "assistant") turns.shift();
  const systemPrompt = mode === "analysis" ? nativeAnalysisPrompt() : nativeChatPrompt(budget.prompt);
  return [{ role: "system", content: systemPrompt }, ...turns];
}
