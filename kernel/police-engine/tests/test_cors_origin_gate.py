"""CORS: origen malicioso no debe ejecutar ENGINE.*"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import unittest
from http.client import HTTPConnection
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from server import Handler, PORT  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402


class CorsOriginGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.15)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def _conn(self):
        return HTTPConnection("127.0.0.1", self.port, timeout=5)

    def test_malicious_origin_text_plain_no_engine(self):
        import engine as eng_mod

        calls = []

        def track(name):
            orig = getattr(eng_mod.ENGINE, name)

            def wrapped(*a, **k):
                calls.append(name)
                return orig(*a, **k)

            return wrapped

        with mock.patch.object(eng_mod.ENGINE, "load", side_effect=track("load")), mock.patch.object(
            eng_mod.ENGINE, "download", side_effect=track("download")
        ), mock.patch.object(eng_mod.ENGINE, "unload", side_effect=track("unload")), mock.patch.object(
            eng_mod.ENGINE, "analyze", side_effect=track("analyze")
        ):
            for path in ("/load", "/download", "/unload", "/analyze"):
                c = self._conn()
                body = json.dumps({"detector": "grooming-xlm-roberta-es-en", "text": "x"}).encode()
                c.request(
                    "POST",
                    path,
                    body=body,
                    headers={
                        "Origin": "https://evil.example",
                        "Content-Type": "text/plain",
                        "Content-Length": str(len(body)),
                    },
                )
                resp = c.getresponse()
                data = resp.read()
                self.assertEqual(resp.status, 403, msg=f"{path} -> {resp.status} {data}")
                c.close()
        self.assertEqual(calls, [], msg=f"ENGINE was invoked: {calls}")

    def test_malicious_origin_json_no_engine(self):
        import engine as eng_mod

        calls = []

        def track(name):
            orig = getattr(eng_mod.ENGINE, name)

            def wrapped(*a, **k):
                calls.append(name)
                return orig(*a, **k)

            return wrapped

        with mock.patch.object(eng_mod.ENGINE, "load", side_effect=track("load")), mock.patch.object(
            eng_mod.ENGINE, "analyze", side_effect=track("analyze")
        ):
            c = self._conn()
            body = b'{"detector":"grooming-xlm-roberta-es-en","prefer_cpu":true}'
            c.request(
                "POST",
                "/load",
                body=body,
                headers={
                    "Origin": "https://evil.example",
                    "Content-Type": "application/json",
                    "Content-Length": str(len(body)),
                },
            )
            resp = c.getresponse()
            data = resp.read()
            self.assertEqual(resp.status, 403)
            self.assertIn(b"origin_not_allowed", data)
            c.close()
        self.assertEqual(calls, [])

    def test_allowed_current_vercel_origin_options(self):
        origin = "https://kernel-merged-grooming-023.vercel.app"
        c = self._conn()
        c.request(
            "OPTIONS",
            "/analyze",
            headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
        )
        resp = c.getresponse()
        resp.read()
        self.assertEqual(resp.status, 204)
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), origin)
        c.close()

    def test_allowed_origin_options(self):
        c = self._conn()
        c.request(
            "OPTIONS",
            "/analyze",
            headers={
                "Origin": "https://project-kernel-release-1-0-0.lovable.app",
                "Access-Control-Request-Method": "POST",
            },
        )
        resp = c.getresponse()
        resp.read()
        self.assertEqual(resp.status, 204)
        self.assertEqual(
            resp.getheader("Access-Control-Allow-Origin"),
            "https://project-kernel-release-1-0-0.lovable.app",
        )
        c.close()


if __name__ == "__main__":
    unittest.main()
