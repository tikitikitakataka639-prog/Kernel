"""Gestor central: un modelo cargado a la vez (prioridad 6 GB VRAM).

Exclusión mutua: load/unload/download/analyze comparten un RLock para que
una descarga de memoria no interrumpa una inferencia en curso y se respete
la política de un solo modelo cargado.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from detectors.grooming_xlm import GroomingDetector
from detectors.horizon import HorizonDetector
from detectors.mrbert_legal import MrBertLegalDetector
from detectors.paxmod_guard import PaxmodGuardDetector
from memory import memory_snapshot
from schema import DetectorId


class PoliceEngine:
    def __init__(self) -> None:
        self.horizon = HorizonDetector()
        self.mrbert = MrBertLegalDetector()
        self.paxmod_guard = PaxmodGuardDetector()
        self.grooming = GroomingDetector()
        self._loaded_id: str | None = None
        self._lock = threading.RLock()

    def _by_id(self, detector_id: str):
        mapping = {
            DetectorId.HORIZON.value: self.horizon,
            DetectorId.MRBERT_LEGAL.value: self.mrbert,
            DetectorId.PAXMOD_GUARD.value: self.paxmod_guard,
            DetectorId.GROOMING.value: self.grooming,
        }
        if detector_id not in mapping:
            raise KeyError(f"Detector desconocido: {detector_id}")
        return mapping[detector_id]

    def status(self) -> dict[str, Any]:
        # Lectura sin bloquear operaciones largas de forma prolongada:
        # tomamos el lock para snapshot coherente de loaded_model.
        with self._lock:
            loaded = self._loaded_id
        return {
            "engine": "KERNEL POLICE ENGINE",
            "version": (Path(__file__).resolve().parents[1] / "VERSION").read_text(encoding="utf-8").strip(),
            "loaded_model": loaded,
            "memory": memory_snapshot(),
            "detectors": [
                self.horizon.info().to_dict(),
                self.mrbert.info().to_dict(),
                self.paxmod_guard.info().to_dict(),
                self.grooming.info().to_dict(),
            ],
        }

    def download(self, detector_id: str) -> dict[str, Any]:
        with self._lock:
            det = self._by_id(detector_id)
            if self._loaded_id and self._loaded_id != detector_id:
                previous = self._by_id(self._loaded_id)
                previous.unload()
                self._loaded_id = None
            info = det.download()
            self._loaded_id = detector_id if info.loaded else None
            return info.to_dict()

    def load(self, detector_id: str, prefer_cpu: bool = True) -> dict[str, Any]:
        with self._lock:
            det = self._by_id(detector_id)
            if self._loaded_id and self._loaded_id != detector_id:
                previous = self._by_id(self._loaded_id)
                # Si liberar el modelo anterior falla, no se intenta cargar otro.
                previous.unload()
                self._loaded_id = None
            info = det.load(prefer_cpu=prefer_cpu)
            self._loaded_id = detector_id if info.loaded else None
            return info.to_dict()

    def unload(self, detector_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            target = detector_id or self._loaded_id
            if not target:
                return self.status()
            det = self._by_id(target)
            det.unload()
            if self._loaded_id == target:
                self._loaded_id = None
            return det.info().to_dict()

    def analyze(
        self,
        detector_id: str,
        text: str,
        query: str | None = None,
        corpus: list[str] | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            det = self._by_id(detector_id)
            if detector_id == DetectorId.MRBERT_LEGAL.value:
                result = det.analyze(text=text, query=query, corpus=corpus)
            else:
                result = det.analyze(text)
            return result.to_dict()


ENGINE = PoliceEngine()
