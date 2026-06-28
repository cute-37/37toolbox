// @author: frontend-ai | phase: v0.2 | component: Dashboard
import React, { useMemo, useState } from 'react';

import type { ContextMenuItem, PluginRegistryEntry } from '../../core/types';
import { getCategoryLabel } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { ContextMenu, EmptyState } from '../shared';
import { SearchBox } from './SearchBox';

const DASHBOARD_ORDER_KEY = '37toolbox:dashboard-order';

/** 渲染未激活工具时的仪表盘主页。 */
export const Dashboard: React.FC = () => {
  const allPlugins = useAppStore((state) => state.plugins);
  const hiddenTools = useAppStore((state) => state.hiddenTools);
  const loadedTools = useAppStore((state) => state.loadedTools);
  const categories = useAppStore((state) => state.categories);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const activateTool = useAppStore((state) => state.activateTool);
  const hideTool = useAppStore((state) => state.hideTool);
  const unloadTool = useAppStore((state) => state.unloadTool);
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [closeStates, setCloseStates] = useState<Record<string, 'dot' | 'hover' | 'confirm'>>({});
  const closeTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearCloseTimer = (id: string) => { if (closeTimers.current[id]) { clearTimeout(closeTimers.current[id]); delete closeTimers.current[id]; } };
  const scheduleReset = (id: string) => {
    clearCloseTimer(id);
    closeTimers.current[id] = setTimeout(() => {
      setCloseStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
      delete closeTimers.current[id];
    }, 2000);
  };
  const [dropIndicator, setDropIndicator] = useState<{ toolId: string; position: 'before' | 'after' } | null>(null);
  const [dashboardOrder, setDashboardOrder] = useState<string[]>(() => readDashboardOrder());

  const cards = useMemo((): PluginRegistryEntry[] => {
    const hidden = new Set(hiddenTools);
    const orderIndex = new Map(dashboardOrder.map((id, index) => [id, index]));
    const plugins = allPlugins
      .filter((entry) => !hidden.has(entry.manifest.id) && (categoryFilter.size === 0 || categoryFilter.has(entry.manifest.category)))
      .sort((left, right) => {
        const leftOrder = orderIndex.get(left.manifest.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderIndex.get(right.manifest.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return 0;
      });
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return plugins;
    }
    return plugins.filter((entry) => {
      const fields = [entry.manifest.name, entry.manifest.description, ...entry.manifest.tags];
      return fields.some((field) => field.toLowerCase().includes(query));
    });
  }, [allPlugins, dashboardOrder, hiddenTools, searchQuery, categoryFilter]);

  const reorderDashboardTool = (draggedId: string, targetId: string, position: 'before' | 'after'): void => {
    if (draggedId === targetId) return;
    setDashboardOrder((current) => {
      const allIds = allPlugins.map((entry) => entry.manifest.id);
      const visibleIds = cards.map((entry) => entry.manifest.id);
      const base = [
        ...current.filter((id) => allIds.includes(id)),
        ...allIds.filter((id) => !current.includes(id)),
      ];
      const sourceIndex = base.indexOf(draggedId);
      if (sourceIndex < 0) return current;
      base.splice(sourceIndex, 1);
      const visibleWithoutSource = visibleIds.filter((id) => id !== draggedId);
      const targetVisibleIndex = visibleWithoutSource.indexOf(targetId);
      const nextVisibleId = position === 'after' ? visibleWithoutSource[targetVisibleIndex + 1] : targetId;
      const insertIndex = nextVisibleId ? base.indexOf(nextVisibleId) : base.length;
      base.splice(insertIndex >= 0 ? insertIndex : base.length, 0, draggedId);
      localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(base));
      return base;
    });
  };

  const openContextMenu = (event: React.MouseEvent, entry: PluginRegistryEntry): void => {
    event.preventDefault();
    event.stopPropagation();
    const isLoaded = loadedTools.includes(entry.manifest.id) && !entry.manifest.external;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'open', label: entry.manifest.external ? '启动外部程序' : '打开工具', icon: entry.manifest.icon, onClick: (): void => {
          if (entry.manifest.external && entry.manifest.execPath) window.toolbox?.shell?.openExternal(entry.manifest.execPath);
          else activateTool(entry.manifest.id);
        }},
        ...(isLoaded ? [
          { id: 'sep', label: '', separator: true, onClick: (): void => undefined } as ContextMenuItem,
          { id: 'close', label: '关闭工具', icon: 'x', danger: true, onClick: (): void => unloadTool(entry.manifest.id) },
        ] : []),
        { id: 'hide', label: '隐藏工具', icon: 'x', danger: true, onClick: (): void => hideTool(entry.manifest.id) },
      ],
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">工具仪表盘</h2>
            <p className="mt-1 text-xs text-text-secondary">从这里快速打开常用工具。</p>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-border bg-bg-secondary p-3 sm:flex-row sm:items-center">
            <SearchBox className="w-full sm:w-[360px]" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <button
                type="button"
                title="显示全部工具"
                onClick={(): void => setCategoryFilter(new Set())}
                className={`h-8 rounded-sm border px-2 text-xs transition text-center ${categoryFilter.size === 0 ? 'border-accent bg-accent text-white' : 'border-border bg-bg-sidebar text-text-secondary hover:bg-bg-hover'}`}
              >
                全部
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  title={`${categoryFilter.has(category.id) ? '取消' : '只'}显示${category.label}分类`}
                  onClick={(): void => {
                    setCategoryFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(category.id)) next.delete(category.id);
                      else next.add(category.id);
                      return next;
                    });
                  }}
                  className={`h-8 rounded-sm border px-3 text-xs transition ${categoryFilter.has(category.id) ? 'border-accent bg-accent text-white' : 'border-border bg-bg-sidebar text-text-secondary hover:bg-bg-hover'}`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {cards.length === 0 ? (
          <EmptyState title="所有工具已隐藏，请到设置中开启" description="点击右上角设置按钮，进入工具可见性管理。" />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {cards.map((entry) => (
              <button
                key={entry.manifest.id}
                type="button"
                draggable
                title={`${entry.manifest.name}：${entry.manifest.description}。按住卡片可拖动排序。`}
                onDragStart={(event): void => {
                  event.dataTransfer.setData('application/x-37-tool', entry.manifest.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={(): void => setDropIndicator(null)}
                onDragOver={(event): void => {
                  if (event.dataTransfer.types.includes('application/x-37-tool')) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                    setDropIndicator({ toolId: entry.manifest.id, position });
                  }
                }}
                onDragLeave={(event): void => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDropIndicator((current) => current?.toolId === entry.manifest.id ? null : current);
                  }
                }}
                onDrop={(event): void => {
                  const draggedId = event.dataTransfer.getData('application/x-37-tool');
                  const position = dropIndicator?.toolId === entry.manifest.id ? dropIndicator.position : 'before';
                  setDropIndicator(null);
                  if (draggedId && draggedId !== entry.manifest.id) reorderDashboardTool(draggedId, entry.manifest.id, position);
                }}
                onClick={(): void => {
                  if (entry.manifest.external && entry.manifest.execPath) window.toolbox?.shell?.openExternal(entry.manifest.execPath);
                  else activateTool(entry.manifest.id);
                }}
                onContextMenu={(event): void => openContextMenu(event, entry)}
                className="group relative cursor-grab rounded-md border border-border bg-bg-secondary p-4 text-left shadow-sm transition hover:border-accent hover:shadow-md active:cursor-grabbing"
              >
                {dropIndicator?.toolId === entry.manifest.id ? (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-2 h-[calc(100%-16px)] w-1 rounded-full bg-accent shadow-[0_0_0_2px_rgba(191,143,61,0.18)] ${dropIndicator.position === 'before' ? 'left-[-10px]' : 'right-[-10px]'}`}
                  />
                ) : null}
                <span className="relative inline-flex">
                  <ToolIcon name={entry.manifest.icon} size={32} className="text-accent" />
                  {loadedTools.includes(entry.manifest.id) && !entry.manifest.external && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-bg-secondary bg-status-success animate-pulse" />
                  )}
                </span>
                <h3 className="mt-3 truncate font-medium text-text-primary">{entry.manifest.name}</h3>
                <p className="mt-1 truncate text-xs text-text-secondary">{entry.manifest.description}</p>
                <span className="mt-3 inline-flex rounded-sm bg-accent-subtle px-2 py-1 text-2xs text-text-secondary">
                  {getCategoryLabel(categories, entry.manifest.category)}
                </span>
                {loadedTools.includes(entry.manifest.id) && !entry.manifest.external && (
                  <span className="absolute bottom-2 right-2 flex items-center gap-1">
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e): void => {
                        e.stopPropagation();
                        const st = closeStates[entry.manifest.id] ?? 'dot';
                        if (st === 'confirm') { clearCloseTimer(entry.manifest.id); unloadTool(entry.manifest.id); setCloseStates((prev) => { const n = {...prev}; delete n[entry.manifest.id]; return n; }); }
                        else setCloseStates((prev) => ({...prev, [entry.manifest.id]: 'confirm'}));
                      }}
                      onMouseEnter={(): void => { clearCloseTimer(entry.manifest.id); setCloseStates((prev) => ({...prev, [entry.manifest.id]: prev[entry.manifest.id] === 'confirm' ? 'confirm' : 'hover'})); }}
                      onMouseLeave={(): void => { const cur = closeStates[entry.manifest.id] ?? 'dot'; if (cur === 'confirm') { scheduleReset(entry.manifest.id); } else { setCloseStates((prev) => { const n = {...prev}; delete n[entry.manifest.id]; return n; }); } }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs leading-none transition-[background-color,border-color] duration-200 select-none ${
                        (closeStates[entry.manifest.id] ?? 'dot') === 'confirm'
                          ? 'bg-status-error/15 border border-status-error/30'
                          : (closeStates[entry.manifest.id] ?? 'dot') === 'hover'
                            ? 'text-text-secondary bg-bg-hover border border-border'
                            : ''
                      }`}
                      title={(closeStates[entry.manifest.id] ?? 'dot') === 'confirm' ? '再点一次确认关闭' : '关闭此工具'}
                    >
                      <span className="relative inline-flex items-center justify-center w-full h-full">
                        <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: (closeStates[entry.manifest.id] ?? 'dot') === 'confirm' ? 1 : 0, transitionDuration: '800ms', color: 'var(--error)' }}>✓</span>
                        <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: (closeStates[entry.manifest.id] ?? 'dot') === 'hover' ? 1 : 0, transitionDuration: '300ms', color: 'var(--text-secondary)' }}>×</span>
                        <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: (closeStates[entry.manifest.id] ?? 'dot') !== 'confirm' && (closeStates[entry.manifest.id] ?? 'dot') !== 'hover' ? 1 : 0, transitionDuration: '800ms' }}>
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--text-muted)', opacity: 0.4 }} />
                        </span>
                      </span>
                  </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {contextMenu ? <ContextMenu items={contextMenu.items} position={{ x: contextMenu.x, y: contextMenu.y }} onClose={(): void => setContextMenu(null)} /> : null}
    </section>
  );
};

function readDashboardOrder(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DASHBOARD_ORDER_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
