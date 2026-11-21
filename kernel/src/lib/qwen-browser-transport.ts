import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { generateWithQwen, uiMessagesToQwen } from "@/lib/qwen-browser-engine";

/** Browser-only transport for Chat General: no /api/chat or remote provider. */
export class QwenBrowserChatTransport implements ChatTransport<UIMessage> {

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) {
    const qwenMessages = uiMessagesToQwen(messages);
    if (qwenMessages.length < 2 || !qwenMessages[qwenMessages.length - 1]?.content.trim()) {
      throw new Error("Escribe un mensaje antes de enviarlo.");
    }

    const id = crypto.randomUUID();
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    if (abortSignal?.aborted) controller.abort();
    else abortSignal?.addEventListener("abort", relayAbort, { once: true });

    return new ReadableStream<UIMessageChunk>({
      async start(streamController) {
        streamController.enqueue({ type: "start" });
        streamController.enqueue({ type: "text-start", id });
        try {
          await generateWithQwen(qwenMessages, controller.signal, (delta) => {
            streamController.enqueue({ type: "text-delta", id, delta });
          });
          streamController.enqueue({ type: "text-end", id });
          streamController.enqueue({ type: "finish" });
          streamController.close();
        } catch (error) {
          if (controller.signal.aborted) {
            try {
              streamController.enqueue({ type: "text-end", id });
              streamController.enqueue({ type: "finish" });
              streamController.close();
            } catch {
              // El consumidor ya canceló el ReadableStream.
            }
            return;
          }
          streamController.error(error);
        } finally {
          abortSignal?.removeEventListener("abort", relayAbort);
        }
      },
      cancel() {
        controller.abort();
        abortSignal?.removeEventListener("abort", relayAbort);
      },
    });
  }

  async reconnectToStream() {
    return null;
  }
}
