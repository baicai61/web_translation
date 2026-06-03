#!/usr/bin/env python3
"""Install CTranslate2 local en<->zh models (no PyTorch / no Argos)."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models" / "argos"
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"

LOCAL_MODELS: tuple[tuple[str, str, str], ...] = (
    ("en", "zh", "translate-en_zh-1_9.argosmodel"),
    ("zh", "en", "translate-zh_en-1_9.argosmodel"),
)

DEFAULT_MODEL_URLS: dict[str, list[str]] = {
    "translate-en_zh": ["https://argos-net.com/v1/translate-en_zh-1_9.argosmodel"],
    "translate-zh_en": ["https://argos-net.com/v1/translate-zh_en-1_9.argosmodel"],
}


def log(msg: str) -> None:
    print(msg, flush=True)


def cleanup_extra_models() -> None:
    """Remove local model files other than en<->zh."""
    import shutil

    keep_files = {".gitkeep", *(name for _, _, name in LOCAL_MODELS)}
    keep_dirs = {"en-zh", "zh-en"}
    if not MODELS_DIR.is_dir():
        return
    for item in MODELS_DIR.iterdir():
        if item.is_dir() and item.name not in keep_dirs:
            log(f"[install] removing extra model dir: {item.name}")
            shutil.rmtree(item, ignore_errors=True)
        elif item.is_file() and item.name not in keep_files:
            if item.suffix in (".argosmodel", ".part") or ".part" in item.name:
                log(f"[install] removing extra model file: {item.name}")
                item.unlink(missing_ok=True)


def remove_broken_torch() -> None:
    """Broken torch DLLs block ctranslate2 4.x on some Windows installs."""
    try:
        import torch  # noqa: F401
    except ImportError:
        return
    log("[install] removing torch (not needed; broken c10.dll breaks local engine)...")
    subprocess.run(
        [sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"],
        cwd=ROOT,
    )


def deps_ready() -> bool:
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401

        return True
    except ImportError:
        return False


def pip_install() -> None:
    if deps_ready():
        log("[install] Python deps OK, skip pip")
        return
    remove_broken_torch()
    for pkg in ("ctranslate2==3.24.0", "sentencepiece>=0.1.99"):
        log(f"[install] pip install {pkg}")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg],
            cwd=ROOT,
            check=True,
        )


def fetch_index_urls(code: str) -> list[str]:
    urls: list[str] = []
    try:
        req = urllib.request.Request(INDEX_URL, headers={"User-Agent": "fanyi-student-web/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            index = json.loads(resp.read().decode("utf-8"))
        for pkg in index:
            if pkg.get("code") == code:
                urls.extend(str(u) for u in (pkg.get("links") or []) if u)
                break
    except Exception as e:
        log(f"[install] index failed for {code}: {e}")
    for u in DEFAULT_MODEL_URLS.get(code, []):
        if u not in urls:
            urls.append(u)
    return urls


def download_direct(url: str, dest: Path, attempt: int) -> None:
    import shutil

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(f".part{attempt}")
    log(f"[install] downloading {dest.name} (try {attempt})...")
    log(f"          from {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "fanyi-student-web/1.0"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        chunk_size = 512 * 1024
        last_pct = -1
        with tmp.open("wb") as out:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if total > 0:
                    pct = done * 100 // total
                    if pct >= last_pct + 5 or pct == 100:
                        last_pct = pct
                        log(f"          {pct}% ({done // (1024 * 1024)} / {total // (1024 * 1024)} MB)")
    if total > 0 and done < total * 0.98:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Incomplete ({done}/{total})")
    shutil.move(str(tmp), str(dest))
    log(f"[install] saved {dest.name}")


def download_via_argos_index(from_code: str, to_code: str, dest: Path) -> None:
    try:
        import argostranslate.package as pkg
    except ImportError:
        raise RuntimeError("argostranslate not installed for index download")

    pkg.update_package_index()
    packages = pkg.get_available_packages()
    target = next((p for p in packages if p.from_code == from_code and p.to_code == to_code), None)
    if target is None:
        raise RuntimeError(f"no {from_code}->{to_code} in argos index")
    log(f"[install] downloading {from_code}->{to_code} via Argos index...")
    path = Path(target.download())
    if path.resolve() != dest.resolve():
        import shutil

        shutil.copy2(path, dest)


def _extract_dir_name(from_code: str, to_code: str) -> str:
    return f"{from_code}-{to_code}"


def model_ready(from_code: str, to_code: str, filename: str) -> bool:
    dest = MODELS_DIR / filename
    marker = MODELS_DIR / _extract_dir_name(from_code, to_code) / ".ready"
    if marker.is_file():
        return True
    return dest.is_file() and dest.stat().st_size > 50_000_000


def acquire_model(from_code: str, to_code: str, filename: str) -> None:
    dest = MODELS_DIR / filename
    code = f"translate-{from_code}_{to_code}"

    if model_ready(from_code, to_code, filename):
        log(f"[install] cached: {from_code}->{to_code}")
        return

    log(f"[install] need download: {from_code}->{to_code} (~70MB, overseas server may be slow)")

    errors: list[str] = []
    tried: set[str] = set()

    def try_urls(urls: list[str]) -> bool:
        for url in urls:
            if url in tried:
                continue
            tried.add(url)
            for attempt in range(1, 4):
                try:
                    download_direct(url, dest, attempt)
                    return True
                except Exception as e:
                    errors.append(str(e))
                    log(f"[install] retry in 3s: {e}")
                    time.sleep(3)
        return False

    if try_urls(DEFAULT_MODEL_URLS.get(code, [])):
        return

    extra = [u for u in fetch_index_urls(code) if u not in tried]
    if try_urls(extra):
        return

    try:
        download_via_argos_index(from_code, to_code, dest)
        if dest.is_file():
            return
    except Exception as e:
        errors.append(str(e))

    raise RuntimeError(f"Download failed for {from_code}->{to_code}. " + "; ".join(errors[-2:]))


def acquire_all_models() -> bool:
    """Return True if anything was downloaded."""
    downloaded = False
    for from_code, to_code, filename in LOCAL_MODELS:
        if model_ready(from_code, to_code, filename):
            log(f"[install] cached: {from_code}->{to_code}")
            continue
        log(f"[install] acquiring {from_code}->{to_code}...")
        acquire_model(from_code, to_code, filename)
        downloaded = True
    return downloaded


def main() -> int:
    log("=" * 50)
    log("  CTranslate2 local pack (MIT, no PyTorch)")
    log("  Models: en->zh, zh->en")
    log("=" * 50)

    try:
        pip_install()
        cleanup_extra_models()
        downloaded = acquire_all_models()

        sys.path.insert(0, str(ROOT / "scripts"))
        from ct2_engine import verify

        if downloaded:
            out = verify()
            log(f"[install] OK: {out}")
        else:
            log("[install] quick check OK (models + deps already present)")
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
