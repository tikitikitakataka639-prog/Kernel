# KERNEL 0.2.12 — Fast response profile

## Objetivo
Reducir la latencia de primera respuesta y de finalización en los modelos que corren íntegramente en el navegador. El objetivo operativo es ≤10 segundos para respuestas breves con WebGPU compatible; no es una garantía universal y no incluye la descarga inicial ni la carga del modelo.

## Chat General
- Perfil predeterminado: Qwen3.5-2B Claude Distilled Q4_K_M (1,27 GB).
- Perfil alternativo: Qwen3.5-4B Claude Distilled Q4_K_M (2,71 GB), conservado para respuestas de mayor capacidad.
- Descarga 2B fijada a una revisión inmutable de Hugging Face y SHA-256 verificado contra la ficha del archivo.
- Un solo modelo residente en RAM/VRAM. Al cambiar de perfil se libera el runtime anterior.
- WebGPU prueba varios repartos de capas para adaptarse a VRAM limitada; CPU queda como último recurso y se identifica claramente como no apta para prometer ≤10s.
- Contexto y generación reducidos en el perfil rápido; prompt de sistema mínimo; máximo 80 tokens.
- Umbral de primer texto 7 s, inactividad 4 s y límite total 10 s para el perfil rápido. El perfil profundo mantiene límites superiores.
- Se mide y muestra el tiempo total, la latencia al primer texto y una estimación de tokens/s.

## Police Mode
- Se conservan los modelos nativos del modo policial.
- Presupuesto reducido para Llama 3.2 3B: historial limitado, prompt local compacto, 112 tokens en chat y máximo 144 en análisis.
- Ventana MLC ajustada a 2048 tokens.
- Umbral de primer texto 7 s, inactividad 4 s y límite total de 10 s. Si el hardware no llega, se interrumpe y se informa; no se simula una respuesta terminada.

## Qué significa el objetivo
La descarga e inicialización inicial pueden tardar minutos. El objetivo ≤10 s se mide una vez que el modelo está cargado y listo. En CPU/WASM o equipos sin WebGPU no puede garantizarse. Las cifras públicas de GTX 1050 Ti usadas como orientación proceden de pruebas nativas de Ollama/llama.cpp, no de una prueba de KERNEL en navegador.
