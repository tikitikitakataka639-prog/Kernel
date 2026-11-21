"""Recorrido HTTP real del servidor local con Horizon y MrBERT cargados."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import server  # noqa: E402
from engine import ENGINE  # noqa: E402

PRODUCTION_ORIGIN = "https://project-kernel-release-1-0-0.lovable.app"


@unittest.skipUnless(
    os.environ.get("KERNEL_POLICE_REAL_MODEL_TESTS") == "1",
    "Activa KERNEL_POLICE_REAL_MODEL_TESTS=1 para el recorrido HTTP con pesos reales.",
)
class RealPoliceApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        try:
            ENGINE.unload()
        finally:
            cls.httpd.shutdown()
            cls.httpd.server_close()
            cls.thread.join(timeout=5)

    def _post(self, path: str, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        connection = HTTPConnection("127.0.0.1", self.port, timeout=180)
        connection.request(
            "POST",
            path,
            body=body,
            headers={
                "Origin": PRODUCTION_ORIGIN,
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
        )
        response = connection.getresponse()
        raw = response.read()
        cors_origin = response.getheader("Access-Control-Allow-Origin")
        connection.close()
        return response.status, json.loads(raw), cors_origin

    def test_horizon_download_load_analyze_unload_over_http(self):
        status, downloaded, cors = self._post("/download", {"detector": "horizon"})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertEqual(downloaded["model"]["status"], "ready", downloaded["model"].get("error"))

        status, loaded, cors = self._post("/load", {"detector": "horizon", "prefer_cpu": True})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertTrue(loaded["model"]["loaded"], loaded["model"].get("error"))

        status, analyzed, cors = self._post(
            "/analyze",
            {
                "detector": "horizon",
                "text": "Su cuenta bancaria ha sido bloqueada. Verifique su contraseña en este enlace inmediatamente.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        result = analyzed["result"]
        self.assertEqual(result["state"], "ok", result.get("error"))
        self.assertEqual(set(result["raw_scores"]), {"fraud", "spam", "legitimate"})

        status, unloaded, cors = self._post("/unload", {"detector": "horizon"})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertFalse(unloaded["model"]["loaded"])

    def test_mrbert_download_load_similarity_unload_over_http(self):
        status, downloaded, cors = self._post("/download", {"detector": "mrbert-legal"})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertEqual(downloaded["model"]["status"], "ready", downloaded["model"].get("error"))

        status, loaded, cors = self._post("/load", {"detector": "mrbert-legal", "prefer_cpu": True})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertTrue(loaded["model"]["loaded"], loaded["model"].get("error"))

        status, analyzed, cors = self._post(
            "/analyze",
            {
                "detector": "mrbert-legal",
                "text": "El contrato establece un plazo de preaviso de treinta días.",
                "query": "¿Qué plazo de preaviso establece el contrato?",
                "corpus": [
                    "El contrato establece un plazo de preaviso de treinta días.",
                    "La parte arrendataria deberá abonar la renta mensual.",
                ],
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        result = analyzed["result"]
        self.assertEqual(result["state"], "ok", result.get("error"))
        self.assertIsNone(result["top_label"])
        self.assertIn("treinta días", result["relevant_fragments"][0]["text"])
        self.assertTrue(any("cosine_similarity" in item for item in result["relevant_fragments"]))

        status, unloaded, cors = self._post("/unload", {"detector": "mrbert-legal"})
        self.assertEqual(status, 200)
        self.assertEqual(cors, PRODUCTION_ORIGIN)
        self.assertFalse(unloaded["model"]["loaded"])


if __name__ == "__main__":
    unittest.main()
