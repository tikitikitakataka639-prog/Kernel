"""Detector Horizon: phishing / scam / spam vía ONNX INT8 local."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from download import download_files, read_manifest, verify_files, write_manifest
from memory import process_rss_mb
from paths import detector_dir
from schema import AnalysisResult, AnalysisState, DetectorId, ModelInfo, ModelStatus, ScoreItem

REPO_ID = "Horizon-Labs/phishing-scam-detector-base"
VERSION = "base-onnx-int8-v1"
# Solo archivos necesarios para ONNX cuantizado + tokenizer
REQUIRED_FILES = [
    "onnx/model_quantized.onnx",
    "tokenizer.json",
    "tokenizer_config.json",
    "config.json",
    "special_tokens_map.json",
]
MIN_BYTES = {
    "onnx/model_quantized.onnx": 100_000_000,  # ~641 MB; umbral mínimo de integridad
    "tokenizer.json": 1_000_000,
}

# Orden id2label publicado en config.json del modelo oficial.
EXPECTED_LABELS = {"fraud", "spam", "legitimate"}


def _read_label_order(config_path: Path) -> tuple[str, ...]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    mapping = config.get("id2label")
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("config.json no contiene id2label; se rechaza inferencia ambigua")
    try:
        ordered = tuple(str(mapping[str(i)]).strip().lower() for i in range(len(mapping)))
    except (KeyError, TypeError) as exc:
        raise ValueError("id2label debe tener índices consecutivos desde 0") from exc
    if len(ordered) != 3 or set(ordered) != EXPECTED_LABELS:
        raise ValueError(f"Etiquetas inesperadas en config.json: {ordered!r}")
    return ordered


def _detect_language_heuristic(text: str) -> str:
    t = text.lower()
    es_markers = (" que ", " de ", " la ", " el ", " los ", " las ", " una ", " para ", " con ", " por ")
    en_markers = (" the ", " and ", " you ", " your ", " for ", " with ", " this ", " that ", " have ")
    padded = f" {t} "
    es = sum(1 for m in es_markers if m in padded)
    en = sum(1 for m in en_markers if m in padded)
    if es == 0 and en == 0:
        return "unknown"
    return "es" if es >= en else "en"


class HorizonDetector:
    id = DetectorId.HORIZON.value
    name = "Horizon Phishing & Scam Detector (base, ONNX int8)"
    license = "Apache-2.0"
    version = VERSION

    def __init__(self) -> None:
        self._session = None
        self._tokenizer = None
        self._labels: tuple[str, ...] | None = None
        self._status = ModelStatus.NOT_INSTALLED
        self._error: str | None = None
        self._local = detector_dir(self.id)
        self._refresh_status()

    def _refresh_status(self) -> None:
        if self._session is not None:
            self._status = ModelStatus.LOADED
            return
        missing = [f for f in REQUIRED_FILES if not (self._local / f).exists()]
        if missing:
            self._status = ModelStatus.NOT_INSTALLED
        else:
            self._status = ModelStatus.READY

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
            memory_rss_mb=process_rss_mb() if self._session else None,
            loaded=self._session is not None,
            notes=[
                "Inferencia local con ONNX Runtime (CPU por defecto).",
                "Etiquetas del modelo: fraud | spam | legitimate.",
                "No se aplica política de riesgo automática; se devuelven scores crudos.",
            ],
        )

    def download(self, on_progress=None) -> ModelInfo:
        self._status = ModelStatus.DOWNLOADING
        self._error = None
        try:
            paths = download_files(REPO_ID, REQUIRED_FILES, self._local, on_progress=on_progress)
            errors = verify_files(paths, MIN_BYTES)
            if errors:
                self._status = ModelStatus.ERROR
                self._error = "; ".join(errors)
            else:
                digests = {k: str(v.stat().st_size) for k, v in paths.items()}
                write_manifest(
                    self._local,
                    {
                        "repo_id": REPO_ID,
                        "version": VERSION,
                        "files": digests,
                        "format": "onnx_int8",
                    },
                )
                self._status = ModelStatus.READY
        except Exception as e:
            self._status = ModelStatus.ERROR
            self._error = str(e)
        return self.info()

    def load(self, prefer_cpu: bool = True) -> ModelInfo:
        if self._session is not None:
            return self.info()
        self._refresh_status()
        if self._status == ModelStatus.NOT_INSTALLED:
            self._error = "Modelo no descargado. Ejecuta download primero."
            return self.info()
        self._status = ModelStatus.LOADING
        self._error = None
        try:
            import onnxruntime as ort
            from tokenizers import Tokenizer

            onnx_path = self._local / "onnx" / "model_quantized.onnx"
            if not onnx_path.exists():
                # hf_hub_download may flatten paths differently
                candidates = list(self._local.rglob("model_quantized.onnx"))
                if not candidates:
                    raise FileNotFoundError("model_quantized.onnx no encontrado tras la descarga")
                onnx_path = candidates[0]

            providers = ["CPUExecutionProvider"]
            if not prefer_cpu:
                available = ort.get_available_providers()
                if "CUDAExecutionProvider" in available:
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

            so = ort.SessionOptions()
            so.intra_op_num_threads = 2
            so.inter_op_num_threads = 1
            self._session = ort.InferenceSession(str(onnx_path), sess_options=so, providers=providers)

            tok_path = self._local / "tokenizer.json"
            if not tok_path.exists():
                found = list(self._local.rglob("tokenizer.json"))
                if not found:
                    raise FileNotFoundError("tokenizer.json no encontrado")
                tok_path = found[0]
            config_path = self._local / "config.json"
            if not config_path.exists():
                found_config = list(self._local.rglob("config.json"))
                if not found_config:
                    raise FileNotFoundError("config.json no encontrado")
                config_path = found_config[0]
            self._labels = _read_label_order(config_path)

            self._tokenizer = Tokenizer.from_file(str(tok_path))
            self._tokenizer.enable_truncation(max_length=384)
            self._tokenizer.enable_padding(length=384)
            self._status = ModelStatus.LOADED
        except Exception as e:
            self._session = None
            self._tokenizer = None
            self._labels = None
            self._status = ModelStatus.ERROR
            self._error = str(e)
        return self.info()

    def unload(self) -> ModelInfo:
        self._status = ModelStatus.UNLOADING
        self._session = None
        self._tokenizer = None
        self._refresh_status()
        return self.info()

    def analyze(self, text: str) -> AnalysisResult:
        limitations = [
            "Solo analiza texto; no inspecciona URLs resueltas, cabeceras ni adjuntos.",
            "Scores del modelo sin umbral de política de riesgo aplicado.",
            "Truncado a 384 tokens según entrenamiento del modelo.",
        ]
        if self._session is None or self._tokenizer is None or self._labels is None:
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.MODEL_NOT_READY.value,
                labels=[],
                top_label=None,
                language=_detect_language_heuristic(text),
                relevant_fragments=[],
                raw_scores={},
                limitations=limitations,
                latency_ms=None,
                error="Horizon no está cargado en memoria. Llama a load().",
            )

        text = (text or "").strip()
        if not text:
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
                error="Texto vacío.",
            )

        self._status = ModelStatus.INFERRING
        t0 = time.perf_counter()
        try:
            enc = self._tokenizer.encode(text)
            input_ids = np.array([enc.ids], dtype=np.int64)
            attention_mask = np.array([enc.attention_mask], dtype=np.int64)

            inputs = {}
            for inp in self._session.get_inputs():
                name = inp.name.lower()
                if "mask" in name:
                    inputs[inp.name] = attention_mask
                elif "token_type" in name:
                    inputs[inp.name] = np.zeros_like(input_ids)
                else:
                    inputs[inp.name] = input_ids

            outputs = self._session.run(None, inputs)
            logits = np.array(outputs[0]).reshape(-1)
            # Softmax
            x = logits - logits.max()
            exp = np.exp(x)
            probs = exp / exp.sum()
            if len(probs) != len(self._labels):
                raise ValueError(
                    f"El modelo devolvió {len(probs)} logits para {len(self._labels)} etiquetas."
                )
            if not np.isfinite(probs).all():
                raise ValueError("El modelo devolvió scores no finitos.")
            scores = {label: float(probs[i]) for i, label in enumerate(self._labels)}
            ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            labels = [ScoreItem(label=k, score=v) for k, v in ordered]
            top = ordered[0][0] if ordered else None
            latency = (time.perf_counter() - t0) * 1000
            self._status = ModelStatus.LOADED
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.OK.value,
                labels=labels,
                top_label=top,
                language=_detect_language_heuristic(text),
                relevant_fragments=[{"text": text[:500], "role": "input"}],
                raw_scores=scores,
                limitations=limitations,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            self._status = ModelStatus.LOADED
            return AnalysisResult(
                model_id=self.id,
                model_version=self.version,
                state=AnalysisState.ERROR.value,
                labels=[],
                top_label=None,
                language=_detect_language_heuristic(text),
                relevant_fragments=[],
                raw_scores={},
                limitations=limitations,
                latency_ms=(time.perf_counter() - t0) * 1000,
                error=str(e),
            )
