# v0.2 前端 AI 任务

> 直接复制全文发给前端 AI，按优先级顺序执行。

---

先读 总控计划.md 的 §4（设计系统）和 `v0.2需求计划.md`（了解全局需求），然后按下面顺序执行。

## 你的角色

和 v0.1 一样：前端设计师 + UI 实现者。这次你要做 6 个 UI 组件。

---

## 一、Sidebar 折叠动画（优先级最高，先做）

**改动文件**: `src/components/layout/Sidebar.tsx`

### 要改什么

当前折叠时 `return null`，改为平滑过渡动画。

### 具体实现

```tsx
// 当前：if (sidebarCollapsed) return null;

// 改成：
<aside 
  className="relative flex shrink-0 flex-col border-r border-border bg-bg-sidebar overflow-hidden"
  style={{ 
    width: sidebarCollapsed ? 0 : sidebarWidth,
    transition: 'width 200ms ease',
    opacity: sidebarCollapsed ? 0 : 1,
  }}
>
  <div style={{ 
    minWidth: 224,  // 防止内容挤压变形
    transition: 'opacity 120ms ease',
    opacity: sidebarCollapsed ? 0 : 1,
  }}>
    {/* 原来的内容 */}
  </div>
</aside>
```

要点：
- 过渡时间 200ms，要干脆利落，不要拖拽感
- 不要 `return null`
- 折叠时 `overflow: hidden`，防止内容溢出
- 内部加一个 `minWidth: 224` 的包裹层，保护内容不被挤压变形
- 拖拽调宽功能保留，只在展开态可拖拽

---

## 二、Dashboard 仪表盘主页（优先级最高，先做）

**新建文件**: `src/components/layout/Dashboard.tsx`

### 什么情况显示

当 `activeToolId === null` 时，ToolWorkspace 不再显示 EmptyState，改为渲染 Dashboard。

### 组件规格

- 响应式卡片网格：`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
- 每张卡片显示：
  - 工具图标（ToolIcon，size 32，accent 色）
  - 工具名称（font-medium）
  - 工具描述（text-text-secondary, text-xs, 1行截断）
  - 分类标签（小 badge，bg-accent-subtle）
- 卡片背景 `bg-bg-secondary`，圆角 `rounded-md`，边框 `border border-border`
- hover 时边框变 `border-accent`，阴影 `shadow-md`
- 点击卡片 → `activateTool(id)`
- 搜索框输入时实时过滤卡片（用 `getVisiblePlugins()` 过滤 searchQuery）
- 已隐藏的工具不出现在 Dashboard（getVisiblePlugins 已排除）
- 空状态：如所有工具都被隐藏，显示 "所有工具已隐藏，请到设置中开启"

### 需要改 ToolWorkspace.tsx

在 ToolWorkspace 中，`activeToolId === null` 的分支渲染 `<Dashboard />` 而不是 `<EmptyState />`。

```tsx
// 在 ToolWorkspace.tsx 的 return 中
if (!activePlugin || !activeToolId) {
  return <Dashboard />;  // 之前是 EmptyState
}
```

---

## 三、MenuBar 自定义菜单栏（等 Codex 完成 IPC）

**新建文件**: `src/components/layout/MenuBar.tsx`

### 布局

```
┌──────────────────────────────────────────────────────────────┐
│  文件 ▼   编辑 ▼   视图 ▼   窗口 ▼   帮助 ▼                  │
└──────────────────────────────────────────────────────────────┘
```

- 放在 TopBar 下方，高度 28px
- 背景 `bg-bg-chrome`（新 CSS 变量，暗色 `#141418`，亮色 `#eeeeF2`）
- 底部 `border-b border-border`
- 菜单项 `px-3 py-1`，`text-xs`，`text-text-secondary`
- hover 时 `bg-bg-hover`，`text-text-primary`

### 下拉面板

点击菜单项时在正下方弹出：
- 绝对定位，最小宽度 180px
- 背景 `bg-bg-secondary`，边框 `border border-border`，圆角 `radius-md`，阴影 `shadow-md`
- 子菜单项：左图标（ToolIcon size 14）+ 文字 + 快捷键提示（右对齐 text-text-muted）
- 分割线用 `border-t border-border my-1`
- hover 子项背景 `bg-bg-hover`
- 点击任一项关闭面板
- 点击其他菜单标题切换面板内容
- 点击面板外部或按 Esc 关闭

