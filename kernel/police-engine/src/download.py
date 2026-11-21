"""Descarga selectiva de archivos Hugging Face con progreso e integridad."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Callable

from huggingface_hub import hf_hub_download, list_repo_files

ProgressCb = Callable[[str, int, int | None], None]


def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def download_files(
    repo_id: str,
    filenames: list[str],
    dest_dir: Path,
    revision: str | None = None,
    on_progress: ProgressCb | None = None,
) -> dict[str, Path]:
    """Descarga solo los archivos listados. Devuelve mapa filename -> path local."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for name in filenames:
        if on_progress:
            on_progress(name, 0, None)
        local = hf_hub_download(
            repo_id=repo_id,
            filename=name,
            local_dir=str(dest_dir),
            revision=revision,
        )
        path = Path(local)
        out[name] = path
        if on_progress:
            size = path.stat().st_size if path.exists() else 0
            on_progress(name, size, size)
    return out


def verify_files(paths: dict[str, Path], expected_min_bytes: dict[str, int] | None = None) -> list[str]:
    """Comprueba existencia y tamaño mínimo. Devuelve lista de errores."""
    errors: list[str] = []
    expected_min_bytes = expected_min_bytes or {}
    for name, path in paths.items():
        if not path.exists():
            errors.append(f"Falta archivo: {name}")
            continue
        size = path.stat().st_size
        if size <= 0:
            errors.append(f"Archivo vacío: {name}")
        min_b = expected_min_bytes.get(name)
        if min_b is not None and size < min_b:
            errors.append(f"Tamaño insuficiente para {name}: {size} < {min_b}")
    return errors


def write_manifest(dest_dir: Path, data: dict) -> Path:
    path = dest_dir / "kernel-police-manifest.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def read_manifest(dest_dir: Path) -> dict | None:
    path = dest_dir / "kernel-police-manifest.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_remote_files(repo_id: str) -> list[str]:
    return list(list_repo_files(repo_id))
