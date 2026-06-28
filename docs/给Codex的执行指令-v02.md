# v0.2 Codex 任务

> 直接复制全文发给 Codex，按顺序执行。

---

先读 总控计划.md 的 §2 和 `src/core/types.ts`（v0.2 已更新），然后做下面的事。

## 一、你的角色

和 v0.1 一样：后端工程师 + 工具逻辑实现者。这次你要改内核代码。**不碰 UI 和 CSS**。

---

## 二、确认/补全 preload.ts 窗口 IPC

**阅读**: types.ts §九（WindowAPI 接口）

**检查**: 当前 preload.ts 已在 `window.toolbox` 下暴露了 `file/clipboard/app/shell/dir`。确认是否同时暴露了 `window` 对象：

```typescript
const windowApi: WindowAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  close: () => ipcRenderer.invoke('window:close'),
};
```

然后在 `contextBridge.exposeInMainWorld('toolbox', {..., window: windowApi})` 中挂载。

如果已经暴露了就跳过。如果没暴露就补上。

---

## 三、重写 PluginManager — 支持隐藏工具 + 动态分类

**阅读**: types.ts §六（PluginManagerAPI v0.2 新增方法）

**改动文件**: `src/core/PluginManager.ts`

### 3.1 新增状态字段

```typescript
private hiddenTools = new Set<string>();
private categories: CategoryDef[] = [...BUILTIN_CATEGORIES];
```

### 3.2 持久化 key

| 数据 | localStorage key |
|------|-----------------|
| 隐藏工具集合 | `37toolbox:hidden-tools` |
| 自定义分类 | `37toolbox:categories` |

### 3.3 实现的新方法

```typescript
// 隐藏工具
getHiddenTools(): ReadonlySet<string>
hideTool(id: string): void          // add to set + persist
showTool(id: string): void          // remove from set + persist
isToolHidden(id: string): boolean

// 分类 CRUD
getCategories(): CategoryDef[]
addCategory(label: string): string  // 生成 kebab-case id，order = next
updateCategory(id: string, label: string): void  // builtin 不能改 id
removeCategory(id: string): void    // builtin 不能删，删除后工具移到 'custom'
reorderCategory(id: string, newOrder: number): void
setToolCategory(toolId: string, categoryId: string): void
```

### 3.4 修改现有方法

- `getAllPlugins()` — 排序逻辑改用 `this.categories.sort((a,b) => a.order-b.order)`
- `getPluginsByCategory(cat)` — 参数改为 `string`
- `scan()` — 初始化时从 localStorage 恢复 `hiddenTools` 和 `categories`
- `search()` — 结果排除 hiddenTools

### 3.5 实现要点

- `addCategory` 的 id 生成规则：中文转拼音或用 `custom-{n}` 自动编号
- `reorderCategory` 每次调用后重新分配连续 order 值（0, 1, 2...），避免碎片
- 内置分类 `builtin: true` 不可删除
- localStorage JSON 序列化 `Set<string>` 用 `[...set]` / `new Set(arr)`
- 所有持久化操作在 set 后立刻调用 `saveHiddenTools()` / `saveCategories()`

---

## 四、重写 appStore — 新增状态和 actions

**改动文件**: `src/stores/appStore.ts`

### 4.1 新增状态

```typescript
hiddenTools: [],       // string[], 初始空 → 所有工具默认隐藏
categories: BUILTIN_CATEGORIES,  // CategoryDef[]，初始内置分类
```

### 4.2 新增 actions

按照 types.ts §七 AppStore 接口实现：

```typescript
// 可见性
hideTool(id): void      → 调 pluginManager.hideTool(id) + set
showTool(id): void      → 调 pluginManager.showTool(id) + set
isToolHidden(id): boolean → 调 pluginManager.isToolHidden(id)

// 分类
addCategory(label): string        → 调 pluginManager.addCategory(label) + set + 返回 id
updateCategory(id, label): void   → 调 pluginManager.updateCategory(id, label) + set
removeCategory(id): void          → 调 pluginManager.removeCategory(id) + set
reorderCategory(id, newOrder): void → 调 pluginManager.reorderCategory(id, newOrder) + set
setToolCategory(toolId, categoryId): void → 调 pluginManager.setToolCategory(toolId, categoryId) + set
```

### 4.3 修改现有 selector

`getFilteredPlugins()` — 排除隐藏工具 + 搜索过滤
`getVisiblePlugins()` — 仅排除隐藏工具（不过滤搜索，Dashboard 用）

### 4.4 修改现有 action

- `scanPlugins()` — 调用 pluginManager.scan() 后同步读取 hiddenTools + categories 到 store
- `collapsedCategories` 类型改为 `string[]`
- `toggleCategory` 参数改为 `string`
- `activateTool` — 如果工具已隐藏，自动显示（调用 showTool）

---

## 五、验证

做完后跑 `npm run build`，确保零报错。

---

## 六、注意事项

- types.ts 已经更新完，所有类型都在里面，不要自己改类型
- ToolCategory 现在是 `string`，旧代码中用 `'daily' | 'image'` 字面量的地方仍然兼容
- CATEGORY_LABELS 和 CATEGORY_ORDER 保留了向后兼容版本（从 BUILTIN_CATEGORIES 动态生成）
- 数据库层（localStorage）key 全部加 `37toolbox:` 前缀
- 不要碰 UI 文件（src/components/ 和 src/plugins/*/Tool.tsx）