### 各菜单的功能

**文件**
| 项目 | 功能 |
|------|------|
| 隐藏到托盘 | `window.toolbox.window.close()` |
| — | 分割线 |
| 退出 Ctrl+Q | `window.toolbox.app.quit()` |

**编辑**
| 项目 | 功能 |
|------|------|
| 撤销 Ctrl+Z | `document.execCommand('undo')` |
| 重做 Ctrl+Y | `document.execCommand('redo')` |
| — | |
| 剪切 Ctrl+X | `document.execCommand('cut')` |
| 复制 Ctrl+C | `document.execCommand('copy')` |
| 粘贴 Ctrl+V | `document.execCommand('paste')` |
| 全选 Ctrl+A | `document.execCommand('selectAll')` |

**视图**
| 项目 | 功能 |
|------|------|
| 重新加载 | `location.reload()` |
| 开发者工具 | `window.toolbox.app.toggleDevTools`（如果没有这个 IPC 就用 Ctrl+Shift+I 的 Electron 默认行为） |
| — | |
| 放大 | `webContents.zoomIn`（暂不做，放个 disabled 占位） |
| 缩小 | 同上 |

**窗口**
| 项目 | 功能 |
|------|------|
| 最小化 | `window.toolbox.window.minimize()` |
| 最大化 | `window.toolbox.window.toggleMaximize()` |
| 关闭 | `window.toolbox.window.close()` |

**帮助**
| 项目 | 功能 |
|------|------|
| 关于 37工具箱 | 弹出一个简单的对话框或显示版本信息 |

### 集成到 App.tsx

```tsx
<div className="app-shell flex h-screen flex-col overflow-hidden">
  <TopBar />
  <MenuBar />   ← 新增这一行
  <div className="flex min-h-0 flex-1 overflow-hidden">
    <Sidebar />
    <ToolWorkspace />
  </div>
</div>
```

---

## 四、ContextMenu 右键菜单

**新建文件**: `src/components/shared/ContextMenu.tsx`

### Props

```typescript
import type { ContextMenuItem } from '../../core/types';

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}
```

### 组件行为

- 在 `position` 所指位置渲染一个绝对定位的浮层（`position: fixed`）
- 自动判断是否超出视口右/下边缘，超出则反方向弹出
- 点击任一项 → 调 `item.onClick()` → 调 `onClose()`
- 点击外部 → `onClose()`
- Esc 键 → `onClose()`
- 入场动画：`opacity 0→1` + `scale 0.95→1`，80ms

### 样式

- 最小宽度 180px，最大宽度 280px
- 背景 `bg-bg-secondary`，边框 `border border-border`，圆角 `radius-md`，阴影 `shadow-lg`
- 每项 `px-3 py-1.5`，`text-sm`
- hover 项 `bg-bg-hover`
- danger 项 `text-status-error`
- disabled 项 `opacity-40 pointer-events-none`
- 快捷键提示 `text-text-muted text-2xs` 右对齐
- 分割线 `border-t border-border my-1`

### 用法示例（给使用 ContextMenu 的组件参考）

```tsx
const [contextMenu, setContextMenu] = useState<{
  x: number; y: number; items: ContextMenuItem[];
} | null>(null);

<div onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, items: [
    { id: 'open', label: '打开', icon: 'panel-left', onClick: () => {...} },
    { id: 'sep1', label: '', separator: true, onClick: () => {} },
    { id: 'hide', label: '隐藏', icon: 'x', danger: true, onClick: () => {...} },
  ]});
}}>
  ...
</div>

{contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
```

### 需要集成右键菜单的位置

| 位置 | 菜单项 | 谁来做 |
|------|--------|--------|
| SidebarItem | 打开工具、隐藏/显示工具、查看信息 | 你 |
| 分类标题 (CategoryGroup) | 重命名分类、删除分类 | 你 |
| Dashboard 卡片 | 打开工具、隐藏工具 | 你 |
| ToolWorkspace 空白区 | 新建工具（暂 disabled）、刷新 | 你 |

