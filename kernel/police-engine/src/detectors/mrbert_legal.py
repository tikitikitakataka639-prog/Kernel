"""MrBERT-legal: encoder jurídico local (NO clasificador de ilegalidad)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import numpy as np

from download import download_files, verify_files, write_manifest
from memory import process_rss_mb
from paths import detector_dir
from schema import AnalysisResult, AnalysisState, DetectorId, ModelInfo, ModelStatus, ScoreItem

REPO_ID = "BSC-LT/MrBERT-legal"
VERSION = "encoder-v1"
REQUIRED_FILES = [
    "model.safetensors",
    "config.json",
    "tokenizer.json",
    "tokenizer.model",
    "tokenizer_config.json",
    "special_tokens_map.json",
]
# model.safetensors ~1.2GB; umbral de integridad (no el tamaño exacto)
MIN_BYTES = {
    "model.safetensors": 100_000_000,
    "tokenizer.json": 100_000,
}


def _chunk_text(text: str, max_chars: int = 1500, overlap: int = 200) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + max_chars])
        i += max_chars - overlap
    return chunks


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


class MrBertLegalDetector:
    """
    Encoder de dominio legal. Produce embeddings y similitud semántica.
    No inventa categorías jurídicas ni probabilidades de ilegalidad.
    """

    id = DetectorId.MRBERT_LEGAL.value
    name = "MrBERT-legal (encoder jurídico BSC-LT)"
    license = "Apache-2.0"
    version = VERSION

    def __init__(self) -> None:
        self._model = None
        self._tokenizer = None
        self._status = ModelStatus.NOT_INSTALLED
        self._error: str | None = None
        self._local = detector_dir(self.id)
        self._dim: int | None = None
        self._refresh_status()

    def _refresh_status(self) -> None:
        if self._model is not None:
            self._status = ModelStatus.LOADED
            return
        # Aceptar también pytorch_model.bin si no hay safetensors
        has_weights = (self._local / "model.safetensors").exists() or (
            self._local / "pytorch_model.bin"
        ).exists()
        has_tok = (self._local / "tokenizer.json").exists() or list(self._local.rglob("tokenizer.json"))
        if has_weights and has_tok:
            self._status = ModelStatus.READY
        else:
            self._status = ModelStatus.NOT_INSTALLED

    def info(self) -> ModelInfo:
        self._refresh_status()
        return ModelInfo(
            id=self.id,
            name=self.name,
            version=self.version,
            license=self.license,
            status=self._status.value,
            repo_id=REPO_ID,
            files=REQUIRED_FILES,
            local_dir=str(self._local),
            error=self._error,
            memory_rss_mb=process_rss_mb() if self._model else None,
            loaded=self._model is not None,
            notes=[
                "Modelo fundacional MLM / encoder. NO incluye cabeza de clasificación jurídica.",
                "Las puntuaciones de similitud NO son probabilidades de ilegalidad.",
                "Arquitectura preparada para conectar un clasificador entrenado y validado en el futuro.",
                "Inferencia preferente en CPU con transformers+torch si está instalado.",
            ],
        )

    def download(self, on_progress=None) -> ModelInfo:
        self._status = ModelStatus.DOWNLOADING
        self._error = None
        try:
            files = list(REQUIRED_FILES)
            # Fallback de pesos
            try:
                paths = download_files(REPO_ID, files, self._local, on_progress=on_progress)
            except Exception:
                files = [
                    "pytorch_model.bin",
                    "config.json",
                    "tokenizer.json",
                    "tokenizer.model",
                    "tokenizer_config.json",
                    "special_tokens_map.json",
                ]
                paths = download_files(REPO_ID, files, self._local, on_progress=on_progress)
            errors = verify_files(
                paths,
                {
                    "model.safetensors": 100_000_000,
                    "pytorch_model.bin": 100_000_000,
                    "tokenizer.json": 50_000,
                },
            )
            # Solo exigir un archivo de pesos
            weight_ok = any(
                (self._local / n).exists() or list(self._local.rglob(n))
                for n in ("model.safetensors", "pytorch_model.bin")
            )
            if not weight_ok:
                errors.append("No se encontró archivo de pesos")
            if errors and not weight_ok:
                self._status = ModelStatus.ERROR
                self._error = "; ".join(errors)
            else:
                write_manifest(
                    self._local,
                    {"repo_id": REPO_ID, "version": VERSION, "role": "encoder_only"},
                )
                self._status = ModelStatus.READY
        except Exception as e:
            self._status = ModelStatus.ERROR
            self._error = str(e)
        return self.info()

    def load(self, prefer_cpu: bool = True) -> ModelInfo:
        if self._model is not None:
            return self.info()
        self._refresh_status()
        if self._status == ModelStatus.NOT_INSTALLED:
            self._error = "MrBERT-legal no descargado."
            return self.info()
        self._status = ModelStatus.LOADING
        try:
            from transformers import AutoModel, AutoTokenizer
            import torch

            device = "cpu"
            if not prefer_cpu and torch.cuda.is_available():
                device = "cuda"
            self._tokenizer = AutoTokenizer.from_pretrained(
                str(self._local), use_fast=True, trust_remote_code=False
            )
            self._model = AutoModel.from_pretrained(
                str(self._local), trust_remote_code=False, use_safetensors=True
            )
            self._model.eval()
            self._model.to(device)
            self._device = device
            # Dimensión oculta
            self._dim = int(getattr(self._model.config, "hidden_size", 0) or 0)
            self._status = ModelStatus.LOADED
            self._error = None
        except ImportError as e:
            self._status = ModelStatus.ERROR
            self._error = (
                "Faltan dependencias para MrBERT-legal: instala transformers y torch. "
                f"Detalle: {e}"
            )
        except Exception as e:
            self._model = None
            self._tokenizer = None
            self._status = ModelStatus.ERROR
            self._error = str(e)
        return self.info()

    def unload(self) -> ModelInfo:
        self._model = None
        self._tokenizer = None
        self._refresh_status()
        return self.info()

    def _embed(self, text: str) -> np.ndarray:
        import torch

        assert self._model is not None and self._tokenizer is not None
        inputs = self._tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )
        inputs = {k: v.to(self._device) for k, v in inputs.items()}
        with torch.no_grad():
            out = self._model(**inputs)
            # Mean pooling sobre últimos hidden states
            hidden = out.last_hidden_state
            mask = inputs["attention_mask"].unsqueeze(-1).expand(hidden.size()).float()
            summed = (hidden * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1e-9)
            emb = (summed / counts).squeeze(0).cpu().numpy()
        return emb.astype(np.float32)

    def analyze(
        self,
        text: str,
        query: str | None = None,
        corpus: list[str] | None = None,
    ) -> AnalysisResult:
        limitations = [
            "MrBERT-legal es un encoder/MLM, no un clasificador jurídico etiquetado.",
            "La similitud coseno no implica legalidad, ilegalidad ni relevancia jurídica normativa.",
            "No se emiten categorías de delito ni probabilidades calibradas de infracción.",
            "Pendiente de una cabeza de clasificación entrenada y validada por dominio.",
        ]
        if self._model is None:
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.MODEL_NOT_READY.value,
                labels=[],
                top_label=None,
                language=None,
                relevant_fragments=[],
                raw_scores={},
                limitations=limitations,
                latency_ms=None,
                error="MrBERT-legal no está cargado.",
            )

        text = (text or "").strip()
        if not text and not corpus:
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.ERROR.value,
                labels=[],
                top_label=None,
                language=None,
                relevant_fragments=[],
                raw_scores={},
                limitations=limitations,
                latency_ms=0,
                error="Sin texto ni corpus.",
            )

        self._status = ModelStatus.INFERRING
        t0 = time.perf_counter()
        try:
            chunks = _chunk_text(text) if text else []
            fragments: list[dict[str, Any]] = []
            embeddings_meta: dict[str, float] = {}

            if query and (corpus or chunks):
                q_emb = self._embed(query)
                docs = corpus if corpus else chunks
                scored: list[tuple[float, str, int]] = []
                for i, doc in enumerate(docs):
                    emb = self._embed(doc)
                    sim = _cosine(q_emb, emb)
                    scored.append((sim, doc, i))
                scored.sort(key=lambda x: x[0], reverse=True)
                for sim, doc, i in scored[:5]:
                    fragments.append(
                        {
                            "index": i,
                            "text": doc[:800],
                            "cosine_similarity": round(sim, 6),
                            "note": "similitud semántica; no es probabilidad de ilegalidad",
                        }
                    )
                    embeddings_meta[f"chunk_{i}_cosine"] = round(sim, 6)
            else:
                # Solo embeddings / resumen de fragmentos
                for i, ch in enumerate(chunks[:8]):
                    emb = self._embed(ch)
                    fragments.append(
                        {
                            "index": i,
                            "text": ch[:800],
                            "embedding_dim": int(emb.shape[0]),
                            "embedding_norm": round(float(np.linalg.norm(emb)), 6),
                            "note": "representación vectorial; sin etiqueta jurídica",
                        }
                    )
                    embeddings_meta[f"chunk_{i}_norm"] = round(float(np.linalg.norm(emb)), 6)

            latency = (time.perf_counter() - t0) * 1000
            self._status = ModelStatus.LOADED
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.OK.value,
                labels=[],  # sin etiquetas de clasificación
                top_label=None,
                language=None,
                relevant_fragments=fragments,
                raw_scores=embeddings_meta,
                limitations=limitations,
                latency_ms=round(latency, 2),
                notes=[
                    "Salida de encoder: fragmentos y similitudes coseno únicamente.",
                    f"hidden_size={self._dim}",
                ],
            )
        except Exception as e:
            self._status = ModelStatus.LOADED
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.ERROR.value,
                labels=[],
                top_label=None,
                language=None,
                relevant_fragments=[],
                raw_scores={},
                limitations=limitations,
                latency_ms=(time.perf_counter() - t0) * 1000,
                error=str(e),
            )
