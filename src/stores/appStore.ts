// @author: codex | phase: v0.2 | store: app-state
import { create } from 'zustand';

import { pluginManager } from '../core/PluginManager';
import { BUILTIN_CATEGORIES } from '../core/types';
import type { AppStore, CategoryDef, ToolStatus } from '../core/types';

export const useAppStore = create<AppStore>((set, get) => ({
  plugins: [],
  activeToolId: null,
  pluginSettings: {},
  toolStatus: {},
  hiddenTools: [],
  loadedTools: [],
  categories: BUILTIN_CATEGORIES,
  theme: ((): 'light' | 'dark' => { try { const t = localStorage.getItem('37toolbox:theme'); return t === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } })(),
  sidebarCollapsed: false,
  sidebarWidth: 224,
  searchQuery: '',
  collapsedCategories: [],

  async scanPlugins(): Promise<void> {
    await pluginManager.scan();
    const plugins = pluginManager.getAllPlugins();
    const pluginSettings = Object.fromEntries(
      plugins.map((entry) => [entry.manifest.id, pluginManager.getSettings(entry.manifest.id)]),
    );
    set({
      plugins,
      activeToolId: null,
      pluginSettings,
      hiddenTools: [...pluginManager.getHiddenTools()],
      categories: pluginManager.getCategories(),
    });
  },

  activateTool(id: string): void {
    if (pluginManager.isToolHidden(id)) {
      pluginManager.showTool(id);
    }
    pluginManager.setActiveTool(id);
    set((state) => {
      const loaded = state.loadedTools.includes(id) ? state.loadedTools : [...state.loadedTools, id];
      return { activeToolId: id, loadedTools: loaded, hiddenTools: [...pluginManager.getHiddenTools()] };
    });
  },

  setPluginSettings(id: string, settings: Record<string, unknown>): void {
    pluginManager.updateSettings(id, settings);
    set((state) => ({ pluginSettings: { ...state.pluginSettings, [id]: settings } }));
  },

  setToolStatus(id: string, status: ToolStatus, message?: string): void {
    set((state) => ({ toolStatus: { ...state.toolStatus, [id]: { status, message } } }));
  },

  hideTool(id: string): void {
    pluginManager.hideTool(id);
    set((state) => ({
      activeToolId: state.activeToolId === id ? null : state.activeToolId,
      hiddenTools: [...pluginManager.getHiddenTools()],
    }));
  },

  showTool(id: string): void {
    pluginManager.showTool(id);
    set({ hiddenTools: [...pluginManager.getHiddenTools()] });
  },

  isToolHidden(id: string): boolean {
    return pluginManager.isToolHidden(id);
  },

  unloadTool(id: string): void {
    pluginManager.unloadTool(id);
    set((state) => ({
      loadedTools: state.loadedTools.filter((t) => t !== id),
      activeToolId: state.activeToolId === id ? null : state.activeToolId,
    }));
  },

  addCategory(label: string): string {
    const id = pluginManager.addCategory(label);
    set({ categories: pluginManager.getCategories() });
    return id;
  },

  updateCategory(id: string, label: string): void {
    pluginManager.updateCategory(id, label);
    set({ categories: pluginManager.getCategories() });
  },

  removeCategory(id: string): void {
    pluginManager.removeCategory(id);
    set({ plugins: pluginManager.getAllPlugins(), categories: pluginManager.getCategories() });
  },

  reorderCategory(id: string, newOrder: number): void {
    pluginManager.reorderCategory(id, newOrder);
    set({ categories: pluginManager.getCategories() });
  },

  reorderTool(toolId: string, targetToolId: string, position: 'before' | 'after' = 'before'): void {
    pluginManager.reorderTool(toolId, targetToolId, position);
    set({ plugins: pluginManager.getAllPlugins() });
  },

  setToolCategory(toolId: string, categoryId: string): void {
    pluginManager.setToolCategory(toolId, categoryId);
    set({ plugins: pluginManager.getAllPlugins() });
  },

  toggleTheme(): void {
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      try { localStorage.setItem('37toolbox:theme', theme); } catch {}
      return { theme };
    });
  },

  toggleSidebar(): void {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSidebarWidth(w: number): void {
    set({ sidebarWidth: Math.min(320, Math.max(224, w)) });
  },

  setSearchQuery(q: string): void {
    set({ searchQuery: q });
  },

  toggleCategory(cat: string): void {
    set((state) => {
      const exists = state.collapsedCategories.includes(cat);
      return {
        collapsedCategories: exists
          ? state.collapsedCategories.filter((item) => item !== cat)
          : [...state.collapsedCategories, cat],
      };
    });
  },

  getFilteredPlugins() {
    const query = get().searchQuery.trim().toLowerCase();
    const hidden = new Set(get().hiddenTools);
    const visible = get().plugins.filter((entry) => !hidden.has(entry.manifest.id));
    if (!query) {
      return visible;
    }
    return visible.filter((entry) => {
      const fields = [entry.manifest.name, entry.manifest.description, ...entry.manifest.tags];
      return fields.some((field) => field.toLowerCase().includes(query));
    });
  },

  getActivePlugin() {
    const activeToolId = get().activeToolId;
    return get().plugins.find((entry) => entry.manifest.id === activeToolId) ?? null;
  },

  getVisiblePlugins() {
    const hidden = new Set(get().hiddenTools);
    return get().plugins.filter((entry) => !hidden.has(entry.manifest.id));
  },
}));

export function getCategoryById(categories: CategoryDef[], id: string): CategoryDef | undefined {
  return categories.find((category) => category.id === id);
}
