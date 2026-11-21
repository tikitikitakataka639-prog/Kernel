import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const errors = [];
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

for (const file of ["package.json", "vercel.json", "vite.config.ts", "src/routes/index.tsx", "src/routeTree.gen.ts"]) {
  if (!existsSync(join(root, file))) errors.push(`Falta ${file} en la raíz del proyecto.`);
}

if (!errors.length) {
  const pkg = readJson("package.json");
  const vercel = readJson("vercel.json");
  if (pkg.packageManager !== "npm@10.9.2") errors.push("packageManager debe fijar npm@10.9.2.");
  if (pkg.engines?.node !== "24.x") errors.push("Node.js debe estar fijado a la rama 24.x en engines.node.");
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) errors.push("No debe quedar un lockfile Bun: este proyecto usa npm.");
  if (vercel.installCommand !== "npm install") errors.push("Vercel debe instalar dependencias mediante npm install.");
  if (vercel.buildCommand !== "npm run build") errors.push("Vercel debe compilar mediante npm run build.");
  const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
  const qwenEngine = readFileSync(join(root, "src/lib/qwen-browser-engine.ts"), "utf8");
  const qwenManager = readFileSync(join(root, "src/components/kernel/GeneralModelManager.tsx"), "utf8");
  const policeManager = readFileSync(join(root, "src/components/kernel/PoliceModelManager.tsx"), "utf8");
  const ajustes = readFileSync(join(root, "src/routes/ajustes.tsx"), "utf8");
  if (!vite.includes('process.env["VERCEL"]') || !vite.includes('preset: "vercel"')) errors.push("vite.config.ts no selecciona explícitamente el preset de Nitro para Vercel.");
  for (const outputPath of [".vercel/output", ".vercel/output/functions/__server.func", ".vercel/output/static"]) {
    if (!vite.includes(`"${outputPath}"`)) errors.push(`vite.config.ts no fija la salida Vercel: ${outputPath}.`);
  }
  if (!pkg.scripts?.build || !pkg.scripts.build.includes("vercel-preflight.mjs") || !pkg.scripts.build.includes("verify-vercel-output-if-vercel.mjs") || !pkg.scripts?.["verify:vercel-output"]) {
    errors.push("El build debe ejecutar preflight y validar Vercel Output cuando VERCEL=1.");
  }
  if (pkg.dependencies?.wllama64 !== "1.1.1" || pkg.dependencies?.["@wllama/wllama"]) {
    errors.push("Chat General debe usar wllama64@1.1.1 y retirar el runtime antiguo @wllama/wllama.");
  }
  if (!qwenEngine.includes('import wasmUrl from "wllama64/wasm/wllama.wasm?url"') || !qwenEngine.includes('await import("wllama64")') || !qwenEngine.includes('address: "i64"') || !qwenEngine.includes("wasm.Suspending") || !qwenEngine.includes("wasm.promising")) {
    errors.push("El runtime Qwen no usa o no comprueba correctamente wllama64 Memory64.");
  }
  if (!qwenManager.includes("1,27 GB") || !qwenManager.includes("PROFUNDO") || !qwenManager.includes("REINTENTAR WEBGPU")) {
    errors.push("El gestor debe ofrecer perfil rápido 2B, perfil 4B alternativo y reintento WebGPU.");
  }
  if (!qwenEngine.includes("qwen35-2b-fast") || !qwenEngine.includes("qwen35-4b-deep") || !qwenEngine.includes("6036e3b96a5dca3def9ba6f3aa751acebe081c4f109a8a9352647d0eea055c9d") || !qwenEngine.includes("FAST_FIRST_TOKEN_TIMEOUT_MS = 90_000") || !qwenEngine.includes("FAST_GENERATION_IDLE_TIMEOUT_MS = 45_000") || !qwenEngine.includes("FAST_GENERATION_TOTAL_TIMEOUT_MS = 300_000") || !qwenEngine.includes("maxTokens: 80") || !qwenEngine.includes("gpuLayerCandidates: [24, 20, 16, 12, 0]")) {
    errors.push("Falta el perfil Qwen 2B fijado por revisión/SHA-256 o el perfil 4B alternativo (watchdogs de fase actualizados).");
  }
  if (!policeManager.includes("PENDIENTE DE SERVICIO") || policeManager.includes("policeDownload(")) {
    errors.push("Los detectores especializados no deben iniciar descargas sin backend configurado.");
  }
  if (ajustes.includes("k-engine.vercel.app") || ajustes.includes("DIRECCIÓN DE K.ENGINE")) {
    errors.push("La página de Ajustes todavía contiene una conexión de K.ENGINE que debe eliminarse.");
  }
  const analysisRoute = readFileSync(join(root, "src/routes/analisis.tsx"), "utf8");
  const qwenTransport = readFileSync(join(root, "src/lib/qwen-browser-transport.ts"), "utf8");
  const qwenPrompt = readFileSync(join(root, "src/lib/kernel-prompt.ts"), "utf8");
  const chatApi = readFileSync(join(root, "src/routes/api/chat.ts"), "utf8");
  const qwenEngineSource = readFileSync(join(root, "src/lib/qwen-browser-engine.ts"), "utf8");
  if (analysisRoute.includes("DefaultChatTransport") || analysisRoute.includes('api: "/api/chat"')) {
    errors.push("Police Mode no debe depender de /api/chat ni exigir KERNEL_AI_BASE_URL para la conversación local.");
  }
  const nativeTransport = readFileSync(join(root, "src/lib/kengine-native/transport.ts"), "utf8");
  if (!nativeTransport.includes("finally {") || !nativeTransport.includes("nativeStore.setGenerating(false)") || !nativeTransport.includes("abortController.abort();") || !nativeTransport.includes("signal: abortController.signal") || !nativeTransport.includes('abortSignal?.removeEventListener("abort", relayAbort)')) {
    errors.push("Police Mode debe liberar el estado de generación y cancelar el worker sin referencias a controladores inexistentes.");
  }
  for (const legacy of ["src/lib/kernel-ai-provider.server.ts", "src/lib/kernel-model-provider.server.ts", "src/lib/kernel-engine.server.ts", "src/lib/kernel-core.server.ts"]) {
    if (existsSync(join(root, legacy))) errors.push(`Sigue presente el módulo remoto heredado ${legacy}.`);
  }
  for (const legacy of ["src/lib/ai/inference/InferenceEngine.ts", "src/lib/ai-gateway.server.ts"]) {
    if (existsSync(join(root, legacy))) errors.push(`Sigue presente el adaptador remoto heredado ${legacy}.`);
  }
  if (pkg.dependencies?.["@ai-sdk/openai-compatible"]) errors.push("No debe incluirse el proveedor remoto @ai-sdk/openai-compatible en este build de inferencia local.");
  const nativeContext = readFileSync(join(root, "src/lib/kengine-native/context.ts"), "utf8");
  const nativeEngine = readFileSync(join(root, "src/lib/kengine-native/engine.ts"), "utf8");
  if (!analysisRoute.includes('new KEngineNativeChatTransport("analysis")') || !analysisRoute.includes("NATIVE_POLICE_MODEL_ID") || !nativeTransport.includes('mode: "chat" | "analysis"') || !nativeContext.includes("nativeAnalysisPrompt()")) {
    errors.push("Police Mode debe utilizar Llama 3.2 3B con su transporte y prompt local de análisis.");
  }
  if (!nativeEngine.includes("NATIVE_GENERATION_FIRST_TOKEN_TIMEOUT_MS = 90_000") || !nativeEngine.includes("NATIVE_GENERATION_IDLE_TIMEOUT_MS = 30_000") || !nativeEngine.includes("NATIVE_GENERATION_TOTAL_TIMEOUT_MS = 180_000") || !nativeEngine.includes("NATIVE_LOAD_IDLE_TIMEOUT_MS") || !nativeEngine.includes("NATIVE_LOAD_TOTAL_TIMEOUT_MS") || !nativeEngine.includes("context_window_size: 2048")) {
    errors.push("La carga y la generación de Llama en Police Mode deben tener límites de espera e interrupción diferenciados por fase.");
  }
  if (!qwenTransport.includes("generateWithQwen") || !qwenTransport.includes("uiMessagesToQwen(messages)") || !qwenEngineSource.includes("FAST_GENERATION_IDLE_TIMEOUT_MS") || !qwenEngineSource.includes("FAST_GENERATION_TOTAL_TIMEOUT_MS") || !qwenEngineSource.includes("jinja: true") || !qwenEngineSource.includes("default_template_kwargs: { enable_thinking: false }") || !qwenEngineSource.includes("chat_template_kwargs: { enable_thinking: false }") || qwenEngineSource.includes("reasoning_budget_tokens") || qwenEngineSource.includes("/no_think")) {
    errors.push("La generación de Qwen debe tener watchdog, plantilla Jinja y modo de pensamiento desactivado con los parámetros compatibles.");
  }
  if (!chatApi.includes("BROWSER_INFERENCE_ONLY") || chatApi.includes("kernelAiConfig") || chatApi.includes("runKernelEngine") || chatApi.includes("MODEL_BACKEND_NOT_CONFIGURED") || chatApi.includes("Añade KERNEL_AI_BASE_URL")) {
    errors.push("/api/chat debe ser una ruta heredada retirada; no debe exigir KERNEL_AI_BASE_URL ni ejecutar inferencia remota.");
  }
  if (!qwenEngineSource.includes("jinja: true") || qwenEngineSource.includes("/no_think")) {
    errors.push("Qwen3.5 debe procesar su plantilla Jinja; no se debe inyectar el token /no_think, que el modelo no admite como interruptor oficial.");
  }
  const chatPage = readFileSync(join(root, "src/routes/chat.$threadId.tsx"), "utf8");
  const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
  const gpuEngine = readFileSync(join(root, "src/lib/ai/hardware/WebGPUEngine.ts"), "utf8");
  if (!chatPage.includes("La generación se ha detenido") || !chatPage.includes("modelStatus.detail")) {
    errors.push("Chat General debe mostrar errores recuperables y el estado real de generación, no solo el indicador de carga.");
  }
  if (!rootRoute.includes("webgpuEngine.init()") || !rootRoute.includes("WebGPUStartup")) {
    errors.push("WebGPU debe inicializarse automáticamente al entrar en KERNEL.");
  }
  if (!chatPage.includes("loadQwenBrowserModel(DEFAULT_QWEN_MODEL_ID)") || !chatPage.includes("Descarga el modelo")) {
    errors.push("Chat General debe iniciar/restaurar Qwen automáticamente al entrar y mostrar el progreso.");
  }
  if (!gpuEngine.includes('gpu.requestAdapter({ powerPreference: "high-performance" })') || !gpuEngine.includes('gpu.requestAdapter()') || !gpuEngine.includes("adapter.requestDevice") || !gpuEngine.includes("this.initializing")) {
    errors.push("El arranque WebGPU debe solicitar primero alto rendimiento, reintentar con el adaptador predeterminado y crear un dispositivo real sin duplicar inicializaciones.");
  }
  const homeRoute = readFileSync(join(root, "src/routes/index.tsx"), "utf8");
  if (!homeRoute.includes('onClick={() => void retryWebGPU()}') || !homeRoute.includes('"REINTENTAR WEBGPU"')) {
    errors.push("La pantalla inicial debe permitir reintentar WebGPU si el navegador no encuentra un adaptador al arrancar.");
  }
  if (!qwenEngineSource.includes("candidate.isSupportWebGPU() && gpuState.disponible") || !qwenEngineSource.includes("model.gpuLayerCandidates.filter((layers) => layers > 0)")) {
    errors.push("El perfil Qwen rápido debe comprobar WebGPU real y no aceptar un fallback CPU silencioso.");
  }
  const headers = JSON.stringify(vercel.headers ?? []);
  if (!headers.includes("Cross-Origin-Opener-Policy") || !headers.includes("Cross-Origin-Embedder-Policy")) {
    errors.push("Vercel debe enviar COOP y COEP para SharedArrayBuffer/Memory64.");
  }
}

