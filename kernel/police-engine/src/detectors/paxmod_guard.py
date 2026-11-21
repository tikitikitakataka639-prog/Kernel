"""Adaptador local para PaxmodGuard (paquete y pesos externos Apache-2.0).

No incluye ni redistribuye pesos: el paquete oficial los descarga a su caché
cuando se inicializa por primera vez. Los mensajes se procesan localmente.
"""
from __future__ import annotations

import importlib
from importlib.util import find_spec
from pathlib import Path
import re
import time
from typing import Any

from memory import process_rss_mb
from schema import AnalysisResult, AnalysisState, DetectorId, ModelInfo, ModelStatus, ScoreItem

VERSION = "0.1.1"
REPO_ID = "paxmod/guard"
PACKAGE = "paxmod-guard"


def _value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _turns(text: str) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        match = re.match(r"^(?:\[)?([A-Za-zÁÉÍÓÚÜÑ0-9 _-]{1,32})(?:\])?\s*:\s*(.+)$", line)
        if match:
            speaker, content = match.group(1).strip(), match.group(2).strip()
        else:
            speaker, content = "A", line
        turns.append({"role": "player", "speaker": speaker, "text": content})
    return turns


class PaxmodGuardDetector:
    id = DetectorId.PAXMOD_GUARD.value
    name = "PaxmodGuard · protección de conversaciones"
    license = "Apache-2.0 (paquete y pesos declarados por Paxmod)"
    version = VERSION

    def __init__(self) -> None:
        self._guard = None
        self._status = ModelStatus.NOT_INSTALLED
        self._error: str | None = None
        self._refresh()

    def _refresh(self) -> None:
        try:
            installed = find_spec("paxmod_guard") is not None
        except (ImportError, ValueError):
            installed = False
        if not installed:
            self._status = ModelStatus.NOT_INSTALLED
        elif self._guard is not None:
            self._status = ModelStatus.LOADED
        else:
            cache = Path.home() / ".cache" / "paxmod-guard"
            has_weights = cache.exists() and any(item.is_file() and item.stat().st_size > 0 for item in cache.rglob("*"))
            self._status = ModelStatus.READY if has_weights else ModelStatus.NOT_INSTALLED

    def info(self) -> ModelInfo:
        self._refresh()
        return ModelInfo(
            id=self.id, name=self.name, version=self.version, license=self.license,
            status=self._status.value, repo_id=REPO_ID, files=[], local_dir=None,
            error=self._error, memory_rss_mb=process_rss_mb() if self._guard else None,
            loaded=self._guard is not None,
            notes=[
                "Inferencia local mediante paxmod-guard==0.1.1; pesos descargados por el paquete oficial (aprox. 220 MB).",
                "Admite mensajes, contexto y conversaciones completas; la integración usa conversación completa.",
                "Se activan las señales secrecy y risk_check para que tácticas de captación puntúen y puedan marcarse.",
                "El modelo abierto se entrenó con datos públicos y sintéticos; requiere validación específica en español.",
                "No es un moderador autónomo ni determina culpabilidad; los casos graves requieren revisión humana.",
                "Primera inicialización necesita conexión para descargar los pesos; después la inferencia es local.",
            ],
        )

    def _initialize(self) -> None:
        module = importlib.import_module("paxmod_guard")
        guard_cls = getattr(module, "Guard", None)
        if guard_cls is None:
            raise RuntimeError("El paquete paxmod-guard no expone la clase Guard esperada.")
        # Activa señales de grooming que la API puntúa pero no marca por defecto.
        self._guard = guard_cls(enable=["secrecy", "risk_check"])
        self._status = ModelStatus.LOADED
        self._error = None

    def download(self, on_progress=None) -> ModelInfo:
        # La descarga de pesos la gestiona el paquete oficial al crear Guard.
        return self.load(prefer_cpu=True)

    def load(self, prefer_cpu: bool = True) -> ModelInfo:
        if self._guard is not None:
            return self.info()
        self._status = ModelStatus.LOADING
        self._error = None
        try:
            self._initialize()
        except Exception as exc:
            self._guard = None
            self._status = ModelStatus.ERROR
            self._error = f"No se pudo inicializar PaxmodGuard: {exc}"
        return self.info()

    def unload(self) -> ModelInfo:
        self._guard = None
        self._refresh()
        return self.info()

    def analyze(self, text: str) -> AnalysisResult:
        started = time.perf_counter()
        limitations = [
            "Las puntuaciones son señales de clasificación, no pruebas ni conclusiones legales.",
            "El modelo abierto no alcanza precisión suficiente para decisiones automáticas; requiere revisión humana.",
            "La evaluación publicada por el proveedor no sustituye una validación independiente con conversaciones españolas representativas.",
            "La integración analiza el fragmento de conversación recibido; no correlaciona sesiones separadas en el tiempo.",
        ]
        if self._guard is None:
            return AnalysisResult(
                model_id=self.id, model_version=self.version,
                state=AnalysisState.MODEL_NOT_READY.value, labels=[], top_label=None,
                language=None, relevant_fragments=[], raw_scores={}, limitations=limitations,
                latency_ms=None, error="PaxmodGuard no está cargado. Descarga/carga el modelo primero.",
            )
        turns = _turns(text)
        if not turns:
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.ERROR.value,
                labels=[], top_label=None, language=None, relevant_fragments=[], raw_scores={},
                limitations=limitations, latency_ms=None, error="No hay mensajes para analizar.",
            )
        try:
            result = self._guard.check_conversation(turns)
            scores_obj = _value(result, "scores", {}) or {}
            if isinstance(scores_obj, dict):
                scores = {str(k): float(v) for k, v in scores_obj.items() if isinstance(v, (int, float))}
            else:
                scores = {}
            labels_obj = _value(result, "labels", []) or []
            labels: list[ScoreItem] = []
            if isinstance(labels_obj, dict):
                labels = [ScoreItem(str(k), float(v)) for k, v in labels_obj.items() if isinstance(v, (int, float))]
            else:
                for item in labels_obj:
                    label = _value(item, "label", item if isinstance(item, str) else None)
                    score = _value(item, "score", scores.get(str(label), 0.0))
                    if label is not None:
                        labels.append(ScoreItem(str(label), float(score or 0.0)))
            if not labels and scores:
                labels = [ScoreItem(k, v) for k, v in scores.items()]
            labels.sort(key=lambda x: x.score, reverse=True)
            top = labels[0].label if labels else None
            flagged = bool(_value(result, "flagged", False))
            latency = _value(result, "latency_ms", None)
            if not isinstance(latency, (int, float)):
                latency = (time.perf_counter() - started) * 1000
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.OK.value,
                labels=labels, top_label=top, language=None,
                relevant_fragments=[], raw_scores=scores, limitations=limitations,
                latency_ms=float(latency), error=None,
                notes=["flagged=" + str(flagged), "La etiqueta superior es la puntuación más alta devuelta; no equivale a un diagnóstico."],
                metadata={"flagged": flagged, "turn_count": len(turns), "review_required": flagged},
            )
        except Exception as exc:
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.ERROR.value,
                labels=[], top_label=None, language=None, relevant_fragments=[], raw_scores={},
                limitations=limitations, latency_ms=(time.perf_counter() - started) * 1000,
                error=f"Error de inferencia PaxmodGuard: {exc}",
            )
