import { describe, expect, test } from "bun:test";

import { getNativeModel } from "@/lib/kengine-native/catalog";
import {
  CHAT_GENERAL_ENGINE,
  MODE_POLICE_ENGINE,
  PRODUCT_ENGINES,
  getProductEngine,
} from "@/lib/product-engines";

describe("product-engines",
 () => {
  test("solo dos motores de producto",
 () => {
    expect(PRODUCT_ENGINES).toHaveLength(2);
    expect(getProductEngine("chat-general").id).toBe("chat-general");
    expect(getProductEngine("mode-police").id).toBe("mode-police");
  });

  test("CHAT GENERAL: sin id nativo, listo en navegador",
 () => {
    expect(CHAT_GENERAL_ENGINE.nativeModelId).toBeNull();
    expect(CHAT_GENERAL_ENGINE.availability).toBe("browser-ready");
    expect(CHAT_GENERAL_ENGINE.openPath).toBe("/chat");
  });

  test("MODE POLICE: llama-3.2-3b coherente con catalog",
 () => {
    expect(MODE_POLICE_ENGINE.nativeModelId).toBe("llama-3.2-3b");
    expect(MODE_POLICE_ENGINE.availability).toBe("webllm-ready");
    expect(MODE_POLICE_ENGINE.openPath).toBe("/analisis");
    const meta = getNativeModel("llama-3.2-3b");
    expect(meta).not.toBeNull();
    expect(MODE_POLICE_ENGINE.vramRequiredMB).toBe(meta!.vramRequiredMB);
    expect(meta!.mlcModelId).toBe("Llama-3.2-3B-Instruct-q4f32_1-MLC");
    expect(meta!.vramRequiredMB).toBe(2951.51);
  });

  test("no introduce ids ajenos al catálogo nativo",
 () => {
    for (const engine of PRODUCT_ENGINES) {
      if (engine.nativeModelId) {
        expect(getNativeModel(engine.nativeModelId)).not.toBeNull();
      }
    }
  });
});
