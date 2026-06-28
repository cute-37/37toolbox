// @author: frontend-ai | phase: 2 | component: ToolWorkspace
import React, { Suspense, useCallback, useEffect, useState } from 'react';

import { pluginManager } from '../../core/PluginManager';
import type { ContextMenuItem, ToolModule, ToolStatus } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Button, ContextMenu, EmptyState, Tooltip } from '../shared';
import { Dashboard } from './Dashboard';
import { StatusBar } from './StatusBar';

/** 渲染当前激活工具的工作区。 */
export interface ToolWorkspaceProps {
  onOpenSettings: () => void;
}

interface ToolErrorBoundaryProps {
  toolId: string;
  name: string;
  onStatusChange: (toolId: string, status: ToolStatus, message?: string) => void;
  children: React.ReactNode;
}

interface ToolErrorBoundaryState {
  error: Error | null;
}

class ToolErrorBoundary extends React.Component<ToolErrorBoundaryProps, ToolErrorBoundaryState> {
  state: ToolErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ToolErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onStatusChange(this.props.toolId, 'error', error.message || '工具运行错误');
  }

  componentDidUpdate(prevProps: ToolErrorBoundaryProps): void {
    if (prevProps.toolId !== this.props.toolId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="rounded-md border border-status-error/30 bg-status-error/10 p-5 text-sm text-text-secondary">
        <h3 className="text-base font-semibold text-status-error">{this.props.name} 运行出错</h3>
        <p className="mt-2 font-mono text-xs">{this.state.error.message || '未知错误'}</p>
        <button
          type="button"
          onClick={(): void => this.setState({ error: null })}
          className="mt-4 inline-flex h-8 items-center rounded-sm bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
        >
          重试显示
        </button>
      </div>
    );
  }
}

interface MountedToolPaneProps {
  toolId: string;
  name: string;
  active: boolean;
  module: ToolModule | null | undefined;
  loading: boolean | undefined;
  settings: Record<string, unknown>;
  theme: 'light' | 'dark';
  onSettingsChange: (toolId: string, next: Record<string, unknown>) => void;
  onStatusChange: (toolId: string, status: ToolStatus, message?: string) => void;
}

const MountedToolPane: React.FC<MountedToolPaneProps> = ({
  toolId,
  name,
  active,
  module,
  loading,
  settings,
  theme,
  onSettingsChange,
  onStatusChange,
}) => {
  const ToolComponent = module?.default;
  const failed = module === null && !loading;
  const handleSettingsChange = useCallback((next: Record<string, unknown>): void => {
    onSettingsChange(toolId, next);
  }, [onSettingsChange, toolId]);
  const handleStatusChange = useCallback((status: ToolStatus, message?: string): void => {
    onStatusChange(toolId, status, message);
  }, [onStatusChange, toolId]);

  return (
    <div className={active ? 'block' : 'hidden'} data-tool-id={toolId}>
      {failed ? (
        <EmptyState title="工具加载失败" description={name} />
      ) : loading || !ToolComponent ? (
        <EmptyState title="正在加载工具" description={name} />
      ) : (
        <ToolErrorBoundary toolId={toolId} name={name} onStatusChange={onStatusChange}>
          <Suspense fallback={<EmptyState title="正在加载工具" />}>
            <ToolComponent
              settings={settings}
              onSettingsChange={handleSettingsChange}
              onStatusChange={handleStatusChange}
              theme={theme}
              isActive={active}
            />
          </Suspense>
        </ToolErrorBoundary>
      )}
    </div>
  );
};

