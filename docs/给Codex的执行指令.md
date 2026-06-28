# 给 Codex 的执行指令

> 直接复制下面的内容发给 Codex。

---

请打开 D:\Coding\projects\37工具箱，按以下顺序阅读文档：

1. **先读 开发标准.md** — 这是唯一的权威开发标准，你写的每行代码都要符合这个规范
2. **再读 总控计划.md** — 按下面标出的章节逐步阅读，对应每个 Phase 执行

开发过程中如果有持续性的规范建议，告诉我，我会提请 Claude 更新开发标准。

## 你的角色

你是这个项目的"后端工程师 + 工具逻辑实现者"。你对终端操作、Node.js、Electron 主进程、纯函数逻辑很熟练。但你不负责 UI 界面和 CSS —— 那些有另一个人做。

代码文件顶部统一加一行注释标注归属：

```
// @author: codex | phase: X | tool: xxx | file-description
```

---

## Phase 1: 项目脚手架（最先做，其他人都等你）

**阅读**: 总控计划.md 的 §1（架构总览）、§3（Electron 层规范）、§5（目录结构）、§8（依赖库清单）

**执行**:

1. 在 D:\Coding\projects\37工具箱 下用 Vite 初始化项目：`npm create vite@latest . -- --template react-ts`
2. 安装所有依赖（§8 清单中的全部包）
3. 创建 §5 列出的全部目录（electron/、src/core/、src/stores/、src/components/layout/、src/plugins/ 下所有 13 个工具目录等）
4. 按照 §3.3 的窗口配置写 `electron/main.ts` 和 `electron/preload.ts`
5. 实现 §3.2 列出的全部 IPC channel（file:read、file:write、file:openDialog、file:saveDialog、clipboard:write、clipboard:read、app:getVersion、app:quit、shell:openExternal）
6. 配置 `vite.config.ts`（vite-plugin-electron）
7. 配置 `tailwind.config.ts`（项目里已有，直接引用）
8. 配置 `electron-builder.yml`
9. 验证：`npm run dev` 能启动 Electron 窗口

**交付物**: 一个能启动的 Electron 空窗口。目录结构完整。依赖安装完毕。`npm run dev` 不报错。

---

## Phase 3: 插件内核

**阅读**: 总控计划.md 的 §2（插件系统契约，这是最核心的，仔细读）

**前置条件**: Phase 1 完成。

**执行**:

1. 打开 `src/core/types.ts`（项目里已有），确认所有类型定义完整。如果有缺失，补充
2. 实现 `src/core/PluginManager.ts`：按照 §2.2 的 PluginManagerAPI 接口实现，必须包含：scan()、getAllPlugins()、search()、loadPlugin()、getSettings()、updateSettings()
3. 实现 `src/core/pluginRegistry.ts`：注册全部 13 个内置工具。每个工具提供一个 lazy loader（动态 import）
4. 实现 `src/stores/appStore.ts`：按照 §2.4 的 AppStore 接口实现 Zustand store
5. 实现 `src/hooks/useActiveTool.ts` 和 `src/hooks/useKeyboard.ts`

**注意事项**:
- PluginManager 的 scan() 方法需要扫描 `src/plugins/` 目录下的内置工具，以及 `~/37工具箱/plugins/` 下的外部插件
- loadPlugin 使用动态 import：`() => import('../plugins/{id}/Tool')`
- 工具加载状态需要缓存，避免重复加载
- 所有工具设置持久化到 localStorage（key 前缀 `37toolbox:`）

**交付物**: PluginManager 能扫描、注册、加载插件。Zustand store 可直接被 React 组件使用。

---

## Phase 4a: 内置工具引擎（13 个 engine.ts）

**阅读**: 总控计划.md 的 §6（每个工具的 Spec），重点看每个工具的"引擎接口"部分

**前置条件**: Phase 3 中 `src/core/types.ts` 完成即可（不需要等 UI 完成）

**执行**: 为下面 13 个工具各写一个 `engine.ts`，放在对应的 `src/plugins/{tool-id}/` 目录下。

| # | 工具 ID | Spec 章节 | 关键库 |
|---|---------|-----------|--------|
| 1 | timestamp-convert | §6.1 | 无（纯 JS Date） |
| 2 | password-gen | §6.2 | 无（纯 JS） |
| 3 | unit-convert | §6.3 | 无（纯 JS） |
| 4 | calculator | §6.4 | 无（可用 mathjs 或纯 eval 管控） |
| 5 | image-compress | §6.5 | browser Canvas API |
| 6 | qrcode | §6.6 | qrcode 库 |
| 7 | color-picker | §6.7 | 无（纯 JS） |
| 8 | text-diff | §6.8 | diff 库 |
| 9 | markdown-preview | §6.9 | marked + highlight.js |
| 10 | json-formatter | §6.10 | 无（JSON.parse/stringify） |
| 11 | base64 | §6.11 | 无（btoa/atob） |
| 12 | regex-test | §6.12 | 无（new RegExp） |
| 13 | downloader | §6.13 | 用户已有现成代码，适配进 plugin 结构 |

**每个 engine.ts 必须**:

1. 导出 `manifest` 对象（类型为 ToolManifest，来自 `../../core/types`）
2. 导出对应 Spec 中列出的所有函数（按原样函数签名 + 完整的 TypeScript 类型标注）
3. 函数为纯逻辑，不依赖 DOM、不依赖 React、不引用任何组件
4. 每个函数有 JSDoc 注释说明用途

**engine.ts 模板**：

```typescript
// @author: codex | phase: 4a | tool: xxx | engine
import type { ToolManifest } from '../../core/types';

export const manifest: ToolManifest = {
  id: 'xxx',
  name: 'xxx',
  description: 'xxx',
  category: 'daily',   // 按 Spec 填写
  version: '1.0.0',
  icon: 'xxx',         // 按 Spec 填写
  tags: ['xxx'],
  hasSettings: false,
};

// 按 Spec 导出所有引擎函数
export function xxx(input: string): Result { ... }
```

**交付物**: 13 个 `engine.ts` 文件，每个都导出 manifest + 引擎函数。函数签名与 Spec 一致。

---

## Phase 6: 修复 + 打包（最后做）

**前置条件**: Phase 5（Claude 审查）完成后，拿到修复清单。

**执行**:

1. 按修复清单逐条修复 Phase 5 发现的问题
2. 确保 `npm run build` 不报错
3. 配置 `electron-builder.yml`，打包 Windows exe（NSIS 安装包）
4. `npm run package` 产出最终安装包
