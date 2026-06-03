#!/usr/bin/env python3
"""Lightweight local en->zh translation via CTranslate2 (no PyTorch)."""
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models" / "argos"
BUNDLED_MODEL = MODELS_DIR / "translate-en_zh-1_9.argosmodel"
EXTRACT_DIR = MODELS_DIR / "en-zh"
MARKER = EXTRACT_DIR / ".ready"

_ct2_translator = None
_tokenizer = None
_target_prefix = ""


def _find_package_root(base: Path) -> Path | None:
    if (base / "model" / "model.bin").is_file():
        return base
    if (base / "model.bin").is_file():
        return base.parent if base.name == "model" else base
    for model_bin in base.rglob("model.bin"):
        if "model" in model_bin.parts:
            return model_bin.parent.parent
    return None


def _extract_argosmodel(argosmodel: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(argosmodel, "r") as zf:
        zf.extractall(dest)
    root = _find_package_root(dest)
    if root is None:
        raise RuntimeError(f"Invalid argosmodel layout: {argosmodel.name}")
    MARKER.write_text(str(root.resolve()), encoding="utf-8")
    return root


def ensure_model_extracted() -> Path:
    if MARKER.is_file():
        root = Path(MARKER.read_text(encoding="utf-8").strip())
        if (root / "model" / "model.bin").is_file() or (root / "model.bin").is_file():
            return root
        found = _find_package_root(root)
        if found and (found / "model" / "model.bin").is_file():
            return found

    if BUNDLED_MODEL.is_file() and BUNDLED_MODEL.stat().st_size > 50_000_000:
        print(f"[ct2] Extracting {BUNDLED_MODEL.name}...", flush=True)
        if EXTRACT_DIR.exists():
            shutil.rmtree(EXTRACT_DIR, ignore_errors=True)
        return _extract_argosmodel(BUNDLED_MODEL, EXTRACT_DIR)

    argos_home = Path.home() / ".local" / "share" / "argos-translate" / "packages"
    if argos_home.is_dir():
        for pkg_dir in argos_home.iterdir():
            if not pkg_dir.is_dir():
                continue
            meta = pkg_dir / "metadata.json"
            if not meta.is_file():
                continue
            try:
                data = json.loads(meta.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if data.get("from_code") == "en" and data.get("to_code") in ("zh", "zt"):
                root = _find_package_root(pkg_dir)
                if root:
                    return root

    raise RuntimeError(
        "Local model missing. Run: py -3.12 scripts/install_local_translate.py"
    )


def _load_spm(model_path: Path):
    import sentencepiece as spm

    sp = spm.SentencePieceProcessor()
    sp.LoadFromSerializedProto(model_path.read_bytes())
    return sp


class _SpmTokenizer:
    def __init__(self, model_path: Path):
        self._sp = _load_spm(model_path)

    def encode(self, text: str) -> list[str]:
        return self._sp.encode(text, out_type=str)

    def decode(self, tokens: list[str]) -> str:
        return "".join(tokens).replace("▁", " ")


def _load_tokenizer(root: Path):
    spm_path = root / "sentencepiece.model"
    if spm_path.is_file():
        return _SpmTokenizer(spm_path)

    source = next(root.rglob("source.spm"), None)
    target = next(root.rglob("target.spm"), None)
    if source is None or target is None:
        raise RuntimeError("Missing sentencepiece.model or source.spm/target.spm")

    class _DualSpm:
        def __init__(self):
            self._src = _load_spm(source)
            self._tgt = _load_spm(target)

        def encode(self, text: str) -> list[str]:
            return self._src.encode(text, out_type=str)

        def decode(self, tokens: list[str]) -> str:
            return self._tgt.decode(tokens)

    return _DualSpm()


def _read_target_prefix(root: Path) -> str:
    meta = root / "metadata.json"
    if not meta.is_file():
        return ""
    try:
        return str(json.loads(meta.read_text(encoding="utf-8")).get("target_prefix", "") or "")
    except json.JSONDecodeError:
        return ""


def init_ct2() -> None:
    global _ct2_translator, _tokenizer, _target_prefix
    if _ct2_translator is not None:
        return

    import ctranslate2

    root = ensure_model_extracted()
    model_dir = root / "model" if (root / "model" / "model.bin").is_file() else root

    _ct2_translator = ctranslate2.Translator(str(model_dir), device="cpu")
    _tokenizer = _load_tokenizer(root)
    _target_prefix = _read_target_prefix(root)
    print("[ct2] Local en->zh engine ready (CTranslate2, no PyTorch)", flush=True)


def translate_en_zh(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    init_ct2()
    tokens = _tokenizer.encode(text)
    if not tokens:
        return ""

    target_prefix = None
    if _target_prefix:
        target_prefix = [[_target_prefix]]

    result = _ct2_translator.translate_batch(
        [tokens],
        target_prefix=target_prefix,
        replace_unknowns=True,
        beam_size=4,
    )[0]
    hyp = result.hypotheses[0] if result.hypotheses else []
    if not hyp:
        return ""

    value = _tokenizer.decode(hyp)
    if _target_prefix and value.startswith(_target_prefix):
        value = value[len(_target_prefix) :]
    if value.startswith(" "):
        value = value[1:]
    return value.strip()


def is_available() -> bool:
    try:
        init_ct2()
        return True
    except Exception:
        return False


def verify() -> str:
    init_ct2()
    out = translate_en_zh("Hello world")
    if not out:
        raise RuntimeError("Empty translation")
    return out
