// @author: frontend-ai | phase: v0.2 | component: SidebarItem
import React, { useState } from 'react';

import { pluginManager } from '../../core/PluginManager';
import type { ContextMenuItem, PluginRegistryEntry } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { ContextMenu } from '../shared';

export interface SidebarItemProps {
  entry: PluginRegistryEntry;
}

/** 渲染侧栏单个工具入口。 */
export const SidebarItem: React.FC<SidebarItemProps> = ({ entry }) => {
  const activeToolId = useAppStore((state) => state.activeToolId);
  const loadedTools = useAppStore((state) => state.loadedTools);
  const activateTool = useAppStore((state) => state.activateTool);
  const unloadTool = useAppStore((state) => state.unloadTool);
  const reorderTool = useAppStore((state) => state.reorderTool);
  const scanPlugins = useAppStore((state) => state.scanPlugins);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [hoverClose, setHoverClose] = useState(false);
  const confirmTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExternal = entry.manifest.external === true;
  const isActive = activeToolId === entry.manifest.id;
  const isLoaded = loadedTools.includes(entry.manifest.id);

  const handleClick = () => {
    if (isExternal && entry.manifest.execPath) {
      window.toolbox?.shell?.openExternal(entry.manifest.execPath);
      return;
    }
    activateTool(entry.manifest.id);
  };

  const clearTimer = () => { if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null; } };
  const resetConfirm = () => { clearTimer(); setCloseConfirm(false); setHoverClose(false); };
  React.useEffect(() => { if (!isActive) resetConfirm(); }, [isActive]);

  const scheduleReset = () => {
    clearTimer();
    confirmTimer.current = setTimeout(() => { setCloseConfirm(false); setHoverClose(false); }, 2000);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (closeConfirm) { unloadTool(entry.manifest.id); resetConfirm(); }
    else { setCloseConfirm(true); setHoverClose(true); }
  };
  const getDropPosition = (event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };
  const openContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    const uninstallTool = async (): Promise<void> => {
      const confirmed = window.confirm(`确定要卸载 ${entry.manifest.name} 吗？`);
      if (!confirmed) return;
      const ok = await pluginManager.uninstall(entry.manifest.id);
      if (ok) {
        unloadTool(entry.manifest.id);
        await scanPlugins();
      } else {
        window.alert('卸载失败，请确认该工具不是内置工具');
      }
    };
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'open', label: isExternal ? '启动外部程序' : '打开工具', icon: entry.manifest.icon, onClick: (): void => handleClick() },
        { id: 'info', label: isExternal ? `外部 · ${entry.manifest.version}` : `版本 ${entry.manifest.version}`, icon: 'settings', disabled: true, onClick: (): void => undefined },
        ...(isLoaded && !isExternal ? [
          { id: 'sep', label: '', separator: true, onClick: (): void => undefined } as ContextMenuItem,
          { id: 'close', label: isActive ? '关闭并返回主页' : '关闭工具', icon: 'x', danger: true, onClick: (): void => unloadTool(entry.manifest.id) },
        ] : []),
        ...(!entry.builtin ? [
          { id: 'sep-uninstall', label: '', separator: true, onClick: (): void => undefined } as ContextMenuItem,
          { id: 'uninstall', label: '卸载工具', icon: 'trash-2', danger: true, onClick: (): void => { void uninstallTool(); } },
        ] : []),
      ],
    });
  };

  return (
    <div className="relative">
      {dropPosition === 'before' ? <div className="pointer-events-none absolute -top-1 left-2 right-2 z-10 h-0.5 rounded-full bg-accent shadow-[0_0_0_2px_rgba(184,140,66,0.18)]" /> : null}
      {dropPosition === 'after' ? <div className="pointer-events-none absolute -bottom-1 left-2 right-2 z-10 h-0.5 rounded-full bg-accent shadow-[0_0_0_2px_rgba(184,140,66,0.18)]" /> : null}
      <button
        type="button"
        draggable
        title={`${entry.manifest.name}：${entry.manifest.description}。按住可拖动排序。`}
        onDragStart={(event): void => {
          if (!isActive) { event.stopPropagation(); event.dataTransfer.setData('application/x-37-tool', entry.manifest.id); event.dataTransfer.effectAllowed = 'move'; }
        }}
        onDragEnd={(): void => setDropPosition(null)}
        onDragOver={(event): void => {
          if (event.dataTransfer.types.includes('application/x-37-tool')) {
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropPosition(getDropPosition(event));
          }
        }}
        onDragLeave={(): void => setDropPosition(null)}
        onDrop={(event): void => {
          event.preventDefault(); event.stopPropagation();
          const draggedId = event.dataTransfer.getData('application/x-37-tool');
          const position = getDropPosition(event); setDropPosition(null);
          if (draggedId && draggedId !== entry.manifest.id) reorderTool(draggedId, entry.manifest.id, position);
        }}
        onClick={handleClick}
        onContextMenu={openContextMenu}
        onMouseLeave={resetConfirm}
        className={`relative flex h-9 w-full cursor-grab items-center gap-2 rounded-sm px-3 text-left text-sm transition hover:bg-bg-hover active:cursor-grabbing ${
          isActive ? 'bg-bg-active text-text-primary before:absolute before:left-0 before:top-1 before:h-7 before:w-[3px] before:rounded-r-sm before:bg-accent' : 'text-text-secondary'
        }`}
      >
        <span className="relative flex-shrink-0">
          <ToolIcon name={entry.manifest.icon} size={16} />
          {isLoaded && !isExternal && (
            <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-bg-sidebar ${isActive ? 'bg-status-success animate-pulse' : 'bg-status-success'}`} />
          )}
        </span>
        <span className="truncate">{entry.manifest.name}</span>
        {isLoaded && !isExternal && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleCloseClick}
            onMouseEnter={() => { clearTimer(); setHoverClose(true); }}
            onMouseLeave={() => { setHoverClose(false); if (closeConfirm) scheduleReset(); else setCloseConfirm(false); }}
            className={`ml-auto flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full -mr-1.5 text-xs leading-none transition-[background-color,border-color] duration-200 select-none ${
              closeConfirm
                ? 'bg-status-error/15 border border-status-error/30'
                : hoverClose
                  ? 'text-text-secondary bg-bg-hover border border-border'
                  : ''
            }`}
            title={closeConfirm ? '再点一次确认关闭' : '关闭此工具'}
          >
            <span className="relative inline-flex items-center justify-center w-full h-full">
              <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: closeConfirm ? 1 : 0, transitionDuration: '800ms', color: 'var(--error)' }}>✓</span>
              <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: !closeConfirm && hoverClose ? 1 : 0, transitionDuration: '300ms', color: 'var(--text-secondary)' }}>×</span>
              <span className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out" style={{ opacity: !closeConfirm && !hoverClose ? 1 : 0, transitionDuration: '800ms' }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--text-muted)', opacity: 0.4 }} />
              </span>
            </span>
          </span>
        )}
      </button>
      {contextMenu ? <ContextMenu items={contextMenu.items} position={{ x: contextMenu.x, y: contextMenu.y }} onClose={(): void => setContextMenu(null)} /> : null}
    </div>
  );
};
