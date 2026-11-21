import { describe, expect, test } from "bun:test";

import { NATIVE_MODELS } from "@/lib/kengine-native/catalog";
import { buildAppConfig } from "@/lib/kengine-native/engine";
import {
  CORE_CONFIG_FILES,
  DOWNLOAD_CONTRACT,
  MODEL_SOURCES,
  coreConfigUrls,
  getModelSource,
  resolveModelFile,
} from "@/lib/kengine-native/sources";

describe("fuentes internas de modelos", () => {
  test("hay exactamente cuatro fuentes, una por modelo del catálogo", () => {
    expect(MODEL_SOURCES).toHaveLength(4);
    expect(MODEL_SOURCES.map((s) => s.id).sort()).toEqual(
      [...NATIVE_MODELS.map((m) => m.id)].sort(),
    );
  });

  test("cada fuente coincide con el source del catálogo", () => {
    for (const m of NATIVE_MODELS) {
      const s = getModelSource(m.id);
      expect(s).not.toBeNull();
      expect(s!.hfRepoUrl).toBe(m.source);
      expect(s!.mlcModelId).toBe(m.mlcModelId);
    }
  });

  test("resolveModelFile apunta a resolve/main, no a la página HTML", () => {
    const url = resolveModelFile("qwen2.5-0.5b", "mlc-chat-config.json");
    expect(url).toBe(
      "https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json",
    );
    expect(url).not.toContain(".html");
  });

  test("coreConfigUrls lista configs sin HTML", () => {
    const urls = coreConfigUrls("llama-3.2-1b");
    expect(urls).toHaveLength(CORE_CONFIG_FILES.length);
    for (const u of urls) {
      expect(u.includes("/resolve/main/")).toBe(true);
      expect(u.endsWith(".html")).toBe(false);
    }
  });

  test("contrato: descarga vía WebLLM, HTML solo referencia, sin acoplar al chat", () => {
    expect(DOWNLOAD_CONTRACT.mechanism).toBe("webllm");
    expect(DOWNLOAD_CONTRACT.htmlRole).toBe("reference-only");
    expect(DOWNLOAD_CONTRACT.chatCoupled).toBe(false);
  });

  test("páginas de referencia tienen path local estable", () => {
    for (const s of MODEL_SOURCES) {
      expect(s.referencePage.startsWith("/kengine-native/sources/")).toBe(true);
      expect(s.referencePage.endsWith(".html")).toBe(true);
    }
  });
});

describe("sources ↔ engine buildAppConfig", () => {
  test("appConfig usa hfRepoUrl de sources para cada modelo", () => {
    const cfg = buildAppConfig();
    expect(cfg.model_list).toHaveLength(4);
    expect(cfg.useIndexedDBCache).toBe(true);
    for (const entry of cfg.model_list) {
      const src = MODEL_SOURCES.find((s) => s.mlcModelId === entry.model_id);
      expect(src).toBeDefined();
      expect(entry.model).toBe(src!.hfRepoUrl);
      expect(entry.model).toMatch(/^https:\/\/huggingface\.co\/mlc-ai\//);
    }
  });

  test("orden e ids del appConfig coinciden con el catálogo", () => {
    const cfg = buildAppConfig();
    expect(cfg.model_list.map((e) => e.model_id)).toEqual(
      NATIVE_MODELS.map((m) => m.mlcModelId),
    );
  });
});
