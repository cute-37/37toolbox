// @author: codex | phase: v0.2 | core: plugin-manager
import { builtinPluginRegistry } from './pluginRegistry';
import { BUILTIN_CATEGORIES, FALLBACK_CATEGORY, sortCategories } from './types';
import type { CategoryDef, InstalledPackage, MarketCache, PacketManifest, PluginManagerAPI, PluginRegistryEntry, RemoteMarketIndex, RemoteToolEntry, ToolManifest, ToolModule } from './types';

const STORAGE_PREFIX = '37toolbox:';
const HIDDEN_TOOLS_KEY = `${STORAGE_PREFIX}hidden-tools`;
const CATEGORIES_KEY = `${STORAGE_PREFIX}categories`;
const TOOL_CATEGORIES_KEY = `${STORAGE_PREFIX}tool-categories`;
const TOOL_ORDER_KEY = `${STORAGE_PREFIX}tool-order`;
const INSTALLED_PACKAGES_KEY = `${STORAGE_PREFIX}installed`;
const MARKET_CACHE_KEY = `${STORAGE_PREFIX}market-cache`;

type InstalledPackageRecord = InstalledPackage & {
  name?: string;
  icon?: string;
  author?: string;
  permissions?: PacketManifest['permissions'];
};

/** 插件系统对外入口，负责注册、搜索、加载、分类和设置持久化。 */
export class PluginManager implements PluginManagerAPI {
  private registry = new Map<string, PluginRegistryEntry>();

  private activeToolId: string | null = null;

  private hiddenTools = new Set<string>();

  private categories: CategoryDef[] = [...BUILTIN_CATEGORIES];

  private toolCategories: Record<string, string> = {};

  private toolOrder: Record<string, number> = {};

  /** 扫描内置插件并恢复用户偏好。 */
  async scan(): Promise<void> {
    this.registry.clear();
    this.loadHiddenTools();
    this.loadCategories();
    this.loadToolCategories();
    this.loadToolOrder();
    this.sanitizeBuiltinToolCategories();
    builtinPluginRegistry.forEach((entry): void => {
      const category = this.toolCategories[entry.manifest.id] ?? entry.manifest.category;
      this.registry.set(entry.manifest.id, { ...entry, manifest: { ...entry.manifest, category } });
    });
    await this.scanExternalPlugins();
  }

  /** 获取全部插件并按分类顺序排序。 */
  getAllPlugins(): PluginRegistryEntry[] {
    return [...this.registry.values()].sort((left, right) => this.comparePluginEntries(left, right));
  }

  /** 按分类获取插件。 */
  getPluginsByCategory(cat: string): PluginRegistryEntry[] {
    return this.getAllPlugins().filter((entry) => entry.manifest.category === cat);
  }

  /** 搜索插件名称、描述和标签，并排除隐藏项。 */
  search(query: string): PluginRegistryEntry[] {
    const normalized = query.trim().toLowerCase();
    const visible = this.getAllPlugins().filter((entry) => !this.hiddenTools.has(entry.manifest.id));
    if (normalized.length === 0) {
      return visible;
    }

    return visible.filter((entry): boolean => {
      const fields = [entry.manifest.name, entry.manifest.description, ...entry.manifest.tags];
      return fields.some((field) => field.toLowerCase().includes(normalized));
    });
  }

  /** 懒加载插件模块并缓存结果。 */
  async loadPlugin(id: string): Promise<ToolModule | null> {
    const entry = this.registry.get(id);
    if (!entry) {
      return null;
    }

    if (entry.module) {
      return entry.module;
    }

    try {
      const module = await entry.loader();
      entry.module = module;
      this.registry.set(id, entry);
      return module;
    } catch (error) {
      console.error(`插件加载失败：${id}`, error);
      return null;
    }
  }

  /** 获取插件设置，优先读取 localStorage。含版本迁移逻辑。 */
  getSettings(id: string): Record<string, unknown> {
    const manifest = this.registry.get(id)?.manifest;
    const defaults = manifest?.defaultSettings ?? {};
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!saved) return defaults;

