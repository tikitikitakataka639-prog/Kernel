import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint heredado, conservado solo para devolver un diagnóstico claro a
 * clientes antiguos. Las conversaciones de la edición web se ejecutan en el
 * navegador: Qwen para Chat General y Llama/WebLLM para Police Mode.
 */
function browserInferenceOnly(): Response {
  return Response.json(
    {
      error: {
        code: "BROWSER_INFERENCE_ONLY",
        message: "Este endpoint remoto está retirado. Actualiza KERNEL y utiliza el transporte local del navegador; no necesitas KERNEL_AI_BASE_URL.",
      },
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store", "X-KERNEL-API": "retired" },
    },
  );
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async () => browserInferenceOnly(),
      GET: async () => browserInferenceOnly(),
    },
  },
});
