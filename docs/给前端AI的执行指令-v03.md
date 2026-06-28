# 前端 AI v0.4 任务 — 工具市场 UI

> 复制全文发给前端 AI。可以和后端的 Codex **并行开发**，不等。

---

请打开 `D:\Coding\projects\37工具箱`，按顺序阅读：

1. `开发标准.md`
2. `docs/工具市场-完整设计.md`（重点看 §二包格式 和 §七给你的任务）
3. `src/core/types.ts`（§十 PacketManifest / InstalledPackage / MarketplaceAPI 等类型）

---

## 你的角色

前端设计师 + UI 实现者。不碰 Electron 主进程、不写工具逻辑。

---

## 一、SettingsPanel 新增"工具市场"Tab

### 新建组件: `src/components/layout/MarketplaceTab.tsx`

在 SettingsPanel 的 Tab 栏中追加"工具市场"Tab。

#### 列表视图

1. 默认显示"已安装"工具列表（从 `pluginManager.getInstalledPackages()` 或 `localStorage` key `37toolbox:installed` 读取）
2. 每行显示：工具图标 + 名称 + 版本 + 安装日期 + 卸载按钮
3. "手动安装"按钮 → 调用 `window.toolbox.file.openDialog` 选择本地 `.37tool` 文件 → 调 `pluginManager.installFromPath(path)`
4. 安装中显示进度条（模拟，因为解压是同步的）
5. 安装完成/失败 → 绿色/红色 toast 提示

#### 卡片设计

```
┌─────────────────────────────────────────┐
│  [icon]  工具名称          v1.0.0        │
│          作者 · 2026-06-28               │
│                                          │
│  [权限: 剪贴板] [卸载]                   │
└─────────────────────────────────────────┘
```

- 权限以小型 badge 展示（蓝色 = 已授权，灰色 = 未请求）
- 卸载按钮 → 二次确认弹窗 → 调 `pluginManager.uninstall(id)`

#### 颜色规范
- 卡片背景：`bg-bg-secondary`，边框 `border-border`，圆角 `rounded-md`
- 权限 badge 背景：`bg-accent-subtle`，文字 `text-accent`
- 卸载按钮：危险操作，`text-status-error`，hover 背景 `bg-status-error/10`

---

## 二、SidebarItem 右键卸载

### 修改: `src/components/layout/SidebarItem.tsx`

在右键菜单中，`builtin === false` 的工具追加"卸载"选项：

```typescript
{ !entry.builtin ? {
  id: 'uninstall',
  label: '卸载工具',
  icon: 'trash-2',
  danger: true,
  onClick: async () => {
    // 二次确认
    const confirmed = window.confirm(`确定要卸载 ${entry.manifest.name} 吗？`);
    if (confirmed) {
      await pluginManager.uninstall(entry.manifest.id);
      // store.unloadTool(id) 清理加载状态
    }
  }
} : null }
```

---

## 三、权限确认弹窗

### 新建组件: `src/components/shared/PermissionDialog.tsx`

安装时弹出确认对话框，列出工具请求的所有权限：

```
┌───────────────────────────────────────┐
│  🔒 安装确认                          │
│                                       │
│  "我的工具" 将请求以下权限：           │
│                                       │
│  ✅ 剪贴板 — 读写系统剪贴板            │
│  ✅ 文件读取 — 打开本地文件            │
│  ❌ 网络 — 不请求                      │
│                                       │
│  [取消]  [确认安装]                    │
└───────────────────────────────────────┘
```

- 调用 `validatePacket(manifest)` 获取权限列表
- 无权限的用灰色文字 + × 标记
- 有权限的用绿色 ✓ 标记

---

## 四、Tips/Hint 优化

### 修改: `src/components/shared/Tooltip.tsx`

让 Tooltip 支持更丰富的内容（可选 HTML，默认仍是纯文本）：
- 新增 `rich?: boolean` prop
- 当 `rich = true` 时渲染 `dangerouslySetInnerHTML`（仅用于预设系统提示，不用于用户输入）

---

## 五、完成后

在 `docs/待办-v0.4.md` 末尾追加：

```
## 前端 AI 执行记录 (2026-06-28)
### 已完成
### 给 Claude 的备注
```