    let parsed: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(saved);
      parsed = isRecord(raw) ? raw : {};
    } catch (error) {
      console.error(`插件设置解析失败：${id}`, error);
      return defaults;
    }

    // 版本迁移: 比较已保存设置的 _v 和 manifest.settingsVersion
    const manifestVer = manifest?.settingsVersion ?? 1;
    const savedVer = typeof parsed._v === 'number' ? parsed._v : 0;
    if (savedVer < manifestVer) {
      // 旧格式: 用 defaults 补齐新字段, 保留用户已有值
      const migrated: Record<string, unknown> = { ...defaults, ...parsed, _v: manifestVer };
      localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(migrated));
      console.log(`[设置迁移] ${id}: v${savedVer} → v${manifestVer}`);
      return migrated;
    }

    return { ...defaults, ...parsed };
  }

  /** 更新插件设置并持久化。 */
  updateSettings(id: string, settings: Record<string, unknown>): void {
    const manifestVer = this.registry.get(id)?.manifest.settingsVersion ?? 1;
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify({ ...settings, _v: manifestVer }));
  }

  /** 获取当前激活工具 ID。 */
  getActiveToolId(): string | null {
    return this.activeToolId;
  }

  /** 设置当前激活工具。 */
  setActiveTool(id: string | null): void {
    this.activeToolId = id;
  }

  /** 获取隐藏工具集合。 */
  getHiddenTools(): ReadonlySet<string> {
    return new Set(this.hiddenTools);
  }

  /** 隐藏工具。 */
  hideTool(id: string): void {
    this.hiddenTools.add(id);
    this.saveHiddenTools();
    if (this.activeToolId === id) {
      this.activeToolId = null;
    }
  }

  /** 显示工具。 */
  showTool(id: string): void {
    this.hiddenTools.delete(id);
    this.saveHiddenTools();
  }

  /** 工具是否隐藏。 */
  isToolHidden(id: string): boolean {
    return this.hiddenTools.has(id);
  }

  /** 获取分类（兜底分类永远在末尾）。 */
  getCategories(): CategoryDef[] {
    const sorted = sortCategories(
      this.categories.filter((cat) => cat.id !== FALLBACK_CATEGORY.id),
    );
    const fallback = this.categories.find((cat) => cat.id === FALLBACK_CATEGORY.id);
    if (fallback) sorted.push(fallback);
    return sorted;
  }

  /** 新增分类。 */
  addCategory(label: string): string {
    const safeLabel = label.trim() || '新分类';
    const id = this.nextCategoryId();
    const maxOrder = Math.max(...this.categories.map((category) => category.order), 0);
    this.categories = [...this.categories, { id, label: safeLabel, order: maxOrder + 1, builtin: false }];
    this.normalizeCategoryOrder();
    this.saveCategories();
    return id;
  }

  /** 更新分类名称。 */
  updateCategory(id: string, label: string): void {
    const safeLabel = label.trim();
    if (!safeLabel) {
      return;
    }
    this.categories = this.categories.map((category) => (category.id === id ? { ...category, label: safeLabel } : category));
    this.saveCategories();
  }

  /** 删除分类，分类下工具自动移到"未分类"兜底。兜底分类自身不可删除。 */
  removeCategory(id: string): void {
    if (id === FALLBACK_CATEGORY.id) {
      return; // 兜底分类不可删除
    }
    const category = this.categories.find((item) => item.id === id);
    if (!category) {
      return;
    }
    this.categories = this.categories.filter((item) => item.id !== id);
    const fallbackId = FALLBACK_CATEGORY.id;
    this.ensureFallbackCategory();
    this.registry.forEach((entry, toolId): void => {
      if (entry.manifest.category === id) {
        this.setToolCategoryInMemory(toolId, fallbackId);
      }
    });
    this.normalizeCategoryOrder();
    this.saveCategories();
    this.saveToolCategories();
  }

  /** 重排分类。 */
  reorderCategory(id: string, newOrder: number): void {
    this.categories = this.categories.map((category) => (category.id === id ? { ...category, order: newOrder } : category));
    this.normalizeCategoryOrder();
    this.saveCategories();
  }

  /** 重排工具。只调整显示顺序，不隐式修改工具分类。 */
  reorderTool(toolId: string, targetToolId: string, position: 'before' | 'after' = 'before'): void {
    if (toolId === targetToolId) {
      return;
    }
    const source = this.registry.get(toolId);
    const target = this.registry.get(targetToolId);
    if (!source || !target) {
      return;
    }

    if (source.manifest.category !== target.manifest.category) {
      return;
    }

    const categoryId = target.manifest.category;
    const ordered = this.getAllPlugins().filter((entry) => entry.manifest.category === categoryId);
    const withoutSource = ordered.filter((entry) => entry.manifest.id !== toolId);
    const targetIndex = withoutSource.findIndex((entry) => entry.manifest.id === targetToolId);
    const sourceEntry = this.registry.get(toolId);
    if (!sourceEntry || targetIndex < 0) {
      return;
    }

    withoutSource.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, sourceEntry);
    withoutSource.forEach((entry, index) => {
      this.toolOrder[entry.manifest.id] = index;
    });
    this.saveToolOrder();
  }

  /** 卸载工具模块，释放内存。 */
  unloadTool(id: string): void {
    const entry = this.registry.get(id);
    if (!entry) return;
    entry.module = undefined;
    this.registry.set(id, entry);
    if (this.activeToolId === id) {
      this.activeToolId = null;
    }
  }

  /** 修改工具所属分类。 */
  setToolCategory(toolId: string, categoryId: string): void {
    if (!this.categories.some((category) => category.id === categoryId)) {
      return;
    }
    this.setToolCategoryInMemory(toolId, categoryId);
    this.saveToolCategories();
  }

  /** 安装 .37tool 包（来自本地文件路径）。 */
  async installFromPath(path: string): Promise<{ ok: boolean; error?: string }> {
    const marketApi = window.toolbox?.market;
    const appApi = window.toolbox?.app;
    if (!marketApi || !appApi?.getUserPluginsDir) {
      return { ok: false, error: '当前环境不支持工具市场安装' };
    }

    const inspected = await marketApi.inspectPackage(path);
    if (!inspected.ok || !isPacketManifest(inspected.packet)) {
      return { ok: false, error: inspected.error ?? '安装包校验失败' };
    }

    const toolId = inspected.packet.tool.id;
    if (this.registry.has(toolId)) {
      return { ok: false, error: `工具 ID 已存在: ${toolId}` };
    }

    const installed = await marketApi.installPackage(path, toolId);
    if (!installed.ok || !isInstalledPackage(installed.installed)) {
      return { ok: false, error: installed.error ?? '安装失败' };
    }

    const pluginsDir = await appApi.getUserPluginsDir();
    await this.registerExternalPlugin(pluginsDir, toolId);
    if (!this.registry.has(toolId)) {
      await marketApi.uninstallPackage(toolId);
      return { ok: false, error: '工具安装后无法注册，已回滚' };
    }

    this.saveInstalledPackage({
      ...installed.installed,
      name: inspected.packet.tool.name,
      icon: inspected.packet.tool.icon,
      author: inspected.packet.author?.name,
      permissions: inspected.packet.permissions,
    });
    return { ok: true };
  }

  /** 安装 .37tool 包（来自 URL）。 */
  async installFromUrl(url: string): Promise<{ ok: boolean; error?: string }> {
    const marketApi = window.toolbox?.market;
    if (!marketApi) {
      return { ok: false, error: '当前环境不支持工具市场安装' };
    }

    const downloaded = await marketApi.downloadPackage(url);
    if (!downloaded.ok || !downloaded.path) {
      return { ok: false, error: downloaded.error ?? '下载安装包失败' };
    }

    const result = await this.installFromPath(downloaded.path);
    if (!result.ok) {
      return result;
    }

    const latestId = this.findLatestInstalledId();
    if (latestId) {
      const packages = this.getInstalledPackages().map((item) => (item.id === latestId ? { ...item, source: url } : item));
      this.saveInstalledPackages(packages);
    }
    return { ok: true };
  }

  /** 卸载外部安装的工具包。 */
  async uninstall(id: string): Promise<boolean> {
    const entry = this.registry.get(id);
    if (!entry || entry.builtin) {
      return false;
    }

    const ok = await window.toolbox?.market?.uninstallPackage(id);
    if (!ok) {
      return false;
    }

    this.registry.delete(id);
    this.hiddenTools.delete(id);
    delete this.toolCategories[id];
    delete this.toolOrder[id];
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    this.saveHiddenTools();
    this.saveToolCategories();
    this.saveToolOrder();
    this.saveInstalledPackages(this.getInstalledPackages().filter((item) => item.id !== id));
    if (this.activeToolId === id) {
      this.activeToolId = null;
    }
    return true;
  }

  /** 获取已安装的外部工具包列表。 */
  getInstalledPackages(): InstalledPackage[] {
    const saved = localStorage.getItem(INSTALLED_PACKAGES_KEY);
    return readUnknownArray(saved).filter(isInstalledPackage);
  }

  private comparePluginEntries(left: PluginRegistryEntry, right: PluginRegistryEntry): number {
    const categories = this.getCategories();
    const leftCategory = categories.findIndex((category) => category.id === left.manifest.category);
    const rightCategory = categories.findIndex((category) => category.id === right.manifest.category);
    const leftOrder = leftCategory === -1 ? Number.MAX_SAFE_INTEGER : leftCategory;
    const rightOrder = rightCategory === -1 ? Number.MAX_SAFE_INTEGER : rightCategory;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    const leftToolOrder = this.toolOrder[left.manifest.id] ?? Number.MAX_SAFE_INTEGER;
    const rightToolOrder = this.toolOrder[right.manifest.id] ?? Number.MAX_SAFE_INTEGER;
    if (leftToolOrder !== rightToolOrder) {
      return leftToolOrder - rightToolOrder;
    }
    return left.manifest.name.localeCompare(right.manifest.name, 'zh-CN');
  }

  private setToolCategoryInMemory(toolId: string, categoryId: string): void {
    const entry = this.registry.get(toolId);
    if (!entry) {
      return;
    }
    this.toolCategories[toolId] = categoryId;
    this.registry.set(toolId, { ...entry, manifest: { ...entry.manifest, category: categoryId } });
  }

  private nextCategoryId(): string {
    let index = 1;
    let id = `custom-${index}`;
    while (this.categories.some((category) => category.id === id)) {
      index += 1;
      id = `custom-${index}`;
    }
    return id;
  }

  private normalizeCategoryOrder(): void {
    this.categories = sortCategories(this.categories).map((category, index) => ({ ...category, order: index }));
  }

  private loadHiddenTools(): void {
    const saved = localStorage.getItem(HIDDEN_TOOLS_KEY);
    this.hiddenTools = new Set(readStringArray(saved));
  }

  private saveHiddenTools(): void {
    localStorage.setItem(HIDDEN_TOOLS_KEY, JSON.stringify([...this.hiddenTools]));
  }

  private loadCategories(): void {
    const saved = localStorage.getItem(CATEGORIES_KEY);
    const parsed = readUnknownArray(saved).filter(isCategoryDef);
    // 保留用户自定义类别 + 首次安装用内置预设
    const userCategories = parsed.length > 0
      ? parsed.filter((cat) => cat.id !== FALLBACK_CATEGORY.id)
      : BUILTIN_CATEGORIES.filter((cat) => cat.id !== FALLBACK_CATEGORY.id);
    this.categories = sortCategories(userCategories);
    this.ensureFallbackCategory();
  }

  private saveCategories(): void {
    const withoutFallback = this.categories.filter((category) => category.id !== FALLBACK_CATEGORY.id);
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(withoutFallback));
  }

  private ensureFallbackCategory(): void {
    const exists = this.categories.some((cat) => cat.id === FALLBACK_CATEGORY.id);
    if (!exists) {
      this.categories.push({ ...FALLBACK_CATEGORY });
      this.normalizeCategoryOrder();
    }
  }

  private loadToolCategories(): void {
    const saved = localStorage.getItem(TOOL_CATEGORIES_KEY);
    this.toolCategories = readRecord(saved);
  }

  private saveToolCategories(): void {
    localStorage.setItem(TOOL_CATEGORIES_KEY, JSON.stringify(this.toolCategories));
  }

  private loadToolOrder(): void {
    const saved = localStorage.getItem(TOOL_ORDER_KEY);
    this.toolOrder = readNumberRecord(saved);
  }

  private saveToolOrder(): void {
    localStorage.setItem(TOOL_ORDER_KEY, JSON.stringify(this.toolOrder));
  }

  private sanitizeBuiltinToolCategories(): void {
    let changed = false;
    const builtinCategoryIds = new Set(BUILTIN_CATEGORIES.map((category) => category.id));
    builtinPluginRegistry.forEach((entry): void => {
      const override = this.toolCategories[entry.manifest.id];
      if (override && override !== entry.manifest.category && builtinCategoryIds.has(override)) {
        delete this.toolCategories[entry.manifest.id];
        changed = true;
      }
    });
    if (changed) {
      this.saveToolCategories();
    }
  }

  private async scanExternalPlugins(): Promise<void> {
    const appApi = window.toolbox?.app;
    const dirApi = window.toolbox?.dir;
    if (!appApi?.getUserPluginsDir || !dirApi?.scan) {
      return;
    }

    try {
      const pluginsDir = await appApi.getUserPluginsDir();
      const pluginDirs = await dirApi.scan(pluginsDir);
      await Promise.all(pluginDirs.map((pluginDir) => this.registerExternalPlugin(pluginsDir, pluginDir)));
    } catch (error) {
      console.error('外部插件扫描失败', error);
    }
  }

  private async registerExternalPlugin(pluginsDir: string, pluginDir: string): Promise<void> {
    const candidates = ['index.js', 'index.mjs'].map((fileName) => toFileUrl(`${pluginsDir}\\${pluginDir}\\${fileName}`));
    for (const moduleUrl of candidates) {
      const module = await importExternalModule(moduleUrl);
      if (!module) {
        continue;
      }

      const safeModule = ensureExternalModule(module);
      const manifestCategory = this.categories.some((category) => category.id === safeModule.manifest.category) ? safeModule.manifest.category : 'custom';
      const category = this.toolCategories[safeModule.manifest.id] ?? manifestCategory;
      this.registry.set(safeModule.manifest.id, {
        manifest: { ...safeModule.manifest, category },
        loader: async (): Promise<ToolModule> => safeModule,
        module: safeModule,
        builtin: false,
        filePath: moduleUrl,
      });
      return;
    }
  }

  private saveInstalledPackage(packageInfo: InstalledPackageRecord): void {
    const packages = this.getInstalledPackages().filter((item) => item.id !== packageInfo.id);
    packages.push(packageInfo);
    this.saveInstalledPackages(packages);
  }

  private saveInstalledPackages(packages: InstalledPackage[]): void {
    localStorage.setItem(INSTALLED_PACKAGES_KEY, JSON.stringify(packages));
  }

  private findLatestInstalledId(): string | null {
    const latest = [...this.getInstalledPackages()].sort((left, right) => right.installDate.localeCompare(left.installDate))[0];
    return latest?.id ?? null;
  }

  // ====== 远程市场 ======

  /** 从远程 URL 拉取工具市场 index，含 5 分钟本地缓存。 */
  async fetchRemoteIndex(sourceUrl: string): Promise<{ ok: true; index: RemoteMarketIndex } | { ok: false; error: string }> {
    const marketApi = window.toolbox?.market;
    if (!marketApi) return { ok: false, error: '当前环境不支持远程市场' };

    // 检查本地缓存
    try {
      const cacheRaw = localStorage.getItem(MARKET_CACHE_KEY);
      if (cacheRaw) {
        const cache: MarketCache = JSON.parse(cacheRaw);
        const age = Date.now() - new Date(cache.fetchedAt).getTime();
        if (cache.sourceUrl === sourceUrl && age < 5 * 60 * 1000) {
          return { ok: true, index: cache.index };
        }
      }
    } catch { /* cache invalid, refetch */ }

    const result = await marketApi.fetchIndex(sourceUrl);
    if (!result.ok || !result.index) {
      return { ok: false, error: (result as { error?: string }).error ?? '获取市场数据失败' };
    }

    const index = result.index as RemoteMarketIndex;

    // 写入缓存
    try {
      localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ sourceUrl, fetchedAt: new Date().toISOString(), index }));
    } catch { /* storage full, ignore */ }

    return { ok: true, index };
  }

  /** 获取缓存的远程市场数据（不发起请求）。 */
  getCachedIndex(): RemoteMarketIndex | null {
    try {
      const raw = localStorage.getItem(MARKET_CACHE_KEY);
      return raw ? (JSON.parse(raw) as MarketCache).index : null;
    } catch { return null; }
  }

  /** 在缓存的远程市场中搜索工具。 */
  searchRemoteTools(query: string): RemoteToolEntry[] {
    const cached = this.getCachedIndex();
    if (!cached) return [];
    const q = query.trim().toLowerCase();
    if (!q) return cached.tools;
    return cached.tools.filter((t) => {
      const fields = [t.name, t.description, ...t.tags];
      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }

  /** 从远程 URL 安装工具（下载 .37tool → installFromPath）。 */
  async installFromRemote(url: string, toolId: string, downloadUrl: string): Promise<{ ok: boolean; error?: string }> {
    return this.installFromUrl(downloadUrl);
  }
}

/** 默认插件管理器单例。 */
export const pluginManager = new PluginManager();

function readStringArray(saved: string | null): string[] {
  if (!saved) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readUnknownArray(saved: string | null): unknown[] {
  if (!saved) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readRecord(saved: string | null): Record<string, string> {
  if (!saved) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function readNumberRecord(saved: string | null): Record<string, number> {
  if (!saved) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
  } catch {
    return {};
  }
}

function isCategoryDef(value: unknown): value is CategoryDef {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && typeof value.order === 'number'
    && typeof value.builtin === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstalledPackage(value: unknown): value is InstalledPackage {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.installPath === 'string'
    && typeof value.installDate === 'string'
    && typeof value.version === 'string'
    && typeof value.source === 'string';
}

function isPacketManifest(value: unknown): value is PacketManifest {
  return isRecord(value)
    && typeof value.formatVersion === 'number'
    && isRecord(value.tool)
    && typeof value.entry === 'string'
    && isRecord(value.permissions)
    && isRecord(value.compatibility)
    && isToolManifest(value.tool);
}

async function importExternalModule(moduleUrl: string): Promise<ToolModule | null> {
  try {
    const module: unknown = await import(/* @vite-ignore */ moduleUrl);
    return isToolModule(module) ? module : null;
  } catch {
    return null;
  }
}

function isToolModule(value: unknown): value is ToolModule {
  if (!isRecord(value) || !isToolManifest(value.manifest)) {
    return false;
  }
  if (value.manifest.external === true && typeof value.manifest.execPath === 'string') {
    return true;
  }
  return typeof value.default === 'function' || (typeof value.default === 'object' && value.default !== null);
}

function ensureExternalModule(module: ToolModule): ToolModule {
  if (!module.manifest.external || module.default) {
    return module;
  }
  return {
    ...module,
    default: (): null => null,
  };
}

function isToolManifest(value: unknown): value is ToolManifest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    typeof value.version === 'string' &&
    typeof value.icon === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.hasSettings === 'boolean'
  );
}

function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withSlash).replace(/#/g, '%23')}`;
}
