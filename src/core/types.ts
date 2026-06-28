// @author: claude | phase: 0 | contract: types
// @author: claude | phase: v0.2 | feat: dynamic-categories + hidden-tools + contextmenu
// ================================================================
// 37工具箱 插件系统核心类型定义
// 这是所有 AI（Codex / 前端AI）的共享契约。
// 修改本文件前必须先更新 总控计划.md §2.1。
// ================================================================

import type React from 'react';

// ======================================================================
// 一、动态分类系统（v0.2 重构）
// ======================================================================

/**
 * 分类定义。
 * v0.2 起分类不再是硬编码枚举，而是运行时可编辑的数据。
 * 内置分类不可删除、不可改 id。
 */
export interface CategoryDef {
  /** 唯一 ID，kebab-case。内置分类 id 固定为 'daily'/'image'/'text'/'dev'/'download'/'custom' */
  id: string;
  /** 显示名称 */
  label: string;
  /** 排序权重，数值越小越靠前 */
  order: number;
  /** 内置为 true 的分类不可删除、不可改 id */
  builtin: boolean;
}

/** 内置分类预设（侧边栏默认分类） */
export const BUILTIN_CATEGORIES: CategoryDef[] = [
  { id: 'daily',    label: '日常效率', order: 0, builtin: true },
  { id: 'image',    label: '图片处理', order: 1, builtin: true },
  { id: 'text',     label: '文本处理', order: 2, builtin: true },
  { id: 'dev',      label: '编码开发', order: 3, builtin: true },
  { id: 'download', label: '下载工具', order: 4, builtin: true },
  { id: 'custom',   label: '我的工具', order: 99, builtin: true },
];

/**
 * 工具分类。
 * v0.2 起不再是硬编码联合类型，改为 string 别名（向后兼容）。
 * 旧代码中 'daily' | 'image' | ... 的字面量仍可赋值。
 */
export type ToolCategory = string;

/**
 * @deprecated v0.2 起使用 BUILTIN_CATEGORIES + store.categories 动态获取。
 * 保留此常量用于旧代码迁移期兼容。
 */
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_CATEGORIES.map((c) => [c.id, c.label]),
);

/**
 * @deprecated v0.2 起使用 store.categories.sort(by order) 动态获取。
 * 保留此常量用于旧代码迁移期兼容。
 */
export const CATEGORY_ORDER: string[] = BUILTIN_CATEGORIES.map((c) => c.id);

/**
 * 根据分类 ID 获取显示名称。未找到时返回 id 本身。
 */
export function getCategoryLabel(categories: CategoryDef[], id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * 将分类列表按 order 排序后返回。
 */
export function sortCategories(categories: CategoryDef[]): CategoryDef[] {
  return [...categories].sort((a, b) => a.order - b.order);
}

// ======================================================================
// 二、工具运行时状态
// ======================================================================

/**
 * 工具运行时状态。
 * idle: 就绪 | running: 处理中 | success: 操作成功 | error: 操作失败
 */
export type ToolStatus = 'idle' | 'running' | 'success' | 'error';

// ======================================================================
// 三、插件清单（Manifest）
// ======================================================================

/**
 * 每个工具插件必须导出的清单对象。
 * 由 Codex 在 engine.ts 中定义并导出，前端 AI 只读。
 *
 * 字段约束：
 * - id:       唯一、kebab-case、不超过 30 字符、不与现有工具重名
 * - name:     显示名称，中文，不超过 8 字
 * - description: 一句话说明，不超过 20 字
 * - category: 所属分类 ID（v0.2 起为任意字符串，不限于内置分类）
 * - icon:     Lucide React 图标名，必须存在于 ToolIcon 映射中
 * - tags:     至少 2 个搜索关键词
 * - version:  语义化版本号
 */
export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  icon: string;
  tags: string[];
  hasSettings: boolean;
  /** 设置版本号，用于检测旧格式迁移。省略则视为 1。 */
  settingsVersion?: number;
  /** 默认设置值。仅 hasSettings 为 true 时需要。 */
  defaultSettings?: Record<string, unknown>;
  /** 第三层外部工具标记。true 时不需要 Tool.tsx，点击启动 execPath。 */
  external?: boolean;
  /** 外部工具的 .exe 路径（仅 external=true 时有效）。 */
  execPath?: string;
}

// ======================================================================
// 四、工具渲染接口
// ======================================================================

/**
 * 每个 Tool.tsx 的默认导出组件必须接受的 Props。
 * 由 PluginManager 渲染时注入，工具组件不需要自己获取。
 */
export interface ToolProps {
  /** 工具自身设置（由 PluginManager 按 toolsId 从 localStorage 恢复并注入） */
  settings: Record<string, unknown>;
  /** 更新设置，自动持久化到 localStorage（key: `37toolbox:{id}`） */
  onSettingsChange: (settings: Record<string, unknown>) => void;
  /** 通知框架工具状态变更。StatusBar 会显示对应文字。 */
  onStatusChange: (status: ToolStatus, message?: string) => void;
  /** 当前主题。工具组件一般不需要感知，直接使用 CSS 变量即可。 */
  theme: 'light' | 'dark';
  /** 工具是否为当前前台可见工具。后台常驻时可用来暂停键盘监听等前台交互。 */
  isActive?: boolean;
}

