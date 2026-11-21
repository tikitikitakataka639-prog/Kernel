"""Tipos compartidos del KERNEL POLICE ENGINE."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class DetectorId(str, Enum):
    HORIZON = "horizon"
    MRBERT_LEGAL = "mrbert-legal"
    PAXMOD_GUARD = "paxmod-guard"
    GROOMING = "grooming-xlm-roberta-es-en"


class ModelStatus(str, Enum):
    NOT_INSTALLED = "not_installed"
    DOWNLOADING = "downloading"
    READY = "ready"
    LOADING = "loading"
    LOADED = "loaded"
    INFERRING = "inferring"
    ERROR = "error"
    LICENSE_BLOCKED = "license_blocked"
    UNLOADING = "unloading"


class AnalysisState(str, Enum):
    OK = "ok"
    MODEL_NOT_READY = "model_not_ready"
    LICENSE_BLOCKED = "license_blocked"
    ERROR = "error"
    SKIPPED = "skipped"


@dataclass
class DownloadProgress:
    detector: str
    filename: str
    bytes_downloaded: int
    bytes_total: int | None
    percent: float | None


@dataclass
class ModelInfo:
    id: str
    name: str
    version: str
    license: str
    status: str
    repo_id: str
    files: list[str]
    local_dir: str | None
    error: str | None = None
    memory_rss_mb: float | None = None
    loaded: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ScoreItem:
    label: str
    score: float


@dataclass
class AnalysisResult:
    model_id: str
    model_version: str
    state: str
    labels: list[ScoreItem]
    top_label: str | None
    language: str | None
    relevant_fragments: list[dict[str, Any]]
    raw_scores: dict[str, float]
    limitations: list[str]
    latency_ms: float | None
    error: str | None = None
    notes: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["labels"] = [{"label": x.label, "score": x.score} for x in self.labels]
        return d
