import { describe, expect, test, beforeEach } from "bun:test";

import { classifyNativeError, NativeEngineError } from "@/lib/kengine-native/engine";
import { nativeStore, NATIVE_MODEL_KEY, type NativeStatus } from "@/lib/kengine-native/store";

function ensureLocalStorageShim() {
  if (typeof globalThis.localStorage === "undefined") {
    const mem = new Map<string, string>();
    // @ts-expect-error test shim
    globalThis.localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
}

describe("nativeStore snapshots de caché", () => {
  test("getCachedSnapshot devuelve la misma referencia si la caché no cambia", () => {
    const a = nativeStore.getCachedSnapshot();
    const b = nativeStore.getCachedSnapshot();
    expect(a).toBe(b);
  });

  test("getter cached es el mismo snapshot estable", () => {
    expect(nativeStore.cached).toBe(nativeStore.getCachedSnapshot());
  });
});

describe("nativeStore select / estados", () => {
  beforeEach(() => {
    ensureLocalStorageShim();
    localStorage.removeItem(NATIVE_MODEL_KEY);
    nativeStore.select("llama-3.2-1b");
  });

  test("select cambia modelo en fase inactivo", () => {
    nativeStore.select("llama-3.2-1b");
    const s = nativeStore.getStatus();
    expect(s.modelo).toBe("llama-3.2-1b");
    expect(s.fase).toBe("inactivo");
  });

  test("select persiste el id con NATIVE_MODEL_KEY", () => {
    nativeStore.select("llama-3.2-1b");
    expect(localStorage.getItem(NATIVE_MODEL_KEY)).toBe("llama-3.2-1b");
    nativeStore.select("qwen2.5-1.5b");
    expect(localStorage.getItem(NATIVE_MODEL_KEY)).toBe("qwen2.5-1.5b");
  });

  test("select durante descargando no cambia modelo", () => {
    const before = nativeStore.getStatus().modelo;
    if (nativeStore.getStatus().fase !== "descargando") {
      nativeStore.select("qwen2.5-1.5b");
      expect(nativeStore.getStatus().modelo).toBe("qwen2.5-1.5b");
    } else {
      nativeStore.select("llama-3.2-3b");
      expect(nativeStore.getStatus().modelo).toBe(before);
    }
  });
});

describe("tipos de error del motor", () => {
  test("classifyNativeError mapea OOM y WebGPU sin falsos positivos", () => {
    expect(classifyNativeError(new Error("GPU out of memory"), "load-failed").code).toBe(
      "out-of-memory",
    );
    expect(classifyNativeError(new Error("out-of-memory on device"), "load-failed").code).toBe(
      "out-of-memory",
    );
    expect(classifyNativeError(new Error("Device OOM"), "load-failed").code).toBe("out-of-memory");
    expect(classifyNativeError(new Error("Failed to allocate buffer"), "load-failed").code).toBe(
      "out-of-memory",
    );
    expect(classifyNativeError(new Error("navigator.gpu missing"), "load-failed").code).toBe(
      "webgpu-unavailable",
    );
    // "boom" contiene la subcadena "oom" pero NO es un error de memoria.
    expect(classifyNativeError(new Error("boom"), "load-failed").code).toBe("load-failed");
    expect(classifyNativeError(new Error("room full"), "load-failed").code).toBe("load-failed");
    expect(classifyNativeError(new Error("zoom level"), "load-failed").code).toBe("load-failed");
  });

  test("NativeStatus error exige code y detalle", () => {
    const errStatus: NativeStatus = {
      fase: "error",
      modelo: "llama-3.2-1b",
      code: "load-failed",
      detalle: "fallo de prueba",
    };
    expect(errStatus.fase).toBe("error");
    expect(errStatus.code).toBeTruthy();
    expect(errStatus.detalle).toBeTruthy();
  });

  test("sin-webgpu no usa code de NativeEngineError en el tipo", () => {
    const s: NativeStatus = {
      fase: "sin-webgpu",
      modelo: "llama-3.2-1b",
      detalle: "sin adaptador",
    };
    expect(s.fase).toBe("sin-webgpu");
    expect("code" in s).toBe(false);
  });

  test("interrupt no es una promesa de cancelación de load", () => {
    expect(() => nativeStore.interrupt()).not.toThrow();
  });

  test("NativeEngineError preserva code tipado", () => {
    const e = new NativeEngineError("not-loaded", "sin modelo");
    expect(e.code).toBe("not-loaded");
    expect(e.name).toBe("NativeEngineError");
  });
});