/**
 * 每个 Tool.tsx 模块的完整导出形状。
 * 即: import 某个 Tool.tsx 时得到的 module 对象。
 */
export interface ToolModule {
  manifest: ToolManifest;
  default: React.ComponentType<ToolProps>;
}

// ======================================================================
// 五、插件注册与加载
// ======================================================================

/**
 * 插件注册表条目，由 PluginManager 内部维护。
 * 外部代码不应直接构造，应通过 PluginManager.scan() 注册。
 */
export interface PluginRegistryEntry {
  manifest: ToolManifest;
  /** 动态加载器。内置工具: () => import('../plugins/{id}/Tool') */
  loader: () => Promise<ToolModule>;
  /** 加载后的模块缓存，避免重复 import */
  module?: ToolModule;
  /** 内置为 true，外部插件目录扫描的为 false */
  builtin: boolean;
  /** 外部插件的文件系统路径（内置工具为空字符串） */
  filePath?: string;
}

// ======================================================================
// 六、PluginManager API（内核对外唯一入口）
// ======================================================================

export interface PluginManagerAPI {
  /** 扫描并注册所有插件（内置目录 + ~/37工具箱/plugins/）。幂等，多次调用不会重复注册。 */
  scan(): Promise<void>;

  /** 获取全部已注册插件（按分类 order 排序，同分类按 name 字母序） */
  getAllPlugins(): PluginRegistryEntry[];

  /** 按分类 ID 过滤插件 */
  getPluginsByCategory(cat: string): PluginRegistryEntry[];

  /** 搜索插件。匹配 name、description、tags 中的任意字段（大小写不敏感） */
  search(query: string): PluginRegistryEntry[];

  /** 加载单个插件模块。返回 null 表示加载失败（id 不存在或模块加载出错） */
  loadPlugin(id: string): Promise<ToolModule | null>;

  /** 读取工具设置。无已保存设置时返回 manifest.defaultSettings 或空对象。 */
  getSettings(id: string): Record<string, unknown>;

  /** 更新工具设置并持久化 */
  updateSettings(id: string, settings: Record<string, unknown>): void;

  /** 获取当前激活的工具 ID。无激活工具时返回 null。 */
  getActiveToolId(): string | null;

  /** 激活指定工具。传 null 取消激活。 */
  setActiveTool(id: string | null): void;

  // ----- v0.2 新增 -----

  /** 获取隐藏工具 ID 集合 */
  getHiddenTools(): ReadonlySet<string>;

  /** 隐藏指定工具 */
  hideTool(id: string): void;

  /** 显示指定工具 */
  showTool(id: string): void;

  /** 工具是否已隐藏 */
  isToolHidden(id: string): boolean;

  /** 获取全部分类 */
  getCategories(): CategoryDef[];

  /** 新增自定义分类，返回新分类 ID */
  addCategory(label: string): string;

  /** 更新分类名称 */
  updateCategory(id: string, label: string): void;

  /** 删除分类（该分类下工具移到 custom） */
  removeCategory(id: string): void;

  /** 重排分类 */
  reorderCategory(id: string, newOrder: number): void;

  /** 将工具拖拽到另一个工具前后，用于持久化侧栏/仪表盘排序 */
  reorderTool(toolId: string, targetToolId: string, position?: 'before' | 'after'): void;

  /** 修改工具所属分类 */
  setToolCategory(toolId: string, categoryId: string): void;

  /** 卸载工具模块（清除缓存，释放内存） */
  unloadTool(id: string): void;

  /** 安装 .37tool 包（来自本地文件路径） */
  installFromPath(path: string): Promise<{ ok: boolean; error?: string }>;

  /** 安装 .37tool 包（来自 URL） */
  installFromUrl(url: string): Promise<{ ok: boolean; error?: string }>;

  /** 卸载外部安装的工具包 */
  uninstall(id: string): Promise<boolean>;

  /** 获取已安装的外部工具包列表 */
  getInstalledPackages(): InstalledPackage[];
}

// ======================================================================
// 七、Zustand 全局状态
// ======================================================================

/**
 * 全局 Zustand store 的形状。
 * 实现: src/stores/appStore.ts
 */
export interface AppStore {
  // --- 插件 ---
  plugins: PluginRegistryEntry[];
  /** 已加载到内存的工具 ID 列表（已点击使用过的工具），用于侧边栏绿色活动指示器 */
  loadedTools: string[];
  activeToolId: string | null;
  pluginSettings: Record<string, Record<string, unknown>>;
  toolStatus: Record<string, { status: ToolStatus; message?: string }>;

  // --- 可见性（v0.2 新增）---
  /** 被隐藏的工具 ID 集合，持久化 key: 37toolbox:hidden-tools */
  hiddenTools: string[];

  // --- 分类（v0.2 新增）---
  /** 当前全部分类（内置 + 用户自定义），持久化 key: 37toolbox:categories */
  categories: CategoryDef[];

