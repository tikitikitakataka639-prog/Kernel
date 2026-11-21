import { useChat } from "@ai-sdk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type UIMessage } from "ai";

import { QwenBrowserChatTransport } from "@/lib/qwen-browser-transport";
import { DEFAULT_QWEN_MODEL_ID, isQwenBrowserReady, loadQwenBrowserModel, useQwenBrowserStatus } from "@/lib/qwen-browser-engine";
import { useWebGPUStatus } from "@/lib/ai/hardware/WebGPUEngine";
import {
  ArrowUp,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { KernelMessages, messageText } from "@/components/kernel/KernelMessages";
import { KernelShell } from "@/components/kernel/KernelShell";
import { KernelVoiceButton } from "@/components/kernel/KernelVoiceButton";
import { useKernelVoice } from "@/lib/kernel-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  createChat,
  deleteChat,
  getChat,
  loadChats,
  persistMessages,
  recallMemory,
  renameChat,
  searchChats,
  type KernelChat,
} from "@/lib/kernel-chats";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversación — K.E.R.N.E.L." },
      {
        name: "description",
        content: "Chat General de KERNEL con modelo Qwen3.5 ejecutado en el navegador.",
      },
      { property: "og:title", content: "Conversación — K.E.R.N.E.L." },
      {
        property: "og:description",
        content: "Conversación local en el navegador con historial de KERNEL y voz.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatThreadPage,
});

const SUGGESTIONS = [
  "¿Qué hago si un adulto escribe a mi hija en Threads?",
  "Explícame qué dice la ley española sobre el grooming",
  "Necesito desahogarme un rato",
];


function ChatThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatThread key={threadId} threadId={threadId} />;
}

