import { useEffect, useSyncExternalStore } from "react";

import {
  nativeStore,
  type NativeCacheSnapshot,
  type NativeStatus,
} from "@/lib/kengine-native/store";

const SERVER_STATUS: NativeStatus = { fase: "inactivo", modelo: "llama-3.2-3b" };
const SERVER_CACHE: NativeCacheSnapshot = Object.freeze({});

export function useNativeEngine(): {
  status: NativeStatus;
  webgpu: { ok: boolean; reason: string | null; adapter: string | null } | null;
  cached: NativeCacheSnapshot;
} {
  useEffect(() => nativeStore.hydrate(), []);
  const status = useSyncExternalStore(
    nativeStore.subscribe,
    nativeStore.getStatus,
    () => SERVER_STATUS,
  );
  const webgpu = useSyncExternalStore(nativeStore.subscribe, nativeStore.getWebGPU, () => null);
  // Snapshot estable: misma referencia hasta que refreshCache / load actualicen la caché.
  const cached = useSyncExternalStore(
    nativeStore.subscribe,
    nativeStore.getCachedSnapshot,
    () => SERVER_CACHE,
  );
  return { status, webgpu, cached };
}
