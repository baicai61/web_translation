# 文献译读

面向学术文献阅读的本地 Web 翻译工具：导入 PDF / Word / TXT 等格式，左右字段对照，支持多语言互译、划词翻译与全文搜索。文献内容保存在浏览器本地，不上传服务器。

## 功能特性

- **多格式导入**：PDF、DOCX、DOC、TXT、MD、HTML、RTF、EPUB、CSV（可多选批量导入）
- **字段对照**：左侧原文、右侧译文，同编号字段一一对应
- **多语言互译**：英语、中文、日语、韩语、法语、德语、西班牙语、俄语、葡萄牙语、意大利语
- **划词翻译**：在原文栏框选词语，自动弹出译文
- **全文搜索**：支持模糊搜索，命中词高亮（非整段高亮）
- **本地存储**：文献库保存在浏览器 localStorage

## 快速开始

### 环境要求

- [Node.js LTS](https://nodejs.org/)（18+）
- 翻译引擎（二选一）：
  - **推荐**：Python 3.10+（勾选 Add to PATH）
  - 可选：Docker Desktop（用于 LibreTranslate 容器）

### 启动步骤

1. 克隆仓库并安装依赖：

```bash
git clone https://github.com/baicai61/web_translation.git
cd web_translation
npm install
```

2. **启动翻译引擎**（保持窗口打开）：

   - Windows：双击 `启动翻译引擎.bat` 或 `scripts\translate-up-python.bat`
   - 或使用 Docker：`npm run translate:up`

3. **启动网站**（保持窗口打开）：

   - Windows：双击 `启动网站.bat` 或 `scripts\dev.bat`
   - 或命令行：`npm run dev`

4. 浏览器打开终端显示的地址（一般为 http://localhost:5173），顶栏显示「翻译引擎 · 已就绪」即可使用。

> 若 PowerShell 提示禁止运行脚本，请使用 `npm.cmd` 代替 `npm`，或运行 `scripts\fix-powershell-npm.bat`。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（含内置 API 代理） |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run translate:up` | Docker 启动 LibreTranslate |
| `npm run translate:down` | 停止 Docker 翻译引擎 |
| `npm run dev:api` | 单独启动 API 代理（端口 3001） |

## 翻译引擎说明

项目自带 Python 翻译服务（`scripts/lt_server.py`），兼容 LibreTranslate API：

| 引擎 | 说明 |
|------|------|
| **Argos Translate（本地）** | 英→中等已安装语言包可离线翻译，免费开源 |
| **MyMemory（在线备用）** | 其他语言对或本地引擎不可用时自动切换，需联网 |

翻译质量适合**辅助阅读与理解大意**，学术术语与长句建议人工核对。顶栏可查看当前使用的引擎类型。

## 项目结构

```
├── src/                 # React 前端
│   ├── components/      # UI 组件
│   └── lib/             # 解析、翻译、搜索等逻辑
├── server/              # Vite API 代理
├── scripts/             # 启动脚本与 Python 翻译引擎
├── 启动网站.bat
└── 启动翻译引擎.bat
```

## 架构

```
浏览器 → Vite (/api) → Node 代理 → Python 翻译服务 (127.0.0.1:5000)
                                              ↓
                                    Argos 本地 / MyMemory 在线
```

## 故障排查

| 现象 | 处理 |
|------|------|
| 页面空白 | 关闭所有 dev 窗口后重新运行 `启动网站.bat`，Ctrl+F5 强刷 |
| 翻译引擎未就绪 | 确认翻译引擎黑窗口有 `[READY]`，访问 http://127.0.0.1:5000/health |
| QUERY LENGTH LIMIT | 在线引擎单段限制 500 字，已自动分块；或改用本地 Argos |
| PDF 无法提取文字 | 需可复制文字的 PDF，纯扫描版暂不支持 |
| 旧版 .doc 失败 | 在 Word / WPS 中另存为 `.docx` 后导入 |
| 端口被占用 | 查看黑窗口 `Local:` 行，可能是 5174、5175 等 |

## 技术栈

- React 19 + TypeScript + Vite + Tailwind CSS
- pdf.js（PDF）、mammoth（DOCX）、JSZip（EPUB）
- Fuse.js（模糊搜索）
- Argos Translate / MyMemory

## License

MIT
