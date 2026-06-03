#!/usr/bin/env python3
"""Install CTranslate2 local en->zh model (no PyTorch / no Argos)."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models" / "argos"
BUNDLED_MODEL = MODELS_DIR / "translate-en_zh-1_9.argosmodel"
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"

DEFAULT_MODEL_URLS = [
    "https://argos-net.com/v1/translate-en_zh-1_9.argosmodel",
]


def log(msg: str) -> None:
    print(msg, flush=True)


def remove_broken_torch() -> None:
    """Broken torch DLLs block ctranslate2 4.x on some Windows installs."""
    log("[install] removing torch (not needed; broken c10.dll breaks local engine)...")
    subprocess.run(
        [sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"],
        cwd=ROOT,
    )


def pip_install() -> None:
    remove_broken_torch()
    for pkg in ("ctranslate2==3.24.0", "sentencepiece>=0.1.99"):
        log(f"[install] pip install {pkg}")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg, "--no-cache-dir"],
            cwd=ROOT,
            check=True,
        )


def fetch_extra_urls() -> list[str]:
    urls: list[str] = []
    try:
        req = urllib.request.Request(INDEX_URL, headers={"User-Agent": "fanyi-student-web/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            index = json.loads(resp.read().decode("utf-8"))
        for pkg in index:
            if pkg.get("code") == "translate-en_zh":
                urls.extend(str(u) for u in (pkg.get("links") or []) if u)
                break
    except Exception as e:
        log(f"[install] index failed: {e}")
    for u in DEFAULT_MODEL_URLS:
        if u not in urls:
            urls.append(u)
    return urls


def download_direct(url: str, dest: Path, attempt: int) -> None:
    import shutil

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(f".part{attempt}")
    log(f"[install] download try {attempt}: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "fanyi-student-web/1.0"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        chunk_size = 128 * 1024
        with tmp.open("wb") as out:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if total > 0 and done % (chunk_size * 40) < chunk_size:
                    log(f"          {done * 100 // total}% ({done // (1024 * 1024)} MB)")
    if total > 0 and done < total * 0.98:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Incomplete ({done}/{total})")
    shutil.move(str(tmp), str(dest))


def download_via_argos_index() -> None:
    """Optional: use argostranslate only to download file, if already installed."""
    try:
        import argostranslate.package as pkg
    except ImportError:
        raise RuntimeError("argostranslate not installed for index download")

    pkg.update_package_index()
    packages = pkg.get_available_packages()
    target = next((p for p in packages if p.from_code == "en" and p.to_code == "zh"), None)
    if target is None:
        raise RuntimeError("no en->zh in argos index")
    log("[install] downloading via Argos index...")
    path = Path(target.download())
    if path.resolve() != BUNDLED_MODEL.resolve():
        import shutil

        shutil.copy2(path, BUNDLED_MODEL)


def acquire_model() -> None:
    if BUNDLED_MODEL.is_file() and BUNDLED_MODEL.stat().st_size > 50_000_000:
        log(f"[install] cached: {BUNDLED_MODEL.name}")
        return

    errors: list[str] = []
    try:
        download_via_argos_index()
        if BUNDLED_MODEL.is_file():
            return
    except Exception as e:
        errors.append(str(e))

    for url in fetch_extra_urls():
        for attempt in range(1, 4):
            try:
                download_direct(url, BUNDLED_MODEL, attempt)
                return
            except Exception as e:
                errors.append(str(e))
                log(f"[install] retry in 3s: {e}")
                time.sleep(3)

    raise RuntimeError("Download failed. " + "; ".join(errors[-2:]))


def main() -> int:
    log("=" * 50)
    log("  CTranslate2 local pack (MIT, no PyTorch)")
    log("  Model: translate-en_zh")
    log("=" * 50)

    try:
        pip_install()
        acquire_model()

        sys.path.insert(0, str(ROOT / "scripts"))
        from ct2_engine import verify

        out = verify()
        log(f'[install] OK: "Hello world" -> "{out}"')
    except subprocess.CalledProcessError as e:
        log(f"[install] pip failed: {e}")
        return 1
    except Exception as e:
        log(f"[install] FAILED: {e}")
        log("  Try Docker: scripts\\translate-up-docker.bat")
        return 1

    log("[install] Ready. Run launch bat and select LOCAL mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
