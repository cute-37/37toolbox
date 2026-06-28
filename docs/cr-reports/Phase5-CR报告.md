# Phase 5 CR 报告 — Codex 产出审查

> **审查人**: Claude | **日期**: 2026-06-26 | **审查范围**: Phase 1 / 3 / 4a

---

## 一、通过项 ✅

### 1.1 Electron 层

| # | 项目 | 状态 |
|---|------|------|
| 1 | main.ts — 窗口创建、托盘、全局快捷键、关闭隐藏 | ✅ 完全符合 Spec §3 |
| 2 | preload.ts — contextIsolation=true, nodeIntegration=false | ✅ 安全配置正确 |
| 3 | IPC channels — 9 个 channel 全部实现 | ✅ 与 Spec §3.2 一致 |
| 4 | fileHandlers — 文件读写 + 对话框 | ✅ 处理了 cancel |
| 5 | clipboardHandlers — 读写剪贴板 | ✅ |
| 6 | appHandlers — 版本、退出、外部链接 | ✅ |
| 7 | vite.config.ts — vite-plugin-electron/simple | ✅ 配置简洁正确 |
| 8 | electron-builder.yml — NSIS + dmg | ✅ 打包配置正确 |

### 1.2 插件内核

| # | 项目 | 状态 |
|---|------|------|
| 9 | PluginManager — scan/search/loadPlugin/getSettings/updateSettings | ✅ 接口实现完整 |
| 10 | PluginManager — localStorage 持久化 (key: `37toolbox:{id}`) | ✅ 有 JSON 解析容错 |
| 11 | PluginManager — 搜索结果大小写不敏感 | ✅ |
| 12 | PluginManager — 加载缓存，避免重复 import | ✅ |
| 13 | pluginRegistry — 13 个工具全部注册，lazy loader | ✅ |
| 14 | appStore.ts — Zustand store 完整实现 | ✅ |
| 15 | appStore — sidebarWidth 范围限制 180-320 | ✅ |
| 16 | appStore — toggleTheme 操作 classList | ✅ |
| 17 | useActiveTool / useKeyboard hooks | ✅ |

### 1.3 工具引擎（13 个 engine.ts）

| # | 工具 | 状态 |
|---|------|------|
| 18 | timestamp-convert | ✅ 时间转换、相对时间、多时区 |
| 19 | password-gen | ✅ crypto.getRandomValues 安全随机 |
| 20 | unit-convert | ✅ 7 分类 + 温度特殊处理 |
| 21 | calculator | ✅ 自实现 tokenizer + RPN，安全无 eval |
| 22 | image-compress | ✅ Canvas API 压缩，等比缩放 |
| 23 | qrcode | ✅ 使用 qrcode 库，参数完整 |
| 24 | color-picker | ✅ HEX/RGB/HSL 互转，互补色、相邻色 |
| 25 | text-diff | ✅ 使用 diff 库，逐行对比 |
| 26 | markdown-preview | ✅ marked + highlight.js，同步渲染 |
| 27 | json-formatter | ✅ 解析错误精确定位行/列 |
| 28 | base64 | ✅ TextEncoder/TextDecoder 正确处理 UTF-8 |
| 29 | regex-test | ✅ 空匹配防护 (lastIndex += 1) |
| 30 | downloader | ✅ 内存态 API 框架（见下方需处理项） |

### 1.4 代码质量

| # | 项目 | 状态 |
|---|------|------|
| 31 | 所有文件顶部有 @author 标注 | ✅ |
| 32 | 引擎函数为纯函数/无 DOM 副作用（image-compress 使用 Canvas 除外，这合理） | ✅ |
| 33 | 所有导出函数有 JSDoc 注释 | ✅ |
| 34 | 所有函数有完整 TypeScript 类型标注 | ✅ |
| 35 | package.json 依赖版本正确 | ✅ |
| 36 | tsconfig strict: true | ✅ |
| 37 | globals.css 包含 CSS 变量 + 亮色主题 | ✅ |

---

## 二、需修复项 🔴

### 2.1 index.html 缺少 HTML 文档结构 🔧已由 Claude 修复

**文件**: `index.html`

**问题**: 当前 HTML 只有 `<div id="root"></div><script...>`，缺少 `<html>`、`<head>`、`<meta charset>`、`<title>`。这在 dev 模式下能跑但生产构建会有问题。

