// @author: frontend-ai | phase: v0.2 | component: Sidebar
import React, { useMemo, useState } from 'react';

import type { PluginRegistryEntry } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { SearchBox } from './SearchBox';
import { CategoryGroup } from './CategoryGroup';

/** 渲染可拖拽调宽的侧边栏。 */
export const Sidebar: React.FC = () => {
  const allPlugins = useAppStore((state) => state.plugins);
  const hiddenTools = useAppStore((state) => state.hiddenTools);
  const categories = useAppStore((state) => state.categories);
  const sidebarWidth = useAppStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarWidth = useAppStore((state) => state.setSidebarWidth);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const query = useAppStore((state) => state.searchQuery);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const effectiveSidebarWidth = sidebarCollapsed ? 44 : Math.max(224, sidebarWidth);

  const plugins = useMemo((): PluginRegistryEntry[] => {
    const normalized = query.trim().toLowerCase();
    const hidden = new Set(hiddenTools);
    const visible = allPlugins.filter((entry) => !hidden.has(entry.manifest.id));
    if (!normalized) {
      return visible;
    }
    return visible.filter((entry) => {
      const fields = [entry.manifest.name, entry.manifest.description, ...entry.manifest.tags];
      return fields.some((field) => field.toLowerCase().includes(normalized));
    });
  }, [allPlugins, hiddenTools, query]);

  const grouped = useMemo((): Record<string, PluginRegistryEntry[]> => {
    return categories.reduce((acc, category) => ({ ...acc, [category.id]: plugins.filter((entry) => entry.manifest.category === category.id) }), {} as Record<string, PluginRegistryEntry[]>);
  }, [categories, plugins]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (sidebarCollapsed) {
      return;
    }
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (isDragging) {
      setSidebarWidth(event.clientX);
    }
  };

  const handlePointerUp = (): void => setIsDragging(false);

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-bg-sidebar"
      style={{ width: effectiveSidebarWidth, transition: 'width 200ms ease, background-color 1s ease, color 0.6s ease, border-color 1s ease' }}
    >
      <div style={{ width: effectiveSidebarWidth, transition: 'opacity 120ms ease, background-color 1s ease, color 0.6s ease, border-color 1s ease' }} className="flex h-full min-w-0 flex-col whitespace-nowrap">
        <div className={`flex items-center gap-2 border-b border-border p-3 ${sidebarCollapsed ? 'justify-center px-1.5' : ''}`}>
          {!sidebarCollapsed ? <SearchBox compact className="min-w-0 flex-1" /> : null}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
          >
            <ToolIcon name={sidebarCollapsed ? 'panel-left' : 'panel-left-close'} size={16} />
          </button>
        </div>
        {!sidebarCollapsed ? (
          <>
            <nav className="min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-2 pr-3">
              {plugins.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs text-text-muted">
                  <ToolIcon name="inbox" size={26} />
                  <span>{query.trim() ? '未找到工具' : '暂无工具'}</span>
                </div>
              ) : categories.map((category) => <CategoryGroup key={category.id} category={category} entries={grouped[category.id] ?? []} />)}
            </nav>
            <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border px-3 text-2xs text-text-muted">
              <span>工具 {allPlugins.length}</span>
              <span>v0.1.0</span>
            </footer>
          </>
        ) : null}
      </div>
      {/* 拖拽手柄 — 独立不压内容区的条带 */}
      <div
        role="separator"
        aria-label="调整侧边栏宽度"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`absolute right-0 top-0 h-full w-[6px] ${sidebarCollapsed ? 'pointer-events-none hidden' : 'cursor-col-resize'} ${isDragging ? 'bg-accent/30' : 'hover:bg-accent/15'}`}
      />
    </aside>
  );
};