if (errors.length) {
  console.error("VERCEL PREFLIGHT: FAILED");
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}
console.log("VERCEL PREFLIGHT: OK");
console.log("- Raíz y rutas de TanStack Start presentes");
console.log("- npm 10.9.2 fijado; Vercel instala con npm install y compila con npm run build");
console.log("- Node.js 24.x fijado");
console.log("- Nitro preset Vercel seleccionado en builds Vercel");
console.log("- Build y comprobación del artefacto definidos");
console.log("- Chat General usa wllama64 Memory64; Police Mode usa Llama 3.2 3B WebLLM en navegador");
console.log("- Police Mode usa inferencia de navegador; adaptadores remotos heredados retirados");
console.log("- Qwen usa perfil rápido 2B por defecto y 4B opcional; WebGPU adaptativo, 80 tokens y watchdog de 30 segundos");
console.log("- Police Mode reduce contexto/salida y aplica watchdog de 10 segundos");
console.log("- /api/chat queda retirado con respuesta BROWSER_INFERENCE_ONLY; no exige KERNEL_AI_BASE_URL");
console.log("- WebGPU se inicializa al abrir KERNEL, reintenta el adaptador predeterminado y ofrece reintento manual; Qwen se precarga al entrar en Chat General");
console.log("- La interfaz muestra el backend GPU real y el motivo cuando una generación se detiene");
console.log("- COOP/COEP se configuran para memoria compartida y los detectores sin backend quedan inactivos");
console.log("- Ajustes no contiene conexión a K.ENGINE");
