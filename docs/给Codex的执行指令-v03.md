# Codex v0.3-v0.4 全量任务

> 复制全文发给 Codex。按顺序完成任务 A-J，**不需要等批准，做完一件接着做下一件**。
> 每完成一件在 `docs/待办-v0.4.md` 中标记 [完成]。

---

请打开 `D:\Coding\projects\37工具箱`，按顺序阅读：

1. `开发标准.md`
2. `docs/总控计划.md`
3. `docs/待办-v0.4.md`
4. `docs/工具市场-完整设计.md`

---

## 你的角色

后端工程师 + 工具逻辑实现者 + Electron 主进程开发者。不碰 UI 和 CSS。

---

## Phase 1: 构建验证 + 清理

### A: `npm run build`

Claude 新增/修改了以下文件，跑 `npm run build` 确保零报错：

| 新增 | 修改 |
|------|------|
| `src/core/packetValidator.ts` | `src/core/types.ts`（PacketManifest/MarketplaceAPI 类型）|
| `electron/ipc/errorHandlers.ts` | `src/core/PluginManager.ts`（unloadTool）|
| `src/errorCapture.ts` | `src/stores/appStore.ts`（loadedTools/unloadTool）|
| | `src/main.tsx`（import errorCapture 第一行）|
| | `electron/main.ts`（errorHandlers + 窗口错误处理）|
| | `electron/preload.ts`（app.reportError + python API）|
| | `src/components/layout/SidebarItem.tsx`（外部工具 + 关闭按钮）|
| | `src/components/layout/Dashboard.tsx`（外部工具）|
| | `src/components/layout/ToolWorkspace.tsx`（卸载清理 DOM）|
| | `src/styles/globals.css`（主题过渡 1s）|

### B: 清理临时文件

确认以下文件已删除：`yuc_202607.html`、`fetch_yuc.py`、任何 `.bat` / `.ps1` / 临时 `整理*.py`

---

## Phase 2: Pixiv 下载器实测

1. `npm run dev` → 在设置中开启"Pixiv下载"工具
2. 点击工具 → 状态栏应显示"就绪"
3. 账号 Tab → 添加账号能弹出 URL
4. 设置 Tab → 改路径 → 保存 → 日志确认
5. 如果 Python bridge 连不上，改 `electron/ipc/pythonHandlers.ts` 的路径候选列表

---

## Phase 3: 代码审查

### C: 外部工具注册
- types.ts 有 `external?` / `execPath?` 字段
- SidebarItem 点击 external 工具调 `shell.openExternal`
- Dashboard 外部工具卡片没有关闭按钮

### D: 设置版本迁移
- PluginManager.getSettings() 比较 `_v` 和 manifest.settingsVersion
- settingsVersion 省略时默认视为 1

### E: 错误上报
- `src/main.tsx` 第一行 `import './errorCapture'`
- `electron/ipc/errorHandlers.ts` 在 main.ts 中注册

---

## Phase 4: 工具市场后端（Codex 核心任务）

> 详细设计见 `docs/工具市场-完整设计.md`

### G: PluginManager 实现 installFromPath

签名：`async installFromPath(path: string): Promise<{ ok: boolean; error?: string }>`

0. `npm install adm-zip --save-dev`（ZIP 解压库）
1. 用 adm-zip 读取 .37tool 文件，列出所有条目
2. 调用 `validateFileList()` 检查路径安全 + 文件大小
3. 找到 `manifest.json` 条目，读取内容 → 调用 `validatePacket()`
4. 检查 `tool.id` 不与已有工具冲突
5. 解压到 `~/37工具箱/plugins/{tool.id}/`
6. 如有 permissions，用 `generatePermissionWrapper()` 生成桥接注入到 index.js
7. `this.registry.set(tool.id, entry)` 注册
8. 写入 localStorage `37toolbox:installed`

### H: PluginManager 实现 uninstall

签名：`async uninstall(id: string): Promise<boolean>`

1. 检查 `entry.builtin === false`（只能卸载外部安装的工具）
2. 从 registry 删除
3. 删除 `~/37工具箱/plugins/{id}/` 目录
4. 从 localStorage 清理安装记录 + 设置

### I: 实现 getInstalledPackages

签名：`getInstalledPackages(): InstalledPackage[]`

从 `localStorage` key `37toolbox:installed` 解析返回。

### J: installFromUrl (选做，时间不够可跳过)

签名：`async installFromUrl(url: string): Promise<{ ok: boolean; error?: string }>`

Node.js fetch 下载 → 写临时文件 → 调 installFromPath → 删除临时文件。

---

## 完成后在 `docs/待办-v0.4.md` 末尾追加报告

```
## Codex 执行记录 (2026-06-28)
### 已完成
### 阻塞项
### 给 Claude 的备注
```
