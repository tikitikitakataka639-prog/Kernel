import { Cpu, FileDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import { detectKernelReaction } from "@/lib/kernel-reactions";
import { downloadComplaintDraft } from "@/lib/kernel-complaint-export";
import { isComplaintDraftRequest } from "@/lib/kernel-chat-context";

const TOOL_LABELS: Record<string, string> = {
  leer_threads: "reconocimiento público de threads",
  consultar_normativa: "consulta normativa (BOE)",
  registrar_indicadores: "motor de evidencias y riesgo",
  registrar_alertas: "alertas de redes sociales · pendientes de revisión",
  kernel_search: "KERNEL SEARCH — búsqueda en internet",
  kernel_leer_pagina: "KERNEL SEARCH — lectura de página pública",
};

const SEARCH_TOOLS = ["tool-kernel_search", "tool-kernel_leer_pagina"];

/** Estado discreto de KERNEL SEARCH deducido de las partes del último mensaje. */
function searchState(messages: UIMessage[]): "idle" | "searching" | "done" {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last) return "idle";
  const parts = last.parts.filter((p) => SEARCH_TOOLS.includes(p.type));
  if (parts.length === 0) return "idle";
  const running = parts.some((p) => {
    const state = (p as { state?: string }).state;
    return state !== undefined && state !== "output-available" && state !== "output-error";
  });
  return running ? "searching" : "done";
}

export function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function KernelMessages({ messages, thinking }: { messages: UIMessage[]; thinking: boolean }) {
  const search = searchState(messages);
  return (
    <div className="flex flex-col gap-5">
      {messages.map((message, index) => {
        const text = messageText(message);
        const mine = message.role === "user";
        const previousUser = mine
          ? null
          : [...messages.slice(0, index)].reverse().find((item) => item.role === "user") ?? null;
        const reaction = previousUser ? detectKernelReaction(messageText(previousUser)) : null;
        const complaintReady = Boolean(
          !thinking && previousUser && isComplaintDraftRequest(messageText(previousUser)) && text.trim().length > 100,
        );
        const tools = message.parts
          .map((part) => (part.type.startsWith("tool-") ? part.type.replace("tool-", "") : ""))
          .filter(Boolean);

        return (
          <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                mine
                  ? "max-w-[85%] border border-border bg-secondary px-4 py-3 text-sm whitespace-pre-wrap text-secondary-foreground"
                  : "max-w-[92%] border-l-2 border-primary bg-card px-4 py-3 text-sm"
              }
            >
              {!mine && (
                <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-primary">
                  <Cpu className="size-3" /> K.E.R.N.E.L
                </p>
              )}
              {!mine && tools.length > 0 && (
                <ul className="mb-3 space-y-1 border-l border-border pl-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {[...new Set(tools)].map((t) => (
                    <li key={t}>▸ {TOOL_LABELS[t] ?? t}</li>
                  ))}
                </ul>
              )}
              {message.parts.some((p) => p.type === "file") && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {message.parts.map((part, i) =>
                    part.type === "file" && part.mediaType?.startsWith("image/") ? (
                      <img
                        key={i}
                        src={part.url}
                        alt="Captura aportada para el análisis"
                        className="max-h-40 border border-border"
                      />
                    ) : null,
                  )}
                </div>
              )}
              {mine ? (
                text
              ) : (
                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-primary prose-headings:tracking-widest prose-strong:text-foreground prose-a:text-primary">
                  <ReactMarkdown>{text}</ReactMarkdown>
                  {reaction ? (
                    <figure className="mt-4 max-w-sm space-y-2">
                      <img
                        src={reaction.src}
                        alt={reaction.alt}
                        loading="lazy"
                        className="max-h-72 max-w-full border border-border object-contain"
                      />
                      <figcaption className="text-xs text-muted-foreground">{reaction.caption}</figcaption>
                    </figure>
                  ) : null}
                  {complaintReady && previousUser ? (
                    <div className="mt-4 border border-primary/50 bg-background p-3">
                      <p className="text-[10px] uppercase tracking-widest text-primary">Borrador de denuncia preparado</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">El archivo es un borrador editable. KERNEL no lo presenta ni lo envía.</p>
                      <button
                        type="button"
                        onClick={() => downloadComplaintDraft(messageText(previousUser), text)}
                        className="mt-2 inline-flex items-center gap-2 border border-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <FileDown className="size-3.5" /> Descargar denuncia .txt
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {search === "searching" && (
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary kernel-pulse">
          KERNEL SEARCH — BUSCANDO EN INTERNET...
        </p>
      )}
      {search === "done" && (
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          KERNEL SEARCH — BÚSQUEDA COMPLETADA
        </p>
      )}
      {thinking && (
        <p className="text-xs uppercase tracking-widest text-muted-foreground kernel-pulse">
          kernel está procesando...
        </p>
      )}
    </div>
  );
}