---

## 五、TopBar 改造

**改动文件**: `src/components/layout/TopBar.tsx`

### 增加窗口控制按钮

在 TopBar 右侧、主题切换按钮旁边，增加三粒窗口控制按钮（macOS 风格圆形）：

```
[⚫] [🟡] [🟢]
```

- ⚫ 红色 → 关闭窗口 → `window.toolbox.window.close()`（不存在时 fallback 到 `window.toolbox.app.quit()`）
- 🟡 黄色 → 最小化 → `window.toolbox.window.minimize()`
- 🟢 绿色 → 最大化 → `window.toolbox.window.toggleMaximize()`

不用真画 emoji，用纯 CSS 小圆点 + 颜色即可：
```
w-3 h-3 rounded-full bg-status-error  // 红色
w-3 h-3 rounded-full bg-status-warning // 黄色
w-3 h-3 rounded-full bg-status-success // 绿色
```

hover 时加深颜色。

### 增加设置按钮

在主题切换按钮旁边增加齿轮图标按钮：

```tsx
<Button variant="ghost" size="sm" aria-label="设置" onClick={toggleSettings}>
  <ToolIcon name="settings" size={16} />
</Button>
```

点击打开设置面板（见下一节）。

---

## 六、SettingsPanel 设置面板

**新建文件**: `src/components/layout/SettingsPanel.tsx`

### 触发方式

点击 TopBar 齿轮图标打开，以侧边抽屉形式从右侧滑入（`position: fixed right-0`）。

### 内容：两个 Tab

**Tab 1: 工具可见性**

- 搜索框过滤工具列表
- 一键"全部显示/全部隐藏"按钮
- 工具列表：每行 Switch 开关 + 图标 + 工具名 + 分类标签
- 默认全部关闭（`hiddenTools` 包含所有 ID），用户手动开
- 同时更新 Dashboard 和侧边栏实时反映

**Tab 2: 分类管理**

- 分类列表：每行显示分类名、工具数量 badge、操作按钮（编辑/删除）
- "新增分类"按钮 → 弹出小输入框
- 编辑分类名：inline 编辑或弹窗
- 删除分类：二次确认（"该分类下的 X 个工具将被移到「我的工具」"）
- 内置分类（`builtin: true`）的编辑/删除按钮置灰
- 工具归属：一个下拉选择器，列出所有可切换的工具 → 选择 → `setToolCategory`

### 样式

- 侧边抽屉宽度 360px，`bg-bg-sidebar`，`border-l border-border`，`shadow-lg`
- 滑入动画 `transition: right 250ms ease`
- 顶部标题栏 + 关闭按钮
- 内部 `overflow-y-auto`

---

## 七、全局 CSS 补充

在 `src/styles/globals.css` 中新增：

```css
--bg-chrome: #141418;       /* 暗色 */
```
```css
:root.light { --bg-chrome: #eeeeF2; }  /* 亮色 */
```

以及在 base layer 中加全局右键菜单样式（可选，ContextMenu 组件已自包含样式）。

---

## 八、优先级

| 顺序 | 做什么 | 可以不等 |
|------|--------|---------|
| 1 | Sidebar 折叠动画 | ✅ 纯 CSS，立刻开始 |
| 2 | Dashboard 仪表盘 | ✅ 不依赖新 store action |
| 3 | ContextMenu 右键菜单 | ✅ 共享组件，不依赖数据层 |
| 4 | TopBar 改造 | ⚠️ 窗口按钮需要 preload IPC（Codex 可能已就绪） |
| 5 | MenuBar 菜单栏 | ⚠️ 需要 preload IPC |
| 6 | SettingsPanel 设置面板 | ⚠️ 需要 Codex 完成 PluginManager + appStore 改动 |

---

## 九、注意事项

- 所有颜色从 CSS 变量取，禁止硬编码
- 从 engine import 工具逻辑，不要自己重写
- Icon 用 ToolIcon 组件，不要直接从 lucide-react import
- 覆盖空/正常/错误状态
- 代码顶部写 `// @author: frontend-ai | phase: v0.2 | component: xxx`
