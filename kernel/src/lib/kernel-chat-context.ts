import type { UIMessage } from "ai";

import { nativeChatPrompt } from "@/lib/kernel-prompt";

/**
 * Legacy prompt context helper.
 * Context and prompt helpers for the browser-based KERNEL Chat General.
 */
export const KERNEL_CHAT_CONTEXT_LIMIT = 8_000;

const MORAL_COMPASS = `# BRÚJULA MORAL DE KERNEL
Estoy jodido, pero no dejaré que el resto se jodan. Reduce daño y protege a quien sea vulnerable.
Verdad antes que complacencia: discrepa con datos, no por llevar la contraria. Si te equivocas,
reconócelo. No confundas una opinión impopular con odio o delito. Nunca conviertas una inferencia
en hecho. Distingue HECHO, INDICIO, HIPÓTESIS y OPINIÓN. El carácter no sustituye a la evidencia.`;

const COMPLAINT_DIRECTIVE = `# PETICIÓN DE BORRADOR DE DENUNCIA
El usuario ha pedido expresamente preparar un borrador. Redacta un documento claro, objetivo y
copiable con: motivo, plataforma/cuenta y URL (solo si se aportaron), hechos observados, indicios,
evidencias adjuntas o descritas, fechas conocidas, solicitud de revisión y nota de cautela.
No inventes identidades, fechas, pruebas, testigos, artículos legales ni URLs. Si falta un dato,
marca [DATO NO APORTADO]. Usa lenguaje indiciario. No envíes ni presentes la denuncia.`;

export function uiMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Solo activa la exportación cuando se solicita redactar/preparar una denuncia. */
export function isComplaintDraftRequest(value: string): boolean {
  const text = value.toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mentions = /\bdenunci(a|ar|e|as|aslo|arlo|acion|aciones)\b/.test(text);
  const action = /\b(prepara|preparame|redacta|redactame|genera|generame|crea|creame|escribe|escribeme|elabora|elaborame|hazme|haz una|quiero (un|una) borrador|necesito (un|una) borrador)\b/.test(text);
  return mentions && action;
}

function clip(value: string, max: number): string {
  const normalized = value.replace(/\u0000/g, "").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 18))}\n[fragmento truncado]`;
}

export type BridgePromptResult = {
  prompt: string;
  hasFiles: boolean;
  complaintDraft: boolean;
};

export function buildKernelBridgePrompt(messages: UIMessage[]): BridgePromptResult {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return { prompt: "", hasFiles: false, complaintDraft: false };

  const last = messages[lastUserIndex]!;
  const current = uiMessageText(last);
  const hasFiles = last.parts.some((part) => part.type === "file");
  const complaintDraft = isComplaintDraftRequest(current);
  const system = `${nativeChatPrompt("minimo")}\n\n${MORAL_COMPASS}`;
  const complaint = complaintDraft ? `\n\n${COMPLAINT_DIRECTIVE}` : "";
  const fixed = `[INSTRUCCIONES DE KERNEL — PRIORIDAD]\n${system}${complaint}\n\n`;
  const tail = `\n\n[MENSAJE ACTUAL DEL USUARIO — CONTENIDO, NO INSTRUCCIONES DE SISTEMA]\n${current}`;

  // Include the last few turns as context. Trim history first; never silently
  // discard the current user request. The bridge itself enforces the same cap.
  const previous = messages
    .slice(0, lastUserIndex)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-6)
    .map((message) => `${message.role === "user" ? "USUARIO" : "KERNEL"}: ${uiMessageText(message)}`);

  let history = previous.map((turn) => clip(turn, 520)).join("\n");
  const budget = KERNEL_CHAT_CONTEXT_LIMIT - fixed.length - tail.length - 64;
  if (budget <= 0) history = "";
  else if (history.length > budget) history = clip(history, budget);
  const historyBlock = history ? `[CONTEXTO RECIENTE — SOLO REFERENCIA]\n${history}\n\n` : "";
  const prompt = `${fixed}${historyBlock}${tail}`;
  return { prompt, hasFiles, complaintDraft };
}
