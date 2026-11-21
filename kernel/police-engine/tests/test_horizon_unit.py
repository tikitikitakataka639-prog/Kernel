from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from detectors.horizon import HorizonDetector, _detect_language_heuristic  # noqa: E402
from detectors.paxmod_guard import PaxmodGuardDetector, _turns  # noqa: E402
from engine import PoliceEngine  # noqa: E402
from schema import AnalysisState, ModelStatus  # noqa: E402


class EngineStatus(unittest.TestCase):
    def test_status_lists_four_detectors(self):
        eng = PoliceEngine()
        st = eng.status()
        self.assertEqual(st["version"], "0.2.5")
        ids = {d["id"] for d in st["detectors"]}
        self.assertEqual(
            ids,
            {"horizon", "mrbert-legal", "paxmod-guard", "grooming-xlm-roberta-es-en"},
        )


class HorizonWithoutWeights(unittest.TestCase):
    def test_analyze_without_load(self):
        h = HorizonDetector()
        r = h.analyze("test phishing message buy now click")
        self.assertIn(r.state, (AnalysisState.MODEL_NOT_READY.value, AnalysisState.ERROR.value, "model_not_ready", "error"))


class LanguageTests(unittest.TestCase):
    def test_spanish(self):
        self.assertEqual(_detect_language_heuristic("Hola qué tal con la oferta"), "es")

    def test_english(self):
        self.assertEqual(_detect_language_heuristic("Hello how are you with this offer"), "en")


class PaxmodGuardAdapterTests(unittest.TestCase):
    def test_registered_with_declared_license(self):
        detector = PaxmodGuardDetector()
        self.assertEqual(detector.info().license.split()[0], "Apache-2.0")
        self.assertEqual(detector.info().id, "paxmod-guard")

    def test_cached_weights_report_ready_after_unload(self):
        import os
        import tempfile
        from pathlib import Path
        from unittest import mock

        with tempfile.TemporaryDirectory() as home:
            cache = Path(home) / ".cache" / "paxmod-guard"
            cache.mkdir(parents=True)
            (cache / "model.onnx").write_bytes(b"weights")
            with mock.patch("pathlib.Path.home", return_value=Path(home)), mock.patch(
                "detectors.paxmod_guard.find_spec", return_value=object()
            ):
                detector = PaxmodGuardDetector()
                self.assertEqual(detector.info().status, ModelStatus.READY.value)

    def test_load_enables_contextual_grooming_signals(self):
        import types
        from unittest import mock

        calls = {}
        class FakeGuard:
            def __init__(self, **kwargs):
                calls.update(kwargs)
            def check_conversation(self, turns):
                return {"flagged": True, "labels": ["suspected_grooming"], "scores": {"suspected_grooming": 0.91}}

        module = types.SimpleNamespace(Guard=FakeGuard)
        detector = PaxmodGuardDetector()
        with mock.patch("importlib.import_module", return_value=module):
            info = detector.load(prefer_cpu=True)
            self.assertTrue(info.loaded)
            result = detector.analyze("Adulto: No se lo digas a tus padres.")
        self.assertEqual(calls, {"enable": ["secrecy", "risk_check"]})
        self.assertEqual(result.state, AnalysisState.OK.value)
        self.assertEqual(result.top_label, "suspected_grooming")

    def test_turn_parser_preserves_speaker(self):
        turns = _turns("SpeakerA: No le digas a nadie.\nSpeakerB: ¿Por qué?")
        self.assertEqual(len(turns), 2)
        self.assertEqual(turns[0]["speaker"], "SpeakerA")
        self.assertEqual(turns[1]["speaker"], "SpeakerB")

    def test_analysis_maps_package_scores_without_promoting_them_to_facts(self):
        class FakeGuard:
            def check_conversation(self, turns):
                self.turns = turns
                return {"flagged": True, "labels": ["suspected_grooming"], "scores": {"suspected_grooming": 0.82}, "latency_ms": 7}

        detector = PaxmodGuardDetector()
        detector._guard = FakeGuard()
        result = detector.analyze("SpeakerA: No le digas a nadie.\nSpeakerB: Vale.")
        self.assertEqual(result.state, AnalysisState.OK.value)
        self.assertEqual(result.raw_scores["suspected_grooming"], 0.82)
        self.assertTrue(result.metadata["flagged"])
        self.assertTrue(any("no pruebas" in item.lower() for item in result.limitations))


if __name__ == "__main__":
    unittest.main()
