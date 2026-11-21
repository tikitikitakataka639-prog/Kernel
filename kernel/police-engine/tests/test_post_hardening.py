"""POST sin origen, cuerpos inválidos y checkpoint verificado."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import engine as eng_mod  # noqa: E402
import server  # noqa: E402

OK_ORIGIN = "https://project-kernel-release-1-0-0.lovable.app"


class PostHardeningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def _post(self, path, body=b"{}", headers=None):
        c = HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("POST", path, body=body, headers=headers or {})
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, data

    def test_missing_origin_blocks_every_side_effect(self):
        calls = []
        patches = [mock.patch.object(eng_mod.ENGINE, n, side_effect=lambda *a, n=n, **k: calls.append(n)) for n in ("load", "download", "unload", "analyze")]
        for p in patches:
            p.start()
        try:
            for path in ("/load", "/download", "/unload", "/analyze"):
                body = json.dumps({"detector": "unknown-detector", "text": "x"}).encode()
                status, _ = self._post(path, body, {"Content-Type": "application/json", "Content-Length": str(len(body))})
                self.assertEqual(status, 403, path)
        finally:
            for p in patches:
                p.stop()
        self.assertEqual(calls, [])


    def test_production_origin_preflight_returns_private_network_permission(self):
        c = HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("OPTIONS", "/analyze", headers={"Origin": OK_ORIGIN})
        response = c.getresponse()
        response.read()
        self.assertEqual(response.status, 204)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), OK_ORIGIN)
        self.assertEqual(response.getheader("Access-Control-Allow-Private-Network"), "true")
        c.close()

    def test_unlisted_origin_is_rejected(self):
        body = b'{"detector":"horizon","text":"x"}'
        status, raw = self._post(
            "/analyze",
            body,
            {
                "Origin": "https://untrusted.example",
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
        )
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(raw)["error"], "origin_not_allowed")

    def test_invalid_lengths_and_bodies_rejected_before_engine(self):
        with mock.patch.object(eng_mod.ENGINE, "analyze") as analyze:
            base = {"Origin": OK_ORIGIN, "Content-Type": "application/json"}
            self.assertEqual(self._post("/analyze", b"{}", {**base, "Content-Length": "-1"})[0], 400)
            self.assertEqual(self._post("/analyze", b"{}", {**base, "Content-Length": "abc"})[0], 411)
            self.assertEqual(self._post("/analyze", b"[]", {**base, "Content-Length": "2"})[0], 400)
            self.assertEqual(self._post("/analyze?x=1", b"{}", {**base, "Content-Length": "2"})[0], 404)
            analyze.assert_not_called()

    def test_invalid_optional_fields_are_rejected_before_engine(self):
        base = {"Origin": OK_ORIGIN, "Content-Type": "application/json"}
        cases = [
            ("/load", {"detector": "horizon", "prefer_cpu": "false"}),
            ("/analyze", {"detector": "mrbert-legal", "text": "x", "query": 42}),
            ("/analyze", {"detector": "mrbert-legal", "text": "x", "corpus": ["ok", 42]}),
            ("/analyze", {"detector": "mrbert-legal", "text": "x", "corpus": ["x" * 20_001]}),
        ]
        with mock.patch.object(eng_mod.ENGINE, "load") as load, mock.patch.object(eng_mod.ENGINE, "analyze") as analyze:
            for path, payload in cases:
                body = json.dumps(payload).encode()
                status, _ = self._post(path, body, {**base, "Content-Length": str(len(body))})
                self.assertEqual(status, 400, (path, payload))
            load.assert_not_called()
            analyze.assert_not_called()

    def test_paxmod_guard_is_registered_for_download(self):
        body = b'{"detector":"paxmod-guard"}'
        with mock.patch.object(eng_mod.ENGINE.paxmod_guard, "download") as download:
            download.return_value = eng_mod.ENGINE.paxmod_guard.info()
            status, data = self._post("/download", body, {"Origin": OK_ORIGIN, "Content-Type": "application/json", "Content-Length": str(len(body))})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(data)["model"]["id"], "paxmod-guard")
            download.assert_called_once()

    def test_cors_configuration_is_exact_and_rejects_wildcards(self):
        with mock.patch.dict(
            os.environ,
            {"KERNEL_POLICE_CORS_ORIGINS": "https://kernel.example,*,https://bad.example/path"},
        ):
            self.assertEqual(server._allowed_origins(), {"https://kernel.example"})
            self.assertEqual(server._cors_origin_value("https://kernel.example"), "https://kernel.example")
            self.assertIsNone(server._cors_origin_value(OK_ORIGIN))
            self.assertIsNone(server._cors_origin_value("*"))

    def test_default_cors_allowlist_contains_only_valid_origins(self):
        with mock.patch.dict(os.environ, {"KERNEL_POLICE_CORS_ORIGINS": ""}, clear=False):
            self.assertTrue(server._allowed_origins())
            self.assertIn(OK_ORIGIN, server._allowed_origins())
            self.assertNotIn("*", server._allowed_origins())
            self.assertTrue(all(server._is_valid_origin(origin) for origin in server._allowed_origins()))


    def test_local_api_load_analyze_unload_round_trip(self):
        headers = {"Origin": OK_ORIGIN, "Content-Type": "application/json"}
        with (
            mock.patch.object(eng_mod.ENGINE, "load", return_value={"id": "horizon", "loaded": True}) as load,
            mock.patch.object(eng_mod.ENGINE, "analyze", return_value={"model_id": "horizon", "state": "ok"}) as analyze,
            mock.patch.object(eng_mod.ENGINE, "unload", return_value={"id": "horizon", "loaded": False}) as unload,
        ):
            for path, payload in (
                ("/load", {"detector": "horizon", "prefer_cpu": True}),
                ("/analyze", {"detector": "horizon", "text": "texto de prueba"}),
                ("/unload", {"detector": "horizon"}),
            ):
                body = json.dumps(payload).encode()
                status, raw = self._post(path, body, {**headers, "Content-Length": str(len(body))})
                self.assertEqual(status, 200, path)
                self.assertTrue(json.loads(raw)["ok"], path)
            load.assert_called_once_with("horizon", prefer_cpu=True)
            analyze.assert_called_once_with("horizon", text="texto de prueba", query=None, corpus=None)
            unload.assert_called_once_with("horizon")

    def test_status_version_matches_version_file(self):
        self.assertEqual(eng_mod.ENGINE.status()["version"], "0.2.5")

    def test_bundled_checkpoint_hash_verified(self):
        from detectors.grooming_xlm import GroomingDetector

        self.assertIsNotNone(GroomingDetector()._sklearn_path())


if __name__ == "__main__":
    unittest.main()