function ChatThread({ threadId }: { threadId: string }) {
  const navigate = useNavigate();
  const [chats, setChats] = useState<KernelChat[]>([]);
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const autoLoadStarted = useRef(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(() => getChat(threadId) ?? createChat(threadId), [threadId]);

  const modelStatus = useQwenBrowserStatus();
  const modelReady = isQwenBrowserReady();
  const gpuStatus = useWebGPUStatus();
  const transport = useMemo(() => new QwenBrowserChatTransport(), []);
  const engineLabel = modelReady
    ? `${modelStatus.modelId === "qwen35-4b-deep" ? "QWEN3.5-4B" : "QWEN3.5-2B"} · ${modelStatus.backend ?? "modelo listo"}`
    : modelStatus.phase === "downloading" ? `descargando Qwen · ${Math.round(modelStatus.progress * 100)}%`
      : modelStatus.phase === "loading" ? "inicializando Qwen y WebGPU…"
        : modelStatus.phase === "error" ? "error al iniciar el motor · revisa el estado inferior"
          : gpuStatus.disponible ? "WebGPU listo · preparando Qwen" : "inicializando WebGPU…";
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initial.messages,
    transport,
    onError: (error) => toast.error(error.message || "KERNEL no ha podido generar una respuesta con el modelo local."),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (autoLoadStarted.current || modelReady || modelStatus.phase === "error") return;
    autoLoadStarted.current = true;
    // Al entrar en Chat General se activa el modelo predeterminado. Si ya está
    // en OPFS se restaura; si es la primera visita comienza la descarga con progreso.
    void loadQwenBrowserModel(DEFAULT_QWEN_MODEL_ID).catch((loadError) => {
      const message = loadError instanceof Error ? loadError.message : "No se pudo iniciar Qwen.";
      toast.error(message);
    });
  }, [modelReady, modelStatus.phase]);

  const submitRef = useRef<(text: string) => void>(() => {});
  const voice = useKernelVoice({
    onTranscript: (text) => submitRef.current(text),
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    for (const message of initial.messages) voice.markSpoken(message.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (busy || !voice.enabled) return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last) voice.announce(last.id, messageText(last as UIMessage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, voice.enabled]);

  useEffect(() => {
    setChats(loadChats());
  }, [threadId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [busy, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (messages.length === 0) return;
    persistMessages(threadId, messages as UIMessage[]);
    if (!busy) setChats(loadChats());
  }, [messages, busy, threadId]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    if (!modelReady) {
      toast.error("KERNEL todavía está preparando Qwen y WebGPU. Espera a que termine la carga automática.");
      return;
    }
    void sendMessage({ text: value });
    setInput("");
  };

  submitRef.current = submit;

  const nuevoChat = () => {
    const chat = createChat();
    setChats(loadChats());
    setMobileOpen(false);
    void navigate({ to: "/chat/$threadId", params: { threadId: chat.id } });
  };

  const abrir = (id: string) => {
    setMobileOpen(false);
    if (id !== threadId) void navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  const borrar = (id: string) => {
    deleteChat(id);
    const rest = loadChats();
    setChats(rest);
    if (id === threadId) {
      const target = rest[0] ?? createChat();
      void navigate({ to: "/chat/$threadId", params: { threadId: target.id }, replace: true });
    }
  };

  const renombrar = (chat: KernelChat) => {
    const titulo = window.prompt("Nuevo nombre de la conversación:", chat.titulo);
    if (titulo === null) return;
    renameChat(chat.id, titulo);
    setChats(loadChats());
  };

  const visibles = searchChats(chats, query);

  const library = (
    <div className="flex h-full flex-col gap-2 border-border bg-card p-2">
      <Button
        onClick={nuevoChat}
        className="w-full justify-start gap-2 text-[10px] uppercase tracking-widest"
      >
        <Plus className="size-4" /> nuevo chat
      </Button>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar"
          className="h-8 border-border bg-background pl-7 text-[11px]"
        />
      </div>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
        conversaciones · {visibles.length}
      </p>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {visibles.map((chat) => {
          const active = chat.id === threadId;
          return (
            <li
              key={chat.id}
              className={`group flex items-center gap-1 border px-2 py-2 text-xs ${
                active
                  ? "border-primary bg-secondary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <button onClick={() => abrir(chat.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate">{chat.titulo}</span>
                <span className="block text-[10px] uppercase tracking-widest opacity-70">
                  {new Date(chat.actualizado).toLocaleDateString("es-ES")}
                  {chat.meta.imagenes > 0 ? ` · ${chat.meta.imagenes} img` : ""}
                </span>
              </button>
              <button
                onClick={() => renombrar(chat)}
                aria-label={`Renombrar ${chat.titulo}`}
                className="opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => borrar(chat.id)}
                aria-label={`Eliminar ${chat.titulo}`}
                className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="px-2 py-3 text-xs text-muted-foreground">Sin resultados.</li>
        )}
      </ul>
    </div>
  );

  return (
    <KernelShell
      title="CHAT GENERAL"
      subtitle="K.E.R.N.E.L · inferencia privada en el navegador"
      status={
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="size-2 rounded-full bg-primary kernel-pulse" />
          {busy ? "generando en el navegador" : engineLabel}
        </span>
      }
    >
      <div className="flex flex-1 gap-3">
        {sidebar && (
          <aside className="hidden w-52 shrink-0 border border-border md:block">{library}</aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setSidebar((v) => !v)}
            >
              {sidebar ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <PanelLeftOpen className="size-4" />
            </Button>
            <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground" role="status">
              {modelReady ? `${modelStatus.modelId === "qwen35-4b-deep" ? "QWEN 4B" : "QWEN 2B"} LISTO · ${modelStatus.backend ?? "WASM"}` : engineLabel.toUpperCase()}
            </span>
            {modelStatus.lastResponseMs !== null && !busy && (
              <span className="text-[9px] text-muted-foreground" title="Tiempo medido de la última respuesta">
                ÚLTIMA: {(modelStatus.lastResponseMs / 1000).toFixed(1)} s
              </span>
            )}
            {!modelReady && modelStatus.phase === "error" && (
              <Link to="/ajustes" className="border border-primary px-3 py-1.5 text-[10px] font-bold tracking-widest text-primary hover:bg-primary hover:text-primary-foreground">
                REVISAR MOTOR
              </Link>
            )}
          </div>
          {!modelReady && (modelStatus.phase === "downloading" || modelStatus.phase === "loading") && (
            <div className="mb-3 space-y-1 border border-primary/40 bg-card p-2" role="status" aria-live="polite">
              <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{modelStatus.detail}</span>
                <span className="shrink-0">{Math.round(modelStatus.progress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden bg-background">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(1, modelStatus.progress * 100)}%` }} />
              </div>
            </div>
          )}
          <p className="mb-3 text-[11px] text-muted-foreground">
            Qwen3.5-2B en modo rápido (4B opcional) se ejecuta dentro de este navegador. Las conversaciones se guardan en KERNEL;
            el texto no se envía a un proveedor externo. Este modelo está configurado para texto: usa
            POLICE MODE para revisar capturas e imágenes.
          </p>

          {messages.length === 0 && (
            <section className="space-y-4">
              <div className="border border-border bg-card p-5 text-sm leading-relaxed text-foreground">
                {modelReady
                  ? "Aquí hablamos de lo que quieras: dudas, situaciones raras que has visto, papeleo, normativa o simplemente desahogarte. Cada conversación se guarda en KERNEL."
                  : modelStatus.phase === "error"
                    ? `No se pudo activar Qwen automáticamente: ${modelStatus.error ?? "error desconocido"}`
                    : "KERNEL está inicializando WebGPU y preparando Qwen3.5-2B. En una primera visita descarga el modelo; después lo recupera desde la caché de este navegador."}
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="border border-border bg-secondary px-3 py-2 text-left text-xs text-secondary-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}

          {busy && modelStatus.phase === "generating" ? (
            <p className="mb-2 text-[10px] text-muted-foreground" role="status" aria-live="polite">
              {modelStatus.detail || "Qwen está generando en este navegador…"}
            </p>
          ) : null}
          {error ? (
            <div className="mb-3 border border-destructive/60 bg-destructive/5 p-3 text-[11px]" role="alert">
              <p className="font-semibold text-destructive">La generación se ha detenido.</p>
              <p className="mt-1 whitespace-pre-wrap text-foreground">{error.message || "El modelo local no pudo completar la respuesta."}</p>
              <p className="mt-1 text-muted-foreground">El motor no seguirá procesando en segundo plano. Puedes acortar el mensaje o volver a intentarlo.</p>
            </div>
          ) : null}
          <div className="flex-1">
            <KernelMessages messages={messages} thinking={busy} />
            <div ref={bottomRef} />
          </div>

          <form
            className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-3 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <div className="mb-3">
              <KernelVoiceButton
                state={voice.state === "idle" && busy ? "thinking" : voice.state}
                enabled={voice.enabled}
                paused={voice.paused}
                supported={voice.supported}
                level={voice.level}
                partial={voice.partial}
                transcript={voice.draft}
                error={voice.voiceError}
                canRetry={voice.canRetry}
                voices={voice.voices}
                voiceId={voice.voiceId}
                onChooseVoice={voice.chooseVoice}
                onRetry={voice.retry}
                onToggleListening={voice.toggleListening}
                onCancelListening={voice.cancelListening}
                onToggleEnabled={() => voice.setEnabled(!voice.enabled)}
                onPause={voice.pause}
                onStop={voice.stopAudio}
              />
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                rows={2}
                placeholder={modelReady ? "Escribe lo que necesites contar o preguntar..." : "Descarga el modelo desde Ajustes para empezar…"}
                className="min-h-[52px] resize-none border-border bg-card text-sm"
              />
              {busy ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Dejar de esperar"
                  onClick={() => {
                    void stop();
                    toast.info("Generación detenida.");
                  }}
                >
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() || !modelReady}>
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-20 flex md:hidden">
          <div className="w-64 max-w-[75%] border-r border-border bg-background">{library}</div>
          <button
            aria-label="Cerrar librería"
            className="flex-1 bg-background/70"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}
      <Toaster />
    </KernelShell>
  );
}
