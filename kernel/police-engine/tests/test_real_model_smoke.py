"""Pruebas opcionales de inferencia con pesos reales descargados de Hugging Face."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from detectors.horizon import HorizonDetector
from detectors.mrbert_legal import MrBertLegalDetector


@unittest.skipUnless(
    os.environ.get("KERNEL_POLICE_REAL_MODEL_TESTS") == "1",
    "Activa KERNEL_POLICE_REAL_MODEL_TESTS=1 para descargar y ejecutar pesos reales.",
)
class RealModelSmokeTests(unittest.TestCase):
    def test_horizon_real_onnx_inference(self):
        detector = HorizonDetector()
        try:
            if detector.info().status != "ready":
                downloaded = detector.download()
                self.assertEqual(downloaded.status, "ready", downloaded.error)
            loaded = detector.load(prefer_cpu=True)
            self.assertTrue(loaded.loaded, loaded.error)
            result = detector.analyze(
                "Su cuenta bancaria ha sido bloqueada. Verifique sus datos y contraseña "
                "en este enlace para evitar la suspensión inmediata."
            )
            self.assertEqual(result.state, "ok", result.error)
            self.assertEqual(set(result.raw_scores), {"fraud", "spam", "legitimate"})
            self.assertAlmostEqual(sum(result.raw_scores.values()), 1.0, delta=0.02)
        finally:
            detector.unload()

    def test_mrbert_legal_real_encoder_inference(self):
        detector = MrBertLegalDetector()
        try:
            if detector.info().status != "ready":
                downloaded = detector.download()
                self.assertEqual(downloaded.status, "ready", downloaded.error)
            loaded = detector.load(prefer_cpu=True)
            self.assertTrue(loaded.loaded, loaded.error)
            result = detector.analyze(
                text="El contrato establece un plazo de preaviso de treinta días.",
                query="¿Qué plazo de preaviso establece el contrato?",
                corpus=[
                    "El contrato establece un plazo de preaviso de treinta días.",
                    "La parte arrendataria deberá abonar la renta mensual.",
                ],
            )
            self.assertEqual(result.state, "ok", result.error)
            self.assertIsNone(result.top_label)
            self.assertGreaterEqual(len(result.relevant_fragments), 1)
            self.assertIn("treinta días", result.relevant_fragments[0]["text"])
            self.assertTrue(any("cosine_similarity" in item for item in result.relevant_fragments))
        finally:
            detector.unload()


if __name__ == "__main__":
    unittest.main()
