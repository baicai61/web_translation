#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configure MyMemory contact email for higher daily quota."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = ROOT / "server" / ".mymemory-email"


def _read_current() -> str:
    if not CFG.is_file():
        return ""
    for line in CFG.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "@" in line:
            return line
    return ""


def main() -> int:
    print("=" * 50)
    print("  MyMemory 邮箱配置（提高在线额度）")
    print("=" * 50)
    print()
    print("未配置邮箱：约 1 万字符 / 天")
    print("已配置邮箱：约 10 万字符 / 天")
    print(f"配置文件：{CFG}")
    print()

    current = _read_current()
    if current:
        print(f"当前邮箱：{current}")
        print()

    try:
        email = input("请输入邮箱（直接回车取消）: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n已取消。")
        return 0

    if not email:
        print("已取消，未修改配置。")
        return 0

    if "@" not in email or "." not in email.split("@")[-1]:
        print("邮箱格式无效，请重新运行。")
        return 1

    CFG.parent.mkdir(parents=True, exist_ok=True)
    CFG.write_text(email + "\n", encoding="utf-8")
    print()
    print("已保存。")
    print("请重启「启动翻译引擎.bat」，然后在网页按 F5 刷新。")
    return 0


if __name__ == "__main__":
    code = main()
    try:
        input("\n按回车键关闭窗口…")
    except (EOFError, KeyboardInterrupt):
        pass
    raise SystemExit(code)
