#!/usr/bin/env python3
"""
Translation HTTP server (LibreTranslate-compatible API).
Tries local Argos first; falls back to MyMemory online API if pair unavailable.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 5000

ENGINE_NAME = "unknown"
_argos_fn = None

SUPPORTED_LANGS = {
    "en": "English",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "ru": "Russian",
    "pt": "Portuguese",
    "it": "Italian",
}


def _normalize_lang(code: str) -> str:
    c = str(code or "en").lower().strip()
    if c in ("zt", "zh-cn", "zh_cn", "zh-hans"):
        return "zh"
    return c


def _mymemory_lang(code: str) -> str:
    return "zh-CN" if _normalize_lang(code) == "zh" else _normalize_lang(code)


MYMEMORY_MAX_CHARS = 450


def _split_text(text: str, max_len: int = MYMEMORY_MAX_CHARS) -> list[str]:
    """Split long text into chunks under MyMemory's 500-char limit."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_len:
        return [text]

    chunks: list[str] = []
    rest = text
    while rest:
        if len(rest) <= max_len:
            chunks.append(rest)
            break

        window = rest[:max_len]
        break_at = -1
        for sep in ("\n\n", "\n", ". ", "。", "! ", "? ", "; ", "，", ", ", " "):
            pos = window.rfind(sep)
            if pos > break_at:
                break_at = pos
                break_sep = sep

        if break_at >= max_len // 5:
            cut = break_at + len(break_sep)
        else:
            cut = max_len

        piece = rest[:cut].strip()
        if piece:
            chunks.append(piece)
        rest = rest[cut:].strip()

    return chunks


def _mymemory_request(text: str, source: str, target: str) -> str:
    src = _mymemory_lang(source)
    tgt = _mymemory_lang(target)
    pair = f"{src}|{tgt}"
    q = urllib.parse.quote(text)
    url = f"https://api.mymemory.translated.net/get?q={q}&langpair={pair}"
    req = urllib.request.Request(url, headers={"User-Agent": "fanyi-student-web/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("responseStatus") != 200:
        detail = data.get("responseDetails") or "translation failed"
        raise RuntimeError(str(detail))
    return str(data.get("responseData", {}).get("translatedText", ""))


def _mymemory_translate(text: str, source: str = "en", target: str = "zh") -> str:
    if not text.strip():
        return ""
    parts = _split_text(text)
    if len(parts) == 1:
        return _mymemory_request(parts[0], source, target)
    translated = [_mymemory_request(part, source, target) for part in parts]
    return " ".join(t for t in translated if t)


def _try_argos():
    import argostranslate.package as pkg
    import argostranslate.translate as tr

    for p in pkg.get_installed_packages():
        if p.from_code == "en" and p.to_code in ("zh", "zt"):
            print("[engine] Local package en->zh found", flush=True)
            return lambda t, s="en", tg="zh": tr.translate(t, _normalize_lang(s), _normalize_lang(tg))

    print("[engine] Updating Argos package index...", flush=True)
    pkg.update_package_index()
    available = pkg.get_available_packages()
    target = next((p for p in available if p.from_code == "en" and p.to_code == "zh"), None)
    if target is None:
        target = next(
            (p for p in available if p.from_code == "en" and p.to_code.startswith("zh")),
            None,
        )
    if target is None:
        raise RuntimeError("en->zh language package not found")

    print(f"[engine] Downloading {target.from_code}->{target.to_code}...", flush=True)
    pkg.install_from_path(target.download())
    print("[engine] Language package installed", flush=True)
    return lambda t, s="en", tg="zh": tr.translate(t, _normalize_lang(s), _normalize_lang(tg))


def _argos_has_pair(source: str, target: str) -> bool:
    if _argos_fn is None:
        return False
    try:
        import argostranslate.package as pkg

        src, tgt = _normalize_lang(source), _normalize_lang(target)
        for p in pkg.get_installed_packages():
            if p.from_code != src:
                continue
            if p.to_code == tgt or (tgt == "zh" and p.to_code in ("zh", "zt")):
                return True
    except Exception:
        pass
    return False


def translate_text(text: str, source: str = "en", target: str = "zh") -> str:
    source, target = _normalize_lang(source), _normalize_lang(target)
    if _argos_fn is not None and _argos_has_pair(source, target):
        try:
            return _argos_fn(text, source, target)
        except Exception:
            pass
    return _mymemory_translate(text, source, target)


def init_engine():
    global ENGINE_NAME, _argos_fn

    print("[engine] Trying local Argos Translate...", flush=True)
    try:
        _argos_fn = _try_argos()
        ENGINE_NAME = "argostranslate-local"
        print("[engine] Local engine OK (offline for installed pairs)", flush=True)
        return
    except Exception as e:
        print(f"[engine] Local engine unavailable: {e}", flush=True)

    print("[engine] Switching to online fallback (MyMemory, needs internet)", flush=True)
    _argos_fn = None
    ENGINE_NAME = "mymemory-online"
    print("[engine] Online fallback ready", flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[HTTP] {self.address_string()} {fmt % args}", flush=True)

    def _json(self, code: int, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/languages"):
            langs = [{"code": k, "name": v} for k, v in SUPPORTED_LANGS.items()]
            self._json(200, langs)
            return
        if self.path in ("/", "/health"):
            self._json(200, {"status": "ok", "engine": ENGINE_NAME})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/translate"):
            self._json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return

        source = _normalize_lang(data.get("source", "en"))
        target = _normalize_lang(data.get("target", "zh"))
        q = data.get("q", "")

        if source not in SUPPORTED_LANGS or target not in SUPPORTED_LANGS:
            self._json(400, {"error": f"unsupported language pair: {source} -> {target}"})
            return
        if source == target:
            self._json(400, {"error": "source and target must differ"})
            return

        try:
            if isinstance(q, list):
                out = [translate_text(str(item), source, target) for item in q]
                self._json(200, {"translatedText": out})
            else:
                text = translate_text(str(q), source, target)
                self._json(200, {"translatedText": text})
        except urllib.error.URLError as e:
            self._json(502, {"error": f"network error: {e.reason}"})
        except Exception as e:
            self._json(500, {"error": str(e)})


def main():
    print("=" * 50, flush=True)
    print("  Literature Reader - Translation Engine", flush=True)
    print(f"  Python {sys.version.split()[0]}", flush=True)
    print("=" * 50, flush=True)

    init_engine()

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"\n[READY] http://{HOST}:{PORT}", flush=True)
    print(f"[READY] Engine: {ENGINE_NAME}", flush=True)
    print(f"[READY] Languages: {', '.join(SUPPORTED_LANGS.keys())}", flush=True)
    print("[READY] Keep this window open. Refresh web page (F5).\n", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
