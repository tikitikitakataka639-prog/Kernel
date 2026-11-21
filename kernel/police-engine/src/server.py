"""Servidor HTTP local del KERNEL POLICE ENGINE (proceso independiente).

Escucha solo en 127.0.0.1 por defecto. No expone el servicio a la red.
CORS: allowlist explícita (nunca *). Configurable con KERNEL_POLICE_CORS_ORIGINS.

Importante: Origin se valida AL INICIO de do_POST, antes de leer el cuerpo
y antes de invocar ENGINE.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import ENGINE

VERSION = (Path(__file__).resolve().parents[1] / "VERSION").read_text(encoding="utf-8").strip()

HOST = "127.0.0.1"  # fijo: nunca se expone a la red
PORT = int(os.environ.get("KERNEL_POLICE_PORT", "8787"))

_DEFAULT_ORIGINS = [
    "https://project-kernel-release-1-0-0.lovable.app",
    "https://kernel-merged-grooming-023.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]


def _is_valid_origin(origin: str) -> bool:
    if not origin or origin == "*":
        return False
    try:
        parsed = urlparse(origin)
        return (
            parsed.scheme in ("http", "https")
            and bool(parsed.netloc)
            and parsed.hostname is not None
            and parsed.username is None
            and parsed.password is None
            and parsed.path == ""
            and not parsed.params
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False


def _allowed_origins() -> set[str]:
    raw = os.environ.get("KERNEL_POLICE_CORS_ORIGINS", "").strip()
    if raw:
        # Una configuración explícita sustituye la lista por defecto.
        # Entradas inválidas y comodines se descartan: nunca se abre CORS a *.
        return {origin.strip() for origin in raw.split(",") if _is_valid_origin(origin.strip())}
    return {origin for origin in _DEFAULT_ORIGINS if _is_valid_origin(origin)}


def _cors_origin_value(origin_header: str | None) -> str | None:
    if not origin_header:
        return None
    if origin_header in _allowed_origins():
        return origin_header
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "KernelPolice/" + VERSION

    def _apply_cors(self, allow_origin: str | None) -> None:
        self.send_header("Vary", "Origin")
        if allow_origin:
            self.send_header("Access-Control-Allow-Origin", allow_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization",
            )
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _reject_origin(self) -> None:
        body = json.dumps(
            {"ok": False, "error": "origin_not_allowed"},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(403)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _reject_content_type(self) -> None:
        body = json.dumps(
            {"ok": False, "error": "unsupported_media_type"},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(415)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        origin = _cors_origin_value(self.headers.get("Origin"))
        self._apply_cors(origin)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict) -> None:
        origin = _cors_origin_value(self.headers.get("Origin"))
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._apply_cors(origin)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("police-engine: " + (fmt % args) + "\n")

    def do_OPTIONS(self) -> None:
        req_origin = self.headers.get("Origin")
        origin = _cors_origin_value(req_origin)
        if req_origin and origin is None:
            self.send_response(403)
            self.send_header("Vary", "Origin")
            self.end_headers()
            return
        self.send_response(204)
        self._apply_cors(origin)
        self.end_headers()

    def do_GET(self) -> None:
        req_origin = self.headers.get("Origin")
        if req_origin and _cors_origin_value(req_origin) is None:
            self._reject_origin()
            return
        path = urlparse(self.path).path
        if path in ("/", "/health"):
            self._json(200, {"ok": True, "service": "KERNEL POLICE ENGINE", "port": PORT, "version": VERSION})
            return
        if path == "/status":
            self._json(200, ENGINE.status())
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        # 1) Origin obligatorio y permitido ANTES de leer el cuerpo y de ENGINE
        if _cors_origin_value(self.headers.get("Origin")) is None:
            self._reject_origin()
            return
        parsed = urlparse(self.path)
        path = parsed.path
        if parsed.query or path not in ("/download", "/load", "/unload", "/analyze"):
            self._json(404, {"ok": False, "error": "not_found"})
            return

        # 2) Content-Type esperado: application/json (charset opcional)
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self._reject_content_type()
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._json(411, {"ok": False, "error": "invalid_content_length"})
            return
        if length < 0:
            self._json(400, {"ok": False, "error": "invalid_content_length"})
            return
        if length > 2_000_000:
            self._json(413, {"ok": False, "error": "payload_too_large"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": "invalid_json"})
            return
        if not isinstance(data, dict):
            self._json(400, {"ok": False, "error": "invalid_body"})
            return
        det = data.get("detector")
        if det is not None and (not isinstance(det, str) or len(det) > 128):
            self._json(400, {"ok": False, "error": "invalid_detector"})
            return
        if path in ("/download", "/load", "/analyze") and not det:
            self._json(400, {"ok": False, "error": "missing_detector"})
            return
        if path == "/load" and "prefer_cpu" in data and not isinstance(data["prefer_cpu"], bool):
            self._json(400, {"ok": False, "error": "invalid_prefer_cpu"})
            return
        if path == "/analyze":
            text_value = data.get("text", "")
            if not isinstance(text_value, str) or len(text_value) > 200_000:
                self._json(400, {"ok": False, "error": "invalid_text"})
                return
            query = data.get("query")
            if query is not None and (not isinstance(query, str) or len(query) > 20_000):
                self._json(400, {"ok": False, "error": "invalid_query"})
                return
            corpus = data.get("corpus")
            if corpus is not None and (
                not isinstance(corpus, list)
                or len(corpus) > 200
                or not all(isinstance(c, str) and len(c) <= 20_000 for c in corpus)
                or sum(len(c) for c in corpus) > 500_000
            ):
                self._json(400, {"ok": False, "error": "invalid_corpus"})
                return

        try:
            if path == "/download":
                det = data.get("detector")
                if not det:
                    self._json(400, {"ok": False, "error": "missing_detector"})
                    return
                self._json(200, {"ok": True, "model": ENGINE.download(det)})
                return
            if path == "/load":
                det = data.get("detector")
                prefer_cpu = bool(data.get("prefer_cpu", True))
                self._json(200, {"ok": True, "model": ENGINE.load(det, prefer_cpu=prefer_cpu)})
                return
            if path == "/unload":
                det = data.get("detector")
                self._json(200, {"ok": True, "model": ENGINE.unload(det)})
                return
            if path == "/analyze":
                det = data.get("detector")
                text = data.get("text", "")
                query = data.get("query")
                corpus = data.get("corpus")
                result = ENGINE.analyze(det, text=text, query=query, corpus=corpus)
                self._json(200, {"ok": result.get("state") == "ok", "result": result})
                return
            self._json(404, {"ok": False, "error": "not_found"})
        except KeyError as e:
            self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:
            sys.stderr.write(f"police-engine: error interno: {e!r}\n")
            self._json(500, {"ok": False, "error": "internal_error"})


def main() -> None:
    if os.environ.get("KERNEL_POLICE_HOST", "127.0.0.1") != "127.0.0.1":
        raise SystemExit("KERNEL_POLICE_HOST solo admite 127.0.0.1")
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"KERNEL POLICE ENGINE listening on http://{HOST}:{PORT}", flush=True)
    print(f"CORS allowlist: {sorted(_allowed_origins())}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("shutting down", flush=True)


if __name__ == "__main__":
    main()
