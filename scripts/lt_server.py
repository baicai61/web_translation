#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Translation HTTP server (LibreTranslate-compatible API).
Local: CTranslate2 (no PyTorch). Online fallback: MyMemory.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import ct2_engine

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
PORT = 5000

ENGINE_NAME = "unknown"
ENGINE_MODE = "auto"  # auto | local | online
_local_fn = None
_local_available = False
_local_pairs: set[tuple[str, str]] = set()
MYMEMORY_EMAIL = ""


def _load_mymemory_email() -> str:
    """MyMemory `de=` raises anonymous ~10k/day to ~100k chars/day."""
    env = (os.environ.get("MYMEMORY_EMAIL") or "").strip()
    if env and "@" in env:
        return env

    for path in (ROOT / "server" / ".mymemory-email", ROOT / ".mymemory-email"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "@" in line:
                return line
    return ""


MYMEMORY_EMAIL = _load_mymemory_email()

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
MYMEMORY_REQUEST_INTERVAL = 0.5
MYMEMORY_MAX_RETRIES = 3


def _friendly_error(exc: Exception) -> str:
    """将常见英文/网络错误转为中文提示。"""
    parts: list[str] = [str(exc)]
    if isinstance(exc, urllib.error.HTTPError):
        parts.append(str(exc.reason or ""))
        parts.append(str(exc.code))
    elif isinstance(exc, urllib.error.URLError):
        reason = exc.reason
        parts.append(str(reason) if reason is not None else "")

    lower = " ".join(parts).lower()
    msg = str(exc)
    if any("\u4e00" <= c <= "\u9fff" for c in msg):
        return msg

    if any(k in lower for k in ("too many requests", "429", "rate limit")):
        hint = (
            "可在 server\\.mymemory-email 写入邮箱以提高 MyMemory 额度（约 10 万字符/天）。"
            if not MYMEMORY_EMAIL
            else ""
        )
        return (
            "在线翻译请求过于频繁，或今日免费额度已用完。"
            "请改用「翻译当前字段」逐段翻译，或双击「启动翻译引擎.bat」启用本地离线引擎。"
            + (f" {hint}" if hint else "")
        )
    if any(k in lower for k in ("quota", "free translations", "used all available")):
        hint = (
            "在 server\\.mymemory-email 写入邮箱可提高到约 10 万字符/天，"
            if not MYMEMORY_EMAIL
            else ""
        )
        return (
            hint
            + "今日在线免费翻译额度已用尽，请明天再试，"
            "或双击「启动翻译引擎.bat」安装本地离线翻译（中英互译不受此限制）。"
        )
    if any(k in lower for k in ("timed out", "timeout")):
        return "连接翻译服务超时，请检查网络后重试。"
    if any(k in lower for k in ("connection refused", "actively refused", "拒绝连接")):
        return "无法连接翻译服务，请先双击「启动翻译引擎.bat」并等到出现 [READY]。"
    if "network error" in lower:
        return "网络异常，请检查网络连接后重试。"
    return f"翻译失败：{msg}"


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
    if MYMEMORY_EMAIL:
        url += f"&de={urllib.parse.quote(MYMEMORY_EMAIL)}"
    last_err: Exception | None = None

    for attempt in range(MYMEMORY_MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fanyi-student-web/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            status = data.get("responseStatus", 200)
            if status != 200:
                detail = str(data.get("responseDetails") or "翻译失败")
                err = RuntimeError(detail)
                detail_lower = detail.lower()
                if status == 429 or "quota" in detail_lower or "free translations" in detail_lower:
                    raise RuntimeError(_friendly_error(err))
                if attempt < MYMEMORY_MAX_RETRIES - 1:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise RuntimeError(_friendly_error(err))

            return str(data.get("responseData", {}).get("translatedText", ""))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429 and attempt < MYMEMORY_MAX_RETRIES - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(_friendly_error(e)) from e
        except urllib.error.URLError as e:
            last_err = e
            if attempt < MYMEMORY_MAX_RETRIES - 1:
                time.sleep(1.0 * (attempt + 1))
                continue
            raise RuntimeError(_friendly_error(e)) from e

    raise RuntimeError(_friendly_error(last_err or RuntimeError("翻译失败")))


def _mymemory_translate(text: str, source: str = "en", target: str = "zh") -> str:
    if not text.strip():
        return ""
    parts = _split_text(text)
    if len(parts) == 1:
        return _mymemory_request(parts[0], source, target)
    translated: list[str] = []
    for i, part in enumerate(parts):
        if i > 0:
            time.sleep(MYMEMORY_REQUEST_INTERVAL)
        translated.append(_mymemory_request(part, source, target))
    return " ".join(t for t in translated if t)


def _try_local_engine():
    ct2_engine.init_ct2()

    def translate_fn(text: str, source: str = "en", target: str = "zh") -> str:
        src, tgt = _normalize_lang(source), _normalize_lang(target)
        if not ct2_engine.model_present(src, tgt):
            supported = _format_local_pairs()
            raise RuntimeError(
                f"本地引擎暂不支持 {src} -> {tgt}。"
                f"当前已安装：{supported or '无'}；其他语言对请用在线/自动模式。"
            )
        return ct2_engine.translate(text, src, tgt)

    return translate_fn


def _format_local_pairs() -> str:
    pairs = sorted(ct2_engine.available_pairs())
    labels = []
    for src, tgt in pairs:
        labels.append(f"{src}→{tgt}")
    return "、".join(labels)


def _local_has_pair(source: str, target: str) -> bool:
    src, tgt = _normalize_lang(source), _normalize_lang(target)
    return (src, tgt) in _local_pairs or (
        _local_available and ct2_engine.model_present(src, tgt)
    )


def _local_mode_error(source: str, target: str) -> RuntimeError:
    if not _local_available:
        return RuntimeError(
            "本地引擎未就绪。请运行: py -3.12 scripts/install_local_translate.py"
            "（或重新双击 启动翻译引擎.bat），也可切换「在线」模式。"
        )
    src, tgt = _normalize_lang(source), _normalize_lang(target)
    if not _local_has_pair(src, tgt):
        supported = _format_local_pairs()
        return RuntimeError(
            f"本地模式暂不支持 {src}→{tgt}。"
            f"已安装：{supported or '无'}；请切换语言或改用「在线」/「自动」模式。"
        )
    return RuntimeError("本地引擎异常，请重启「启动翻译引擎.bat」。")


def _uses_online(source: str, target: str, mode: str | None = None) -> bool:
    effective = mode if mode in ("auto", "local", "online") else ENGINE_MODE
    if effective == "online":
        return True
    if effective == "local":
        return False
    return not (_local_available and _local_has_pair(source, target))


def translate_text(
    text: str,
    source: str = "en",
    target: str = "zh",
    mode: str | None = None,
) -> str:
    source, target = _normalize_lang(source), _normalize_lang(target)
    effective = mode if mode in ("auto", "local", "online") else ENGINE_MODE

    if effective == "online":
        return _mymemory_translate(text, source, target)

    if effective == "local":
        if _local_available and _local_has_pair(source, target):
            assert _local_fn is not None
            return _local_fn(text, source, target)
        raise _local_mode_error(source, target)

    if _local_available and _local_has_pair(source, target):
        try:
            assert _local_fn is not None
            return _local_fn(text, source, target)
        except Exception:
            pass
    return _mymemory_translate(text, source, target)


def _refresh_engine_name() -> None:
    global ENGINE_NAME
    if ENGINE_MODE == "online":
        ENGINE_NAME = "mymemory-online"
    elif ENGINE_MODE == "local":
        ENGINE_NAME = "ctranslate2-local" if _local_available else "ctranslate2-local-unavailable"
    else:
        ENGINE_NAME = "ctranslate2-local" if _local_available else "mymemory-online"


def _health_payload() -> dict:
    active = "mymemory-online" if _uses_online("en", "zh") else "ctranslate2-local"
    if ENGINE_MODE == "local" and not _local_available:
        active = "ctranslate2-local-unavailable"
    return {
        "status": "ok",
        "engine": active,
        "mode": ENGINE_MODE,
        "localAvailable": _local_available,
        "mymemoryEmailConfigured": bool(MYMEMORY_EMAIL),
    }


def set_engine_mode(mode: str) -> dict:
    global ENGINE_MODE, _local_fn, _local_available, _local_pairs
    if mode not in ("auto", "local", "online"):
        raise ValueError("无效模式，请使用 auto、local 或 online")

    if mode == "local" and not _local_available:
        try:
            _local_fn = _try_local_engine()
            _local_available = True
            _local_pairs.update(ct2_engine.available_pairs())
            print("[engine] Local CTranslate2 loaded on demand", flush=True)
        except Exception as e:
            raise RuntimeError(
                "本地引擎未就绪。请运行: py -3.12 scripts/install_local_translate.py"
                "（或重新双击 启动翻译引擎.bat），也可切换「在线」模式。"
            ) from e

    ENGINE_MODE = mode
    _refresh_engine_name()
    print(f"[engine] Mode switched to {ENGINE_MODE} (active: {ENGINE_NAME})", flush=True)
    return _health_payload()


def init_engine():
    global _local_fn, _local_available, _local_pairs

    print("[engine] Loading CTranslate2 local model (no PyTorch)...", flush=True)
    try:
        _local_fn = _try_local_engine()
        _local_available = True
        _local_pairs.update(ct2_engine.available_pairs())
        print(f"[engine] Local engine OK ({_format_local_pairs() or 'no pairs'})", flush=True)
    except Exception as e:
        _local_fn = None
        _local_available = False
        _local_pairs.clear()
        print(f"[engine] Local engine unavailable: {e}", flush=True)
        print("[engine] Run: py -3.12 scripts/install_local_translate.py", flush=True)
        print("[engine] Will use online fallback when mode is auto/online", flush=True)

    _refresh_engine_name()


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
        path = self.path.split("?", 1)[0]
        if path.startswith("/languages"):
            langs = [{"code": k, "name": v} for k, v in SUPPORTED_LANGS.items()]
            self._json(200, langs)
            return
        if path in ("/", "/health"):
            self._json(200, _health_payload())
            return
        self._json(404, {"error": "接口不存在"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]

        if path.startswith("/engine/mode"):
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self._json(400, {"error": "请求格式错误（JSON 无效）"})
                return
            mode = str(data.get("mode", "")).lower().strip()
            try:
                self._json(200, set_engine_mode(mode))
            except Exception as e:
                self._json(400, {"error": _friendly_error(e)})
            return

        if not path.startswith("/translate"):
            self._json(404, {"error": "接口不存在"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "请求格式错误（JSON 无效）"})
            return

        source = _normalize_lang(data.get("source", "en"))
        target = _normalize_lang(data.get("target", "zh"))
        q = data.get("q", "")
        req_mode = str(data.get("engineMode", "")).lower().strip()
        if req_mode not in ("auto", "local", "online"):
            req_mode = None

        if source not in SUPPORTED_LANGS or target not in SUPPORTED_LANGS:
            self._json(400, {"error": f"不支持的语言：{source} → {target}"})
            return
        if source == target:
            self._json(400, {"error": "源语言与目标语言不能相同"})
            return

        try:
            if isinstance(q, list):
                out: list[str] = []
                use_online = _uses_online(source, target, req_mode)
                for i, item in enumerate(q):
                    if i > 0 and use_online:
                        time.sleep(MYMEMORY_REQUEST_INTERVAL)
                    out.append(translate_text(str(item), source, target, mode=req_mode))
                self._json(200, {"translatedText": out})
            else:
                text = translate_text(str(q), source, target, mode=req_mode)
                self._json(200, {"translatedText": text})
        except Exception as e:
            self._json(502, {"error": _friendly_error(e)})


def main():
    print("=" * 50, flush=True)
    print("  Literature Reader - Translation Engine", flush=True)
    print(f"  Python {sys.version.split()[0]}", flush=True)
    print("=" * 50, flush=True)

    init_engine()

    if MYMEMORY_EMAIL:
        masked = re.sub(r"(^.).*(@.*$)", r"\1***\2", MYMEMORY_EMAIL)
        print(f"[mymemory] Email configured ({masked}) — quota ~100k chars/day", flush=True)
    else:
        print(
            "[mymemory] No email — anonymous quota ~10k chars/day. "
            "Create server\\.mymemory-email (see .mymemory-email.example)",
            flush=True,
        )

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
