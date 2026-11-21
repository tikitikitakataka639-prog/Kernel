import { describe, expect, test } from "bun:test";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";

import { FIRST_TEST_MODEL_ID, NATIVE_MODELS, getNativeModel } from "@/lib/kengine-native/catalog";
import { buildAppConfig, classifyNativeError } from "@/lib/kengine-native/engine";

describe("catálogo nativo K.ENGINE", () => {
  test("conserva los cuatro identificadores oficiales", () => {
    expect(NATIVE_MODELS.map((m) => m.id)).toEqual(["qwen2.5-0.5b", "llama-3.2-1b", "qwen2.5-1.5b", "llama-3.2-3b"]);
  });

  test("las fuentes son los repos oficiales mlc-ai", () => {
    for (const m of NATIVE_MODELS) expect(m.source).toBe(`https://huggingface.co/mlc-ai/${m.mlcModelId}`);
  });

  test.each(NATIVE_MODELS.map((m) => [m.mlcModelId, m] as const))(
    "%s coincide con prebuiltAppConfig de WebLLM",
    (_id, m) => {
      const p = prebuiltAppConfig.model_list.find((x) => x.model_id === m.mlcModelId);
      expect(p).toBeDefined();
      expect(p!.model).toBe(m.source);
      expect(p!.model_lib).toBe(m.modelLib);
      expect(p!.vram_required_MB).toBe(m.vramRequiredMB);
    },
  );

  test("primera prueba es Llama 3.2 3B", () => {
    expect(FIRST_TEST_MODEL_ID).toBe("llama-3.2-3b");
    expect(getNativeModel("llama-3.2-3b")?.mlcModelId).toBe("Llama-3.2-3B-Instruct-q4f32_1-MLC");
    expect(getNativeModel("gemma")).toBeNull();
  });

  test("appConfig solo contiene los cuatro modelos y usa IndexedDB", () => {
    const cfg = buildAppConfig();
    expect(cfg.model_list).toHaveLength(4);
    expect(cfg.useIndexedDBCache).toBe(true);
  });

  test("clasifica falta de memoria", () => {
    expect(classifyNativeError(new Error("GPU out of memory"), "load-failed").code).toBe("out-of-memory");
    expect(classifyNativeError(new Error("x"), "load-failed").code).toBe("load-failed");
  });
});
