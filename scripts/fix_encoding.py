#!/usr/bin/env python3
"""Repair script encoding on Chinese Windows (GBK -> UTF-8). ASCII-only file."""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SKIP = {"fix_encoding.py"}


def main() -> int:
    fixed = 0
    for path in sorted(HERE.glob("*.py")):
        if path.name in SKIP:
            continue
        raw = path.read_bytes()
        try:
            raw.decode("utf-8")
            continue
        except UnicodeDecodeError:
            pass
        for enc in ("gbk", "cp936", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                text = None
        if text is None:
            print(f"[fix_encoding] skip (unknown encoding): {path.name}", file=sys.stderr)
            continue
        if not text.startswith("#!/usr/bin/env python3"):
            text = "#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n" + text.lstrip("\ufeff")
        elif "# -*- coding:" not in text.split("\n", 3)[1]:
            lines = text.splitlines(keepends=True)
            if lines and lines[0].startswith("#!"):
                lines.insert(1, "# -*- coding: utf-8 -*-\n")
                text = "".join(lines)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"[fix_encoding] repaired: {path.name}")
        fixed += 1
    if fixed:
        print(f"[fix_encoding] done, fixed {fixed} file(s)")
    else:
        print("[fix_encoding] all scripts OK (UTF-8)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
