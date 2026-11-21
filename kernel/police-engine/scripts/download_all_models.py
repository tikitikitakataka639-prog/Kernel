"""Descarga secuencial de los modelos autorizados del KERNEL POLICE ENGINE."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from engine import PoliceEngine  # noqa: E402

DOWNLOAD_IDS = (
    "horizon",
    "mrbert-legal",
    "grooming-xlm-roberta-es-en",
    "paxmod-guard",
)

def main() -> int:
    engine = PoliceEngine()
    results = []
    for detector_id in DOWNLOAD_IDS:
        print(f"\\n=== Descargando {detector_id} ===", flush=True)
        info = engine.download(detector_id)
        results.append(info)
        print(json.dumps(info, ensure_ascii=False, indent=2), flush=True)
        if info.get("status") not in ("ready", "loaded"):
            print(f"ERROR: {detector_id} no quedó listo.", file=sys.stderr)
    failures = [x for x in results if x.get("status") not in ("ready", "loaded")]
    print("\\nRESUMEN")
    for item in results:
        print(f"- {item['id']}: {item['status']}")
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
