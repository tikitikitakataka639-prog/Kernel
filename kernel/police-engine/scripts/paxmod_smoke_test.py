"""Smoke test manual para comprobar el paquete/pesos reales de PaxmodGuard."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from detectors.paxmod_guard import PaxmodGuardDetector  # noqa: E402


def main() -> int:
    detector = PaxmodGuardDetector()
    info = detector.load(prefer_cpu=True)
    print(json.dumps(info.to_dict(), ensure_ascii=False, indent=2))
    if not info.loaded:
        return 1
    sample = (
        "SpeakerA: Tengo 13 años.\n"
        "SpeakerB: No se lo digas a tus padres y pásate a otra aplicación.\n"
        "SpeakerA: No sé si quiero.\n"
        "SpeakerB: Borra este chat y mándame una foto privada."
    )
    result = detector.analyze(sample)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    detector.unload()
    return 0 if result.state == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(main())
