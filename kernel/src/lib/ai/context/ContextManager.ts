/**
 * CONTEXT MANAGER — historial, ventana de contexto y resumen por poda.
 *
 * Mantiene el system prompt, conserva los mensajes más recientes que caben en el
 * presupuesto de tokens y resume (de forma extractiva, sin inventar) lo que se
 * queda fuera. Preparado para memoria persistente: `snapshot()`/`restore()` ya
 * devuelven y aceptan el estado completo serializable.
 */
import type { ChatMessage, MessagePart } from "@/lib/ai/types";

export type ContextSnapshot = {
  system: string;
  resumen: string | null;
  mensajes: ChatMessage[];
};

/** Estimación de tokens: ~4 caracteres por token para castellano. Se marca como estimación. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function partsToText(parts: MessagePart[]): string {
  return parts
    .map((p) => (p.type === "text" ? p.text : "[imagen adjunta]"))
    .join("\n")
    .trim();
}

export function partsToImages(parts: MessagePart[]): string[] {
  return parts.filter((p): p is Extract<MessagePart, { type: "image" }> => p.type === "image").map((p) => p.dataUrl);
}

export class ContextManager {
  private system: string;
  private mensajes: ChatMessage[] = [];
  private resumen: string | null = null;

  constructor(system: string) {
    this.system = system;
  }

  setSystem(system: string) {
    this.system = system;
  }

  add(message: ChatMessage) {
    this.mensajes.push(message);
  }

  get historial(): ChatMessage[] {
    return this.mensajes;
  }

  clear() {
    this.mensajes = [];
    this.resumen = null;
  }

  snapshot(): ContextSnapshot {
    return { system: this.system, resumen: this.resumen, mensajes: this.mensajes };
  }

  restore(snapshot: ContextSnapshot) {
    this.system = snapshot.system;
    this.resumen = snapshot.resumen;
    this.mensajes = snapshot.mensajes;
  }

  /**
   * Construye la ventana que se envía al modelo respetando el presupuesto.
   * Los mensajes antiguos que no caben se comprimen en un resumen extractivo
   * (primeras líneas de cada intervención), nunca inventado.
   */
  build(contextTokens: number): Array<{ role: string; content: string; images?: string[] }> {
    const reservado = estimateTokens(this.system) + 64;
    let presupuesto = Math.max(256, contextTokens - reservado);

    const incluidos: ChatMessage[] = [];
    const excluidos: ChatMessage[] = [];
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const m = this.mensajes[i];
      if (!m) continue;
      const coste = estimateTokens(partsToText(m.parts)) + 8;
      if (coste <= presupuesto) {
        presupuesto -= coste;
        incluidos.unshift(m);
      } else {
        excluidos.unshift(m);
      }
    }

    if (excluidos.length > 0) {
      const lineas = excluidos
        .map((m) => {
          const texto = partsToText(m.parts).split("\n")[0] ?? "";
          const etiqueta = m.role === "user" ? "Usuario" : "KERNEL";
          return `- ${etiqueta}: ${texto.slice(0, 180)}`;
        })
        .slice(-12);
      this.resumen = `Resumen de la parte antigua de la conversación (extracto literal, sin interpretación):\n${lineas.join("\n")}`;
    }

    const system = this.resumen ? `${this.system}\n\n${this.resumen}` : this.system;
    return [
      { role: "system", content: system },
      ...incluidos.map((m) => {
        const images = partsToImages(m.parts);
        return images.length > 0
          ? { role: m.role, content: partsToText(m.parts), images }
          : { role: m.role, content: partsToText(m.parts) };
      }),
    ];
  }
}