  // --- UI ---
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  searchQuery: string;
  /** v0.2 起为 string[]，兼容任意分类 ID */
  collapsedCategories: string[];

  // --- Actions：插件 ---
  scanPlugins: () => Promise<void>;
  activateTool: (id: string) => void;
  setPluginSettings: (id: string, settings: Record<string, unknown>) => void;
  setToolStatus: (id: string, status: ToolStatus, message?: string) => void;

  // --- Actions：可见性 ---
  hideTool: (id: string) => void;
  showTool: (id: string) => void;
  isToolHidden: (id: string) => boolean;

  // --- Actions：生命周期 ---
  unloadTool: (id: string) => void;

  // --- Actions：分类 ---
  addCategory: (label: string) => string;
  updateCategory: (id: string, label: string) => void;
  removeCategory: (id: string) => void;
  reorderCategory: (id: string, newOrder: number) => void;
  reorderTool: (toolId: string, targetToolId: string, position?: 'before' | 'after') => void;
  setToolCategory: (toolId: string, categoryId: string) => void;

  // --- Actions：UI ---
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setSearchQuery: (q: string) => void;
  toggleCategory: (cat: string) => void;

  // --- Selectors ---
  /** 获取过滤后的插件（排除隐藏工具 + 搜索过滤） */
  getFilteredPlugins: () => PluginRegistryEntry[];
  /** 获取当前激活工具注册项 */
  getActivePlugin: () => PluginRegistryEntry | null;
  /** v0.2 新增：获取可见的插件（仅排除隐藏，不过滤搜索） */
  getVisiblePlugins: () => PluginRegistryEntry[];
}

// ======================================================================
// 八、ContextMenu 右键菜单类型（v0.2 新增）
// ======================================================================

/**
 * 右键菜单项。
 */
export interface ContextMenuItem {
  /** 唯一标识 */
  id: string;
  /** 显示文字 */
  label: string;
  /** ToolIcon 图标名，可选 */
  icon?: string;
  /** 快捷键提示，显示在右侧灰色小字 */
  shortcut?: string;
  /** 置灰不可点击 */
  disabled?: boolean;
  /** 危险操作（红色文字） */
  danger?: boolean;
  /** 此项为分割线（此时只需 id + separator 字段） */
  separator?: boolean;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * 右键菜单组件 Props。
 */
export interface ContextMenuProps {
  /** 菜单项列表 */
  items: ContextMenuItem[];
  /** 菜单显示位置（相对于视口） */
  position: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
}

// ======================================================================
// 九、Electron IPC 类型
// ======================================================================

/** 文件对话框过滤器（对应 Electron FileFilter） */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** 剪贴板抽象（引擎函数中可通过 ToolContext 获取） */
export interface ClipboardAPI {
  write(text: string): Promise<void>;
  read(): Promise<string>;
}

/** 文件操作抽象（引擎函数中可通过 ToolContext 获取） */
export interface FileAPI {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<boolean>;
  openDialog(filters?: FileFilter[]): Promise<string | null>;
  saveDialog(defaultName: string, filters?: FileFilter[]): Promise<string | null>;
}

/** 窗口控制抽象（v0.2 新增，MenuBar/TopBar 通过 IPC 调用） */
export interface WindowAPI {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

/** 工具引擎运行时可选的增强上下文（供未来扩展，当前 v1 不强制使用） */
export interface ToolContext {
  clipboard: ClipboardAPI;
  file: FileAPI;
  theme: 'light' | 'dark';
}

// ======================================================================
// 十、工具市场类型（v0.4）
// ======================================================================

/** 包格式版本 */
export const PACKET_FORMAT_VERSION = 1;

/** .37tool 包的 manifest.json 顶层结构 */
export interface PacketManifest {
  formatVersion: number;
  tool: ToolManifest;
  author?: { name?: string; email?: string; url?: string };
  entry: string;
  sandbox?: 'inherit' | 'isolated' | 'unsafe';
  assets?: string[];
  permissions: {
    file_read?: boolean;
    file_write?: boolean;
    clipboard?: boolean;
    network?: boolean;
    shell?: boolean;
    database?: boolean;
  };
  compatibility: { toolbox_min: string };
}

export const VALID_PERMISSIONS = ['file_read', 'file_write', 'clipboard', 'network', 'shell', 'database'] as const;
export type Permission = typeof VALID_PERMISSIONS[number];

/** 已安装工具包记录 */
export interface InstalledPackage {
  id: string;
  installPath: string;
  installDate: string;
  version: string;
  source: string;
}

/** PluginManager 市场接口 */
export interface MarketplaceAPI {
  installFromPath(path: string): Promise<{ ok: boolean; error?: string }>;
  installFromUrl(url: string): Promise<{ ok: boolean; error?: string }>;
  uninstall(id: string): Promise<boolean>;
  getInstalledPackages(): InstalledPackage[];
}

// ======================================================================
// 十一、通用工具类型
// ======================================================================

/** 标准结果包装。引擎函数推荐使用此类型。 */
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E };

/** 通用键值对 */
export type KVMap = Record<string, unknown>;

/** 异步操作状态 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
