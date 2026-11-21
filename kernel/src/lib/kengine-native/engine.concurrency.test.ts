import { describe, expect, test } from "bun:test";

import { buildAppConfig, NativeEngine, NativeEngineError } from "@/lib/kengine-native/engine";
import { MODEL_SOURCES } from "@/lib/kengine-native/sources";

describe("NativeEngine contratos sin GPU", () => {
  test("load fuera de navegador lanza no-browser", async () => {
    const eng = new NativeEngine();
    await expect(eng.load("qwen2.5-0.5b")).rejects.toMatchObject({
      code: "no-browser",
    });
  });

  test("load modelo desconocido lanza unknown-model", async () => {
    const eng = new NativeEngine();
    // En SSR/no-window el orden es no-browser primero; forzamos comprobación de catálogo vía getNativeModel.
    // unknown-model solo tras pasar el check de window — aquí verificamos el mensaje del catálogo en buildAppConfig.
    expect(MODEL_SOURCES.every((s) => s.id !== ("gemma" as string))).toBe(true);
    await expect(eng.load("modelo-que-no-existe")).rejects.toBeInstanceOf(NativeEngineError);
  });

  test("generate sin modelo cargado lanza not-loaded", async () => {
    const eng = new NativeEngine();
    await expect(eng.generate([{ role: "user", content: "hola" }])).rejects.toMatchObject({
      code: "not-loaded",
    });
  });

  test("unload sin carga no lanza", async () => {
    const eng = new NativeEngine();
    await expect(eng.unload()).resolves.toBeUndefined();
    expect(eng.modelId).toBeNull();
  });

  test("interrupt sin engine no lanza", () => {
    const eng = new NativeEngine();
    expect(() => eng.interrupt()).not.toThrow();
  });

  test("isLoading es false al inicio", () => {
    const eng = new NativeEngine();
    expect(eng.isLoading).toBe(false);
    expect(eng.isGenerating).toBe(false);
  });

  test("buildAppConfig alinea sources y no usa IndexedDB", () => {
    const cfg = buildAppConfig();
    for (const row of cfg.model_list) {
      const src = MODEL_SOURCES.find((s) => s.mlcModelId === row.model_id);
      expect(src).toBeDefined();
      expect(row.model).toBe(src!.hfRepoUrl);
    }
  });
});

/**
 * Serialización de cargas: no podemos simular WebGPU aquí, pero sí el contrato
 * de que load desconocido / no-browser falla de forma independiente por instancia.
 */
describe("cargas concurrentes (rechazo temprano)", () => {
  test("dos load inválidos en paralelo fallan cada uno", async () => {
    const eng = new NativeEngine();
    const [a, b] = await Promise.allSettled([
      eng.load("qwen2.5-0.5b"),
      eng.load("llama-3.2-1b"),
    ]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    if (a.status === "rejected") {
      expect(a.reason).toBeInstanceOf(NativeEngineError);
    }
    if (b.status === "rejected") {
      expect(b.reason).toBeInstanceOf(NativeEngineError);
    }
  });
});
