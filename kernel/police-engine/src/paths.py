"""Rutas locales del motor policial (fuera del árbol de chat/WebLLM)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("KERNEL_POLICE_HOME", Path.home() / ".kernel-police")).resolve()
MODELS_DIR = ROOT / "models"
CACHE_DIR = ROOT / "cache"
LOG_DIR = ROOT / "logs"


def ensure_dirs() -> None:
    for p in (ROOT, MODELS_DIR, CACHE_DIR, LOG_DIR):
        p.mkdir(parents=True, exist_ok=True)


def detector_dir(detector_id: str) -> Path:
    ensure_dirs()
    d = MODELS_DIR / detector_id
    d.mkdir(parents=True, exist_ok=True)
    return d
