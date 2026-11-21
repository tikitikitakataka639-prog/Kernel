/**
 * Transporte del chat para el motor local: streaming real de tokens desde el
 * worker WebLLM. No llama a /api/chat ni a ningún servidor.
 */
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import { buildNativeMessages, CONTEXT_BUDGET } from "@/lib/kengine-native/context";
import { NativeEngineError, nativeEngine } from "@/lib/kengine-native/engine";
import { nativeStore } from "@/lib/kengine-native/store";

export class KEngineNativeChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly mode: "chat" | "analysis" = "chat") {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) {
    const modelId = nativeEngine.modelId;
    if (!modelId) throw new NativeEngineError("not-loaded", "Carga un modelo local en Ajustes.");
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const hasFiles = lastUser?.parts.some((part) => part.type === "file") ?? false;
    if (hasFiles) {
      throw new NativeEngineError("generation-failed", "El modelo local no admite imágenes.");
    }
    const mode = this.mode;
    const input = buildNativeMessages(messages, modelId, mode);
    const maxTokens = mode === "analysis"
      ? Math.min(CONTEXT_BUDGET[modelId].maxTokens, 144)
      : Math.min(CONTEXT_BUDGET[modelId].maxTokens, 112);
    const id = crypto.randomUUID();
    const abortController = new AbortController();
    const relayAbort = () => abortController.abort();
    if (abortSignal?.aborted) abortController.abort();
    else abortSignal?.addEventListener("abort", relayAbort, { once: true });

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        let streamOpen = true;
        try {
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "text-start", id });
          nativeStore.setGenerating(true);
          await nativeEngine.generate(input, {
            maxTokens,
            signal: abortController.signal,
            onToken: (delta) => {
              if (streamOpen) controller.enqueue({ type: "text-delta", id, delta });
            },
          });
          if (streamOpen) {
            controller.enqueue({ type: "text-end", id });
            controller.enqueue({ type: "finish" });
            controller.close();
            streamOpen = false;
          }
        } catch (error) {
          const err = error instanceof NativeEngineError
            ? error
            : new NativeEngineError("generation-failed", error instanceof Error ? error.message : String(error));
          nativeStore.fail(err.code, err.message);
          if (streamOpen) {
            try {
              if (err.code === "interrupted") {
                controller.enqueue({ type: "text-end", id });
                controller.enqueue({ type: "finish" });
                controller.close();
              } else {
                controller.error(err);
              }
            } catch {
              // El consumidor ya canceló el stream.
            }
            streamOpen = false;
          }
        } finally {
          // Evita que un fallo o una cancelación deje Police Mode como "generando".
          nativeStore.setGenerating(false);
          abortSignal?.removeEventListener("abort", relayAbort);
        }
      },
      cancel() {
        abortController.abort();
        nativeEngine.interrupt();
        nativeStore.setGenerating(false);
        abortSignal?.removeEventListener("abort", relayAbort);
      },
    });
  }

  async reconnectToStream() {
    return null;
  }
}
