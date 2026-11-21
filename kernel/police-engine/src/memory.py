"""Medición de memoria del proceso del motor policial."""
from __future__ import annotations

import os
from typing import Any


def process_rss_mb() -> float | None:
    """RSS del proceso actual en MB. None si no se puede leer."""
    try:
        # Linux
        with open(f"/proc/{os.getpid()}/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    # kB
                    kb = int(line.split()[1])
                    return round(kb / 1024.0, 2)
    except OSError:
        pass
    try:
        import resource

        # ru_maxrss: Linux = kB, macOS = bytes
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if rss > 10_000_000:  # likely bytes (macOS)
            return round(rss / (1024 * 1024), 2)
        return round(rss / 1024.0, 2)
    except Exception:
        return None


def memory_snapshot() -> dict[str, Any]:
    return {
        "rss_mb": process_rss_mb(),
        "vram_mb": None,  # VRAM requiere NVML; no se inventa si no está disponible
        "note": "VRAM solo se informa si hay NVML/CUDA disponible en el host.",
    }