**建议修复**: 补全标准 HTML5 文档结构（见下方修复代码）。

### 2.2 globals.css 缺少 font-family CSS 变量定义 🔧已由 Claude 修复

**文件**: `src/styles/globals.css`

**问题**: `--font-ui` 和 `--font-mono` CSS 变量未定义。当前 body 用内联字体栈，而 Tailwind config 中 `font-ui`/`font-mono` 映射到 CSS 变量，CSS 变量没定义导致字体回退到系统默认。

**建议修复**: 在 `:root` 中添加 `--font-ui` 和 `--font-mono` 变量（见下方修复代码）。

### 2.3 globals.css 缺少开发规范要求的重置样式 🔧已由 Claude 修复

**文件**: `src/styles/globals.css`

**问题**: 开发规范 §3.4 要求在 `@layer base` 中添加 `box-sizing` 重置和自定义滚动条样式。当前缺失。

**建议修复**: 添加 base layer 样式（见下方修复代码）。

### 2.4 external plugin 扫描缺少目录枚举 IPC

**问题**: Codex 在 PluginManager.scan() 中标注 TODO，当前无法扫描 `~/37工具箱/plugins/` 目录。

**决议**: 新增 `dir:scan` IPC channel。需在 electron/ipc/ 新建 `dirHandlers.ts`，在 preload 中暴露 `dirScan` 方法。Phase 1 中 Codex 补充。

---

## 三、建议改进项 💡

### 3.1 App.tsx 为占位版本

当前 App.tsx 只渲染"脚手架已就绪"提示，覆盖了 Phase 2 UI 框架的工作区域。前端 AI 在做 Phase 2 时需要替换整个 App.tsx 为带 TopBar/Sidebar/ToolWorkspace 的完整版本。**无需 Codex 修改，前端 AI 直接覆盖即可。**

### 3.2 downloader 为内存态桩代码

下载器无真实 HTTP 下载能力。需要等用户提供现有代码后接入。当前接口设计（DownloadTask + DownloaderAPI）保持不动，对接时只需替换 createDownloader 实现。**暂不处理，等用户提供代码。**

### 3.3 password-gen 强度函数返回 CSS 变量字符串

`passwordStrength()` 返回 `color: 'var(--error)'` 等。如果 UI 直接用作 inline style 值，CSS 变量会被解析。但建议将来改为返回 token 名（如 `'error'`），由 UI 层翻译为 CSS class。**v1 可接受，不阻塞。**

### 3.4 缺少 .gitignore

建议添加 `.gitignore` 文件排除 `node_modules/`、`dist/`、`release/`、`*.log`。

---

## 四、需 Codex 修复的具体代码

### 4.1 修复 index.html

当前内容：
```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

替换为：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>37工具箱</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4.2 修复 globals.css

在 `:root` 块中补充font变量，添加 `@layer base` 重置样式（见下方完整文件）。

### 4.3 新增 dir:scan IPC

**新增文件**: `electron/ipc/dirHandlers.ts`

```typescript
import { readdir } from 'node:fs/promises';
import { ipcMain } from 'electron';

interface DirScanPayload {
  dirPath: string;
}

export function registerDirHandlers(): void {
  ipcMain.handle('dir:scan', async (_event, payload: DirScanPayload): Promise<string[]> => {
    try {
      const entries = await readdir(payload.dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  });
}
```

**更新 preload.ts**：在 `window.toolbox` 对象中增加 `dir: { scan: ... }`

**更新 main.ts**：`import { registerDirHandlers } from './ipc/dirHandlers'` 并在 `registerMainProcess()` 中调用。

---

## 五、总结

| 类别 | 数量 |
|------|------|
| 通过项 | 37 |
| 需修复 | 4 |
|   - 已由 Claude 修复 | 3 (index.html, globals.css ×2) |
|   - 需 Codex 补充 | 1 (dir:scan IPC) |
| 建议改进 | 4 |
| 阻塞项 | 0 |

**结论**: Codex 的产出质量很高，核心架构稳固。4 个修复项都是小改动。下载器桩代码在用户提供现有代码前不需要动。可以开始 Phase 2（前端 AI UI 框架）和 Phase 4b（前端 AI 工具 UI）了，与 Codex 修复并行推进。

---

> **下一步**: Codex 修复 4.1-4.3 三个文件。修复后 Claude 确认。用户开始分发 给前端AI的执行指令.md。
