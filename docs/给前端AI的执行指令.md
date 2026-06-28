# 给前端 AI 的执行指令

> 直接复制下面的内容发给前端 AI（v0 / Bolt / Lovable 等）。

---

请打开 D:\Coding\projects\37工具箱，按以下顺序阅读文档：

1. **先读 开发标准.md** — 这是唯一的权威开发标准，你写的每行代码都要符合这个规范
2. **再读 总控计划.md** — 重点看 §4（设计系统）和 §5（目录结构），然后按下面标出的 Phase 逐步执行

开发过程中如果有持续性的规范建议，告诉我，我会提请 Claude 更新开发标准。

## 你的角色

你是这个项目的"前端设计师 + UI 实现者"。你对 React 组件、Tailwind CSS、交互细节、动画、视觉一致性很擅长。但你不负责构建配置、Electron 主进程、工具的逻辑函数——那些有另一个人做。

你的工作目录是 `D:\Coding\projects\37工具箱\src\`。

代码文件顶部统一加一行注释标注归属：

```
// @author: frontend-ai | phase: X | component: xxx
```

---

## 全局设计约束（必须遵守）

项目的设计 Token 已经在 `tailwind.config.ts` 和下面的 CSS 变量中定义。所有颜色、字体、间距、圆角、阴影都从这些 Token 取值，不要自己发明新色值。

**37 风格来源**: “37工具箱”的 37 来自《重返未来：1999》的角色 37。界面需要抽取她的抽象视觉元素：浅象牙/白金底、浅蓝银发感、青绿色点缀、哑金几何线、古希腊式几何秩序。不要直接使用角色立绘、头像、台词或可识别版权素材；不要做深蓝黑主题或痛屏。目标是“浅色开发者工具 + 37-inspired 的清透几何气质”。

**CSS 变量参考**（写入 `src/styles/globals.css`）：

```css
:root {
  /* 背景 */
  --bg-primary: #f6f0df;
  --bg-secondary: rgba(255, 251, 241, 0.82);
  --bg-sidebar: rgba(237, 245, 244, 0.74);
  --bg-chrome: #fbf6e8;
  --bg-hover: rgba(126, 179, 176, 0.16);
  --bg-active: rgba(126, 179, 176, 0.24);

  /* 边框 */
  --border: rgba(183, 154, 92, 0.28);
  --border-light: rgba(112, 155, 166, 0.36);

  /* 文字 */
  --text-primary: #38414a;
  --text-secondary: #697783;
  --text-muted: #9aa4aa;

  /* 强调色（暖金，不要乱改） */
  --accent: #b88c42;
  --accent-hover: #967037;
  --accent-subtle: rgba(184, 140, 66, 0.13);
  --accent-cyan: #78b8c5;
  --accent-cyan-subtle: rgba(120, 184, 197, 0.16);
  --accent-teal: #4f8f89;
  --accent-ivory: #fff9e9;
  --geometry-line: rgba(184, 140, 66, 0.24);
  --geometry-blue-line: rgba(120, 184, 197, 0.24);

  /* 状态色 */
  --success: #4dab77;
  --error: #e05555;
  --warning: #e0a550;
  --info: #5c9ecf;

  /* 字体 */
  --font-ui: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* 亮色主题覆盖（后续实现） */
.light {
  --bg-primary: #f5f5f7;
  --bg-secondary: #ffffff;
  --bg-sidebar: #ebebf0;
  /* ... 其余亮色变量 ... */
}
```

**字体规则**:
- 所有界面文字用 `font-family: var(--font-ui)`
- 所有代码/数据输入输出区用 `font-family: var(--font-mono)`
- 工具标题 16px font-weight 600
- 描述文字 13px font-weight 400，颜色 --text-secondary
- 按钮文字 14px font-weight 500

**交互规则**:
- 按钮 hover 时颜色从 --accent 变 --accent-hover
- 输入框 focus 时边框变 --accent（不要用浏览器默认的蓝色 outline）
- 列表项 hover 时背景变 --bg-hover
- 选中项背景 --bg-active，左侧 3px --accent 色竖条
- 所有过渡动画 150ms ease

---

## Phase 2: UI 框架

**前置条件**: Phase 1（脚手架）完成，项目目录已存在。如果没有，请等 Codex 先做完。

**重要提示**: 项目中已提供 `src/components/icons/ToolIcon.tsx` 组件，用于根据 manifest.icon 的字符串名渲染对应的 Lucide 图标。所有需要显示工具图标的地方（SidebarItem、ToolWorkspace header、EmptyState）都使用 `<ToolIcon name={manifest.icon} size={18} />`，不要自己从 lucide-react 逐个 import 图标。

**执行**:

### 2.1 写入全局样式

创建 `src/styles/globals.css`，写入上面的 CSS 变量，并加上 Tailwind 指令：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font-ui);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  /* 滚动条样式 — 暗色细滚动条 */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-light); }
}
```

### 2.2 实现共享组件（`src/components/shared/`）

每个组件要求：

**Button.tsx**
- Props: `variant: 'primary' | 'secondary' | 'ghost'`、`size: 'sm' | 'md'`、`disabled`、`onClick`、`children`
- Primary: 背景 --accent，文字白色
- Secondary: 背景 --bg-secondary，边框 --border
- Ghost: 无背景无边框，hover 时背景 --bg-hover
- 全部有 focus-visible 环（--accent 色，2px）

**Input.tsx**
- 背景 --bg-secondary，边框 --border-light
- focus: 边框 --accent
- placeholder 颜色 --text-muted
- 支持 prefix/suffix icon（可选 prop）

**TextArea.tsx**
- 同 Input 样式，等宽字体
- 支持 rows prop 控制高度
- 支持显示行号（可选 prop `showLineNumbers`）

**Select.tsx**
- 下拉选择器，样式同 Input
- 选项列表背景 --bg-secondary，hover --bg-hover
- 选中项前有 --accent 色勾号

**Switch.tsx**
- 关闭态：背景 --border
- 开启态：背景 --accent
- 圆形滑块白色
- 过渡动画 150ms

**Tooltip.tsx**
- 背景 --bg-active，文字 --text-primary
- 圆角 --radius-sm
- 出现在触发元素上方/下方，小三角箭头
- 延迟 300ms 出现

**EmptyState.tsx**
- 居中布局
- 大号图标（lucide-react，颜色 --text-muted）
- 标题和描述文字
- 可选 action 按钮

### 2.3 实现布局组件（`src/components/layout/`）

**TopBar.tsx**
```
┌──────────────────────────────────────────────────────────┐
│ [ ]  37工具箱                     [  搜索工具...]  [ ] │
└──────────────────────────────────────────────────────────┘
```
- 高度 48px，背景 --bg-sidebar
- 左侧：折叠按钮（点击 toggle sidebar）+ 应用名称（20px, font-weight 600）
- 中部：SearchBox 组件（宽度 320px）
- 右侧：主题切换按钮（月亮/太阳图标）
- 底部 1px 分割线，颜色 --border
- Electron 原生标题栏必须隐藏，由 `TitleBar.tsx` 提供自绘中文窗口栏；菜单项固定为“文件 / 编辑 / 视图 / 窗口 / 帮助”，不得出现 File/Edit/View/Window/Help。

**Sidebar.tsx**
- 宽度默认 224px，可拖拽右边缘调整（范围 180-320px）
- 背景 --bg-sidebar
- 顶部：SearchBox（同 TopBar 的联动）
- 中部：工具分类列表（CategoryGroup）
- 底部：状态栏（工具总数、当前版本号）
- 拖拽时显示半透明指示线

**CategoryGroup.tsx**
- 分类名（如"日常效率"）左对齐，右侧显示该分类下的工具数量 badge
- 点击分类名折叠/展开，左侧小三角旋转动画
- 展开时显示子工具列表（SidebarItem）
- 折叠时隐藏子列表

**SidebarItem.tsx**
- 显示工具图标（lucide-react）+ 工具名
- 默认态：文字 --text-secondary
- hover：背景 --bg-hover
- 选中态：背景 --bg-active，左侧 3px --accent 色竖条，文字 --text-primary
- 点击时激活对应工具

**SearchBox.tsx**
- 输入框（等宽），左侧搜索图标
- 输入时实时过滤侧边栏工具列表
- 匹配文字高亮（--accent 色背景）
- 无匹配时显示"未找到工具"
- 支持快捷键 Ctrl+P 聚焦

**ToolWorkspace.tsx**
- 填充右侧剩余空间
- 内边距 24px 水平 / 20px 垂直
- 顶部：工具标题（图标 + 名称 + 设置按钮）
- 中部：工具的内容组件（React.lazy 加载的工具组件）
- 底部：状态栏（工具状态文字 + 快捷键提示）
- 无激活工具时：显示 EmptyState（"选择一个工具开始使用"）

**StatusBar.tsx**
- 高度 28px，背景 --bg-sidebar
- 左侧：当前工具的状态文字（idle → "就绪"，running → "处理中..."，success → "完成"，error → "错误: xxx"）
- 右侧：快捷键提示（灰色小字）

### 2.4 实现 App.tsx

```tsx
// 组合布局：
<div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
  <TopBar />
  <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
    <Sidebar />
    <ToolWorkspace />
  </div>
</div>
```

- 从 Zustand store 读取所有状态
- 搜索过滤逻辑：匹配工具 name / description / tags
- 工具切换：调用 store.activateTool(id)

---

## Phase 4b: 内置工具 UI（13 个 Tool.tsx）

**前置条件**: 等 Codex 写完对应的 engine.ts（至少 manifest.ts 和 engine.ts 的函数签名有了）。你不需要等 Codex 全部写完，写完一个就可以做一个。

**阅读**: 总控计划.md 的 §6，每个工具的"UI 规格"部分。

**执行**: 为下面 13 个工具各写一个 `Tool.tsx`，放在对应的 `src/plugins/{tool-id}/` 目录下。

| # | 工具 ID | Spec 章节 | UI 要点 |
|---|---------|-----------|---------|
| 1 | timestamp-convert | §6.1 | 当前时间实时刷新 + 时间戳转换日期互转 |
| 2 | password-gen | §6.2 | 大号密码显示 + 长度滑条 + 选项开关 + 强度指示 |
| 3 | unit-convert | §6.3 | 分类 Tab + 双向输入 + 即时换算 |
| 4 | calculator | §6.4 | 标准计算器按键网格 + 键盘支持 |
| 5 | image-compress | §6.5 | 拖拽上传 + 左右对比 + 参数调节 + 下载 |
| 6 | qrcode | §6.6 | 左输入右预览 + 颜色/尺寸调节 |
| 7 | color-picker | §6.7 | 色盘选择 + 格式显示 + 颜色历史 |
| 8 | text-diff | §6.8 | 左右并排 diff + 增删高亮 + 同步滚动 |
| 9 | markdown-preview | §6.9 | 左编辑右预览 + 模式切换 + 代码高亮 |
| 10 | json-formatter | §6.10 | 左右分栏 + 语法高亮 + 校验高亮 |
| 11 | base64 | §6.11 | 编码/解码 Tab + 文件拖入转 data URL |
| 12 | regex-test | §6.12 | 正则输入 + 标志开关 + 匹配高亮显示 |
| 13 | downloader | §6.13 | URL输入 + 任务列表 + 进度条 + 暂停/继续 |

**每个 Tool.tsx 必须**:

1. 默认导出 React 组件，接受 `ToolProps` 类型（从 `../../core/types` import）
2. 从 `./engine` import 引擎函数（不要自己重新实现逻辑！）
3. 覆盖所有状态：
   - **空状态**: 工具打开但无数据时（如无输入、无任务），给出引导性提示
   - **正常态**: 有输入、有输出的正常工作状态
   - **错误态**: 输入无效、处理失败时的错误提示（红色文字/边框，信息明确）
   - **处理中（如有）**: 异步操作时显示 loading
4. 样式使用 Tailwind utility class，颜色从 CSS 变量取
5. 响应式：工具区宽度低于 600px 时，分栏布局转为上下布局
6. 使用共享组件（Button、Input、TextArea、Select、Switch、EmptyState 等）

**Tool.tsx 模板**：

```tsx
// @author: frontend-ai | phase: 4b | tool: xxx | ui
import React, { useState, useCallback } from 'react';
import type { ToolProps } from '../../core/types';
import { manifest, xxxFunction } from './engine';
import { Button, TextArea } from '../../components/shared';

const ToolName: React.FC<ToolProps> = ({ settings, onSettingsChange, onStatusChange, theme }) => {
  // 组件状态...
  // 调用 engine 函数...
  // 渲染 UI...
};

export default ToolName;
```

---

## 注意事项

1. **不要自己发明颜色**：全部从 CSS 变量取值
2. **不要自己实现工具逻辑**：始终从 `./engine` import 函数
3. **不要忘记空状态和错误态**：每个工具都要覆盖
4. **代码顶部写标注**：`// @author: frontend-ai | phase: X | component: xxx`
5. **类型安全**：所有 props 和 state 都要有 TypeScript 类型
6. **图标**：使用 lucide-react 的图标，具体哪个看 总控计划.md §10 附录 A
