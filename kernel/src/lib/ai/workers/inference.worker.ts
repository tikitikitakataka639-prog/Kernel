/// <reference lib="webworker" />
/**
 * INFERENCE WORKER — ejecución real del modelo fuera del hilo principal.
 *
 * Usa transformers.js (ONNX Runtime Web) con WebGPU cuando está disponible y
 * WASM como alternativa. La interfaz de KERNEL no se bloquea: aquí ocurre la
 * descarga, la carga en memoria y la generación token a token.
 */
import {
  AutoProcessor,
  AutoModelForImageTextToText,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  RawImage,
  StoppingCriteriaList,
  TextStreamer,
  pipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

type LoadMsg = {
  type: "load";
  modelId: string;
  repo: string;
  kind: "text" | "vision";
  dtype: string;
  device: "webgpu" | "wasm";
};
type GenerateMsg = {
  type: "generate";
  requestId: string;
  messages: Array<{ role: string; content: string; images?: string[] }>;
  config: { maxNewTokens: number; temperature: number; topP: number };
};
type InMsg = LoadMsg | GenerateMsg | { type: "cancel"; requestId: string } | { type: "unload" };

type Loaded =
  | { kind: "text"; modelId: string; generator: Awaited<ReturnType<typeof pipeline>> }
  | {
      kind: "vision";
      modelId: string;
      processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
      model: Awaited<ReturnType<typeof AutoModelForImageTextToText.from_pretrained>>;
      tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
    };

let loaded: Loaded | null = null;
let stopper: InterruptableStoppingCriteria | null = null;
let cancelRequested: string | null = null;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

function reportProgress(info: ProgressInfo) {
  if (info.status === "progress") {
    post({
      type: "progress",
      status: "loading",
      fraction: typeof info.progress === "number" ? info.progress / 100 : null,
      bytesLoaded: info.loaded ?? null,
      bytesTotal: info.total ?? null,
      file: info.file ?? null,
    });
  } else if (info.status === "download" || info.status === "initiate") {
    post({ type: "progress", status: "loading", fraction: null, bytesLoaded: null, bytesTotal: null, file: (info as { file?: string }).file ?? null });
  }
}

async function load(msg: LoadMsg) {
  if (loaded && loaded.modelId === msg.modelId) {
    post({ type: "ready", modelId: msg.modelId });
    return;
  }
  await unload();
  const opts = {
    dtype: msg.dtype as never,
    device: msg.device as never,
    progress_callback: reportProgress,
  };
  if (msg.kind === "vision") {
    const [processor, model, tokenizer] = await Promise.all([
      AutoProcessor.from_pretrained(msg.repo, { progress_callback: reportProgress }),
      AutoModelForImageTextToText.from_pretrained(msg.repo, opts),
      AutoTokenizer.from_pretrained(msg.repo, { progress_callback: reportProgress }),
    ]);
    loaded = { kind: "vision", modelId: msg.modelId, processor, model, tokenizer };
  } else {
    const generator = await pipeline("text-generation", msg.repo, opts);
    loaded = { kind: "text", modelId: msg.modelId, generator };
  }
  post({ type: "ready", modelId: msg.modelId });
}

async function unload() {
  if (!loaded) return;
  try {
    if (loaded.kind === "text") await (loaded.generator as unknown as { dispose: () => Promise<void> }).dispose();
    else await (loaded.model as unknown as { dispose: () => Promise<void> }).dispose();
  } catch {
    /* si el runtime ya liberó los recursos, seguimos */
  }
  loaded = null;
}

async function generateText(msg: GenerateMsg) {
  if (!loaded) throw new Error("No hay modelo cargado en el worker.");
  const started = Date.now();
  let text = "";
  let tokens = 0;
  stopper = new InterruptableStoppingCriteria();
  const criteria = new StoppingCriteriaList();
  criteria.push(stopper);

  if (loaded.kind === "text") {
    const tokenizer = (loaded.generator as unknown as { tokenizer: ConstructorParameters<typeof TextStreamer>[0] })
      .tokenizer;
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk: string) => {
        if (!chunk) return;
        text += chunk;
        tokens += 1;
        post({ type: "token", requestId: msg.requestId, token: chunk });
      },
    });
    await (loaded.generator as unknown as (input: unknown, options: unknown) => Promise<unknown>)(
      msg.messages.map((m) => ({ role: m.role, content: m.content })),
      {
        max_new_tokens: msg.config.maxNewTokens,
        temperature: msg.config.temperature,
        top_p: msg.config.topP,
        do_sample: msg.config.temperature > 0,
        streamer,
        stopping_criteria: criteria,
        return_full_text: false,
      },
    );
  } else {
    const { processor, model, tokenizer } = loaded;
    const imageUrls = msg.messages.flatMap((m) => m.images ?? []);
    const images = await Promise.all(imageUrls.map((url) => RawImage.fromURL(url)));
    const chat = msg.messages.map((m) => ({
      role: m.role,
      content: [
        ...(m.images ?? []).map(() => ({ type: "image" })),
        { type: "text", text: m.content },
      ],
    }));
    const prompt = (processor as unknown as { apply_chat_template: (c: unknown, o: unknown) => string })
      .apply_chat_template(chat, { add_generation_prompt: true });
    const inputs = await (processor as unknown as (t: unknown, i: unknown) => Promise<Record<string, unknown>>)(
      prompt,
      images.length > 0 ? images : null,
    );
    const streamer = new TextStreamer(tokenizer as never, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk: string) => {
        if (!chunk) return;
        text += chunk;
        tokens += 1;
        post({ type: "token", requestId: msg.requestId, token: chunk });
      },
    });
    await (model as unknown as { generate: (o: unknown) => Promise<unknown> }).generate({
      ...inputs,
      max_new_tokens: msg.config.maxNewTokens,
      do_sample: msg.config.temperature > 0,
      temperature: msg.config.temperature,
      top_p: msg.config.topP,
      streamer,
      stopping_criteria: criteria,
    });
  }

  stopper = null;
  if (cancelRequested === msg.requestId) {
    cancelRequested = null;
    post({ type: "cancelled", requestId: msg.requestId });
    return;
  }
  post({
    type: "complete",
    requestId: msg.requestId,
    text,
    tokensGenerated: tokens,
    elapsedMs: Date.now() - started,
  });
}

self.addEventListener("message", (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  void (async () => {
    try {
      if (msg.type === "load") await load(msg);
      else if (msg.type === "generate") await generateText(msg);
      else if (msg.type === "cancel") {
        cancelRequested = msg.requestId;
        stopper?.interrupt();
      } else if (msg.type === "unload") {
        await unload();
        post({ type: "unloaded" });
      }
    } catch (error) {
      post({
        type: "error",
        requestId: msg.type === "generate" ? msg.requestId : null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
