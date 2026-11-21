import { describe, expect, test, beforeEach } from "bun:test";

import { FIRST_TEST_MODEL_ID, NATIVE_MODELS, getNativeModel } from "@/lib/kengine-native/catalog";
import { CONTEXT_BUDGET, buildNativeMessages } from "@/lib/kengine-native/context";
import { classifyNativeError, NativeEngineError } from "@/lib/kengine-native/engine";
import { nativeStore, NATIVE_MODEL_KEY, nativeLabel } from "@/lib/kengine-native/store";
import type { UIMessage } from "ai";

describe("Fase 2 · aislamiento del motor nativo", () => {
  test("catálogo inmutable de cuatro modelos", () => {
    expect(NATIVE_MODELS.map((m) => m.id)).toEqual([
      "qwen2.5-0.5b",
      "llama-3.2-1b",
      "qwen2.5-1.5b",
      "llama-3.2-3b",
    ]);
    expect(getNativeModel("qwen2.5-0.5b")?.mlcModelId).toBe("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
    expect(getNativeModel("llama-3.2-1b")?.mlcModelId).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    expect(getNativeModel("qwen2.5-1.5b")?.mlcModelId).toBe("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    expect(getNativeModel("llama-3.2-3b")?.mlcModelId).toBe("Llama-3.2-3B-Instruct-q4f32_1-MLC");
  });

  test("presupuestos de contexto por modelo", () => {
    for (const m of NATIVE_MODELS) {
      expect(CONTEXT_BUDGET[m.id].historyChars).toBeGreaterThan(0);
      expect(CONTEXT_BUDGET[m.id].maxTokens).toBeGreaterThan(0);
    }
  });

  test("buildNativeMessages antepone system y recorta historial", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "hola" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "qué tal" }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "prueba" }] },
    ] as UIMessage[];
    const out = buildNativeMessages(messages, "qwen2.5-0.5b");
    expect(out[0]?.role).toBe("system");
    expect(out.some((m) => m.role === "user" && m.content === "prueba")).toBe(true);
  });

  test("Police Mode usa el prompt policial local y no el prompt general", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Revisa este texto" }] },
    ] as UIMessage[];
    const out = buildNativeMessages(messages, "llama-3.2-3b", "analysis");
    expect(out[0]?.role).toBe("system");
    expect(out[0]?.content).toContain("ANÁLISIS POLICIAL LOCAL");
    expect(out[0]?.content).toMatch(/No tienes acceso a\s+Internet/);
  });

  test("clasificación de errores nativos", () => {
    expect(classifyNativeError(new Error("GPU out of memory"), "load-failed").code).toBe("out-of-memory");
    expect(classifyNativeError(new Error("navigator.gpu missing"), "load-failed").code).toBe(
      "webgpu-unavailable",
    );
    expect(new NativeEngineError("not-loaded", "x").code).toBe("not-loaded");
  });
});

describe("Fase 2 · store nativo (sin modo de chat)", () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === "undefined") {
      const mem = new Map<string, string>();
      // @ts-expect-error test shim
      globalThis.localStorage = {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      };
    }
    localStorage.removeItem(NATIVE_MODEL_KEY);
  });

  test("select cambia modelo preferido y etiqueta", () => {
    nativeStore.select("llama-3.2-1b");
    const st = nativeStore.getStatus();
    expect(st.modelo).toBe("llama-3.2-1b");
    expect(st.fase).toBe("inactivo");
    expect(nativeLabel(st)).toContain("Llama 3.2 1B");
    expect(localStorage.getItem(NATIVE_MODEL_KEY)).toBe("llama-3.2-1b");
  });

  test("no expone getMode: el chat no puede engancharse al motor nativo por store", () => {
    // @ts-expect-error comprobación de API eliminada en Fase 2
    expect(nativeStore.getMode).toBeUndefined();
    // @ts-expect-error
    expect(nativeStore.setMode).toBeUndefined();
  });
});

describe("Fase 2 · transporte nativo aislado", () => {
  test("el transporte nativo de Police Mode se puede importar", async () => {
    const nativeMod = await import("@/lib/kengine-native/transport");
    expect(typeof nativeMod.KEngineNativeChatTransport).toBe("function");
  });
});
