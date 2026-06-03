#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lightweight local en<->zh translation via CTranslate2 (no PyTorch)."""
from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models" / "argos"

LOCAL_PAIRS: tuple[tuple[str, str, str, str], ...] = (
    ("en", "zh", "translate-en_zh-1_9.argosmodel", "en-zh"),
    ("zh", "en", "translate-zh_en-1_9.argosmodel", "zh-en"),
)


@dataclass
class _ModelSpec:
    from_code: str
    to_code: str
    bundled_name: str
    extract_name: str

    @property
    def pair(self) -> tuple[str, str]:
        return (self.from_code, self.to_code)

    @property
    def bundled(self) -> Path:
        return MODELS_DIR / self.bundled_name

    @property
    def extract_dir(self) -> Path:
        return MODELS_DIR / self.extract_name

    @property
    def marker(self) -> Path:
        return self.extract_dir / ".ready"


@dataclass
class _Engine:
    translator: object
    tokenizer: object
    target_prefix: str


_SPECS = [
    _ModelSpec(from_code, to_code, bundled_name, extract_name)
    for from_code, to_code, bundled_name, extract_name in LOCAL_PAIRS
]
_engines: dict[tuple[str, str], _Engine] = {}


def _find_package_root(base: Path) -> Path | None:
    if (base / "model" / "model.bin").is_file():
        return base
    if (base / "model.bin").is_file():
        return base.parent if base.name == "model" else base
    for model_bin in base.rglob("model.bin"):
        if "model" in model_bin.parts:
            return model_bin.parent.parent
    return None


def _extract_argosmodel(argosmodel: Path, dest: Path, marker: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(argosmodel, "r") as zf:
        zf.extractall(dest)
    root = _find_package_root(dest)
    if root is None:
        raise RuntimeError(f"Invalid argosmodel layout: {argosmodel.name}")
    marker.write_text(str(root.resolve()), encoding="utf-8")
    return root


def _find_in_argos_home(from_code: str, to_code: str) -> Path | None:
    argos_home = Path.home() / ".local" / "share" / "argos-translate" / "packages"
    if not argos_home.is_dir():
        return None
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
        fc = data.get("from_code")
        tc = data.get("to_code")
        if fc == from_code and tc in (to_code, "zt" if to_code == "zh" else to_code):
            root = _find_package_root(pkg_dir)
            if root:
                return root
    return None


def ensure_model_extracted(spec: _ModelSpec) -> Path:
    if spec.marker.is_file():
        root = Path(spec.marker.read_text(encoding="utf-8").strip())
        if (root / "model" / "model.bin").is_file() or (root / "model.bin").is_file():
            return root
        found = _find_package_root(root)
        if found and (found / "model" / "model.bin").is_file():
            return found

    if spec.bundled.is_file() and spec.bundled.stat().st_size > 50_000_000:
        print(f"[ct2] Extracting {spec.bundled.name}...", flush=True)
        if spec.extract_dir.exists():
            shutil.rmtree(spec.extract_dir, ignore_errors=True)
        return _extract_argosmodel(spec.bundled, spec.extract_dir, spec.marker)

    root = _find_in_argos_home(spec.from_code, spec.to_code)
    if root:
        return root

    raise RuntimeError(
        f"Local model missing for {spec.from_code}->{spec.to_code}. "
        "Run: py -3.12 scripts/install_local_translate.py"
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


def _get_spec(source: str, target: str) -> _ModelSpec | None:
    src, tgt = source.lower(), target.lower()
    for spec in _SPECS:
        if spec.from_code == src and spec.to_code == tgt:
            return spec
    return None


def model_present(source: str, target: str) -> bool:
    spec = _get_spec(source, target)
    if spec is None:
        return False
    if spec.marker.is_file():
        return True
    if spec.bundled.is_file() and spec.bundled.stat().st_size > 50_000_000:
        return True
    return _find_in_argos_home(spec.from_code, spec.to_code) is not None


def available_pairs() -> set[tuple[str, str]]:
    return {spec.pair for spec in _SPECS if model_present(*spec.pair)}


def _load_engine(source: str, target: str) -> _Engine:
    pair = (source.lower(), target.lower())
    if pair in _engines:
        return _engines[pair]

    spec = _get_spec(source, target)
    if spec is None:
        raise RuntimeError(f"本地引擎暂不支持 {source} -> {target}")

    import ctranslate2

    root = ensure_model_extracted(spec)
    model_dir = root / "model" if (root / "model" / "model.bin").is_file() else root

    engine = _Engine(
        translator=ctranslate2.Translator(str(model_dir), device="cpu"),
        tokenizer=_load_tokenizer(root),
        target_prefix=_read_target_prefix(root),
    )
    _engines[pair] = engine
    print(
        f"[ct2] Local {spec.from_code}->{spec.to_code} engine ready (CTranslate2, no PyTorch)",
        flush=True,
    )
    return engine


def init_ct2() -> None:
    """Preload all installed local language pairs."""
    pairs = available_pairs()
    if not pairs:
        raise RuntimeError(
            "Local model missing. Run: py -3.12 scripts/install_local_translate.py"
        )
    for src, tgt in sorted(pairs):
        _load_engine(src, tgt)


def translate(text: str, source: str = "en", target: str = "zh") -> str:
    text = (text or "").strip()
    if not text:
        return ""

    src, tgt = source.lower(), target.lower()
    engine = _load_engine(src, tgt)
    tokens = engine.tokenizer.encode(text)
    if not tokens:
        return ""

    target_prefix = None
    if engine.target_prefix:
        target_prefix = [[engine.target_prefix]]

    result = engine.translator.translate_batch(
        [tokens],
        target_prefix=target_prefix,
        replace_unknowns=True,
        beam_size=4,
    )[0]
    hyp = result.hypotheses[0] if result.hypotheses else []
    if not hyp:
        return ""

    value = engine.tokenizer.decode(hyp)
    if engine.target_prefix and value.startswith(engine.target_prefix):
        value = value[len(engine.target_prefix) :]
    if value.startswith(" "):
        value = value[1:]
    return value.strip()


def translate_en_zh(text: str) -> str:
    return translate(text, "en", "zh")


def translate_zh_en(text: str) -> str:
    return translate(text, "zh", "en")


def is_available() -> bool:
    return bool(available_pairs())


def verify() -> str:
    init_ct2()
    out_en_zh = translate("Hello world", "en", "zh")
    if not out_en_zh:
        raise RuntimeError("Empty en->zh translation")
    results = [f'en->zh: "{out_en_zh}"']
    if model_present("zh", "en"):
        out_zh_en = translate("你好世界", "zh", "en")
        if not out_zh_en:
            raise RuntimeError("Empty zh->en translation")
        results.append(f'zh->en: "{out_zh_en}"')
    return "; ".join(results)
