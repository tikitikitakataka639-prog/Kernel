/// <reference lib="webworker" />
/** Web Worker de WebLLM: la descarga, compilación WebGPU e inferencia ocurren aquí. */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