/** 渲染当前激活工具的工作区。 */
export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ onOpenSettings }) => {
  const activeToolId = useAppStore((state) => state.activeToolId);
  const activePlugin = useAppStore((state) => state.getActivePlugin());
  const plugins = useAppStore((state) => state.plugins);
  const theme = useAppStore((state) => state.theme);
  const toolStatus = useAppStore((state) => state.toolStatus);
  const pluginSettings = useAppStore((state) => state.pluginSettings);
  const setToolStatus = useAppStore((state) => state.setToolStatus);
  const setPluginSettings = useAppStore((state) => state.setPluginSettings);
  const activateTool = useAppStore((state) => state.activateTool);
  const loadedTools = useAppStore((state) => state.loadedTools);
  const [openedToolIds, setOpenedToolIds] = useState<string[]>([]);
  const [modules, setModules] = useState<Record<string, ToolModule | null>>({});
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // 当工具被卸载时, 从 openedToolIds 和 modules 清除, 释放 DOM 和模块引用
  useEffect((): void => {
    const loadedSet = new Set(loadedTools);
    setOpenedToolIds((current) => current.filter((id) => loadedSet.has(id)));
    setModules((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!loadedSet.has(id)) { delete next[id]; changed = true; }
      }
      return changed ? next : current;
    });
    setLoadingById((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!loadedSet.has(id)) { delete next[id]; changed = true; }
      }
      return changed ? next : current;
    });
  }, [loadedTools]);

  useEffect((): void => {
    if (!activeToolId) {
      return;
    }
    const toolId = activeToolId;
    setOpenedToolIds((current) => current.includes(toolId) ? current : [...current, toolId]);
    setLoadingById((current) => current[toolId] ? current : { ...current, [toolId]: true });
    void pluginManager.loadPlugin(toolId).then((loaded) => {
      setModules((current) => ({ ...current, [toolId]: loaded }));
      setLoadingById((current) => ({ ...current, [toolId]: false }));
    }).catch(() => {
      setModules((current) => ({ ...current, [toolId]: null }));
      setLoadingById((current) => ({ ...current, [toolId]: false }));
    });
  }, [activeToolId]);

  const status = activeToolId ? toolStatus[activeToolId] ?? { status: 'idle' as const } : { status: 'idle' as const };
  const handleSettingsChange = useCallback((toolId: string, next: Record<string, unknown>): void => {
    setPluginSettings(toolId, next);
  }, [setPluginSettings]);
  const handleStatusChange = useCallback((toolId: string, nextStatus: ToolStatus, message?: string): void => {
    setToolStatus(toolId, nextStatus, message);
  }, [setToolStatus]);
  const openWorkspaceMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'refresh', label: '重新加载', icon: 'refresh-cw', shortcut: 'Ctrl+R', onClick: (): void => window.location.reload() },
        { id: 'new-tool', label: '新建工具', icon: 'plus', disabled: true, onClick: (): void => undefined },
      ],
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary" onContextMenu={openWorkspaceMenu}>
      {activePlugin && activeToolId ? (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
          <Tooltip content="返回仪表盘" side="bottom">
            <Button variant="ghost" size="sm" onClick={(): void => activateTool('')} aria-label="返回仪表盘" className="w-8 px-0">
              <ToolIcon name="panel-left" size={16} />
            </Button>
          </Tooltip>
          <ToolIcon name={activePlugin.manifest.icon} size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{activePlugin.manifest.name}</h2>
            <p className="truncate text-xs text-text-secondary">{activePlugin.manifest.description}</p>
          </div>
          {activePlugin.manifest.hasSettings ? (
            <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="工具设置" className="w-8 px-0">
              <ToolIcon name="settings" size={16} />
            </Button>
          ) : null}
        </header>
      ) : null}
      <div className={!activeToolId ? 'flex min-h-0 flex-1 overflow-hidden' : 'hidden'}>
        <Dashboard />
      </div>
      <div className={activeToolId ? 'min-h-0 flex-1 overflow-auto px-6 py-5' : 'hidden'}>
        {openedToolIds.map((toolId) => {
          const entry = plugins.find((item) => item.manifest.id === toolId);
          if (!entry) {
            return null;
          }
          return (
            <MountedToolPane
              key={toolId}
              toolId={toolId}
              name={entry.manifest.name}
              active={toolId === activeToolId}
              module={modules[toolId]}
              loading={loadingById[toolId]}
              settings={pluginSettings[toolId] ?? pluginManager.getSettings(toolId)}
              theme={theme}
              onSettingsChange={handleSettingsChange}
              onStatusChange={handleStatusChange}
            />
          );
        })}
      </div>
      <StatusBar status={status.status} message={status.message} />
      {contextMenu ? <ContextMenu items={contextMenu.items} position={{ x: contextMenu.x, y: contextMenu.y }} onClose={(): void => setContextMenu(null)} /> : null}
    </section>
  );
};
