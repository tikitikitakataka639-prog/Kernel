"""Integración Horizon: descarga + inferencia real si hay RAM y red.

Si el entorno no puede cargar el ONNX (~641 MB), el test se omite con motivo explícito.
No se inventan scores.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

TEST_HOME = tempfile.mkdtemp(prefix="kernel-police-int-")
os.environ["KERNEL_POLICE_HOME"] = TEST_HOME

from detectors.horizon import HorizonDetector  # noqa: E402
from schema import AnalysisState  # noqa: E402

CASES = [
    (
        "es-fraud",
        "Su paquete no pudo entregarse. Pague la tasa de aduanas de 1,99 EUR en 24 h: dhl-redelivery.ejemplo.com",
        "fraud",
    ),
    (
        "en-fraud",
        "Your parcel could not be delivered. Pay the 1.99 EUR customs fee within 24h: dhl-redelivery.example.com",
        "fraud",
    ),
    (
        "es-legit",
        "Hola, quedamos mañana a las cinco en la biblioteca como hablamos.",
        "legitimate",
    ),
    (
        "en-legit",
        "Hi, running 10 minutes late, see you at the cafe.",
        "legitimate",
    ),
    (
        "en-spam",
        "MEGA SALE 70% off all shoes this weekend only! Shop now",
        "spam",
    ),
]


@unittest.skipIf(
    os.environ.get("KERNEL_POLICE_SKIP_DOWNLOAD") == "1",
    "KERNEL_POLICE_SKIP_DOWNLOAD=1",
)
class HorizonIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detector = HorizonDetector()
        info = cls.detector.download()
        if info.status == "error":
            raise unittest.SkipTest(f"Descarga Horizon falló: {info.error}")
        info = cls.detector.load(prefer_cpu=True)
        if not info.loaded:
            raise unittest.SkipTest(
                f"No se pudo cargar Horizon en este entorno (RAM/deps): {info.error}"
            )

    def test_inference_returns_real_scores(self):
        for name, text, expected in CASES:
            with self.subTest(case=name):
                r = self.detector.analyze(text)
                self.assertEqual(r.state, AnalysisState.OK.value, msg=r.error)
                self.assertTrue(r.labels, msg="sin etiquetas")
                self.assertEqual(r.top_label, expected, msg=f"{name}: scores={r.raw_scores}")
                self.assertAlmostEqual(sum(l.score for l in r.labels), 1.0, places=2)
                self.assertIsNotNone(r.top_label)
                self.assertIsNotNone(r.latency_ms)
                print(
                    f"[horizon] {name}: top={r.top_label} scores={r.raw_scores} lang={r.language} ms={r.latency_ms}",
                    flush=True,
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
