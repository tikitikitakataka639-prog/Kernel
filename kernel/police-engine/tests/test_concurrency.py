"""Concurrencia: exclusiones mutuas load/analyze/unload."""
from __future__ import annotations

import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from detectors.grooming_xlm import GroomingDetector  # noqa: E402
from engine import PoliceEngine  # noqa: E402


class ConcurrencyTests(unittest.TestCase):
    def test_analyze_not_interrupted_by_unload_race(self):
        eng = PoliceEngine()
        info = eng.load("grooming-xlm-roberta-es-en", prefer_cpu=True)
        if not info.get("loaded"):
            self.skipTest(info.get("error") or "no checkpoint")

        errors: list[str] = []
        results: list[dict] = []

        def do_analyze():
            try:
                # trabajo bajo el mismo lock: unload debe esperar
                r = eng.analyze(
                    "grooming-xlm-roberta-es-en",
                    "SpeakerA: keep this secret and move apps\nSpeakerB: ok",
                )
                results.append(r)
            except Exception as e:
                errors.append(f"analyze:{e}")

        def do_unload():
            time.sleep(0.01)
            try:
                eng.unload("grooming-xlm-roberta-es-en")
            except Exception as e:
                errors.append(f"unload:{e}")

        t1 = threading.Thread(target=do_analyze)
        t2 = threading.Thread(target=do_unload)
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)
        self.assertEqual(errors, [])
        self.assertTrue(results)
        self.assertIn(results[0].get("state"), ("ok", "model_not_ready", "error"))

    def test_single_loaded_model_policy(self):
        eng = PoliceEngine()
        g = eng.load("grooming-xlm-roberta-es-en", prefer_cpu=True)
        if not g.get("loaded"):
            self.skipTest(g.get("error") or "no checkpoint")
        # Cargar horizon (puede no tener pesos) no debe dejar dos loaded=True
        eng.load("horizon", prefer_cpu=True)
        st = eng.status()
        loaded_flags = [d for d in st["detectors"] if d.get("loaded")]
        # Como máximo uno
        self.assertLessEqual(len(loaded_flags), 1)

    def test_parallel_analyze_serialized(self):
        eng = PoliceEngine()
        info = eng.load("grooming-xlm-roberta-es-en", prefer_cpu=True)
        if not info.get("loaded"):
            self.skipTest(info.get("error") or "no checkpoint")
        barrier = threading.Barrier(2)
        order: list[str] = []
        lock_probe = threading.Lock()

        def worker(tag: str):
            barrier.wait(timeout=5)
            eng.analyze("grooming-xlm-roberta-es-en", f"SpeakerA: hello {tag}")
            with lock_probe:
                order.append(tag)

        t1 = threading.Thread(target=worker, args=("a",))
        t2 = threading.Thread(target=worker, args=("b",))
        t1.start()
        t2.start()
        t1.join(30)
        t2.join(30)
        self.assertEqual(sorted(order), ["a", "b"])


if __name__ == "__main__":
    unittest.main()
