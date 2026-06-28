// @author: frontend-ai | phase: 2 | component: TopBar
import React, { useEffect } from 'react';

import logo37 from '../../assets/logo-37-app.png';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Button, Tooltip } from '../shared';
import { MenuBar } from './MenuBar';

export interface TopBarProps {
  onOpenSettings: () => void;
}

/** 渲染应用顶部栏。 */
export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const activateTool = useAppStore((state) => state.activateTool);
  const activePlugin = useAppStore((state) => state.getActivePlugin());
  const loadedTools = useAppStore((state) => state.loadedTools);
  const minimize = (): void => { void window.toolbox?.window?.minimize(); };
  const toggleMaximize = (): void => { void window.toolbox?.window?.toggleMaximize(); };
  const close = (): void => { void window.toolbox?.window?.close(); };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'toggle-theme') toggleTheme();
    };
    window.addEventListener('toolbox:global-action', handler);
    return (): void => window.removeEventListener('toolbox:global-action', handler);
  }, [toggleTheme]);

  return (
    <header className="titlebar relative z-10 flex h-12 shrink-0 items-center border-b border-border bg-bg-sidebar px-2 shadow-sm">
      <div className="titlebar-no-drag flex shrink-0 items-center gap-2">
        <Tooltip content="返回仪表盘" side="bottom">
          <Button variant="ghost" size="sm" onClick={(): void => activateTool('')} aria-label="仪表盘" className="h-9 w-[138px] justify-start px-1.5">
            <div className="flex items-center gap-2">
              <img src={logo37} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover shadow-sm" />
              <span className="truncate text-base font-bold text-text-primary">37工具箱</span>
            </div>
          </Button>
        </Tooltip>
        <MenuBar onOpenSettings={onOpenSettings} />
      </div>
      <div className="titlebar-drag flex min-w-0 flex-1 items-center justify-center h-full">
        {activePlugin && (
          <div className="hidden sm:flex items-center gap-2 rounded-md bg-bg-hover/60 px-3 py-1">
            <span className="relative flex-shrink-0">
              <ToolIcon name={activePlugin.manifest.icon} size={14} className="text-accent" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-bg-sidebar bg-status-success animate-pulse" />
            </span>
            <span className="truncate text-xs font-medium text-text-primary max-w-[200px]">{activePlugin.manifest.name}</span>
          </div>
        )}
      </div>
      <div className="titlebar-no-drag flex shrink-0 items-center justify-end gap-1">
        <Tooltip content="切换主题" side="bottom">
          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="切换主题" className="w-8 px-0">
            <ToolIcon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="设置" side="bottom">
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="设置" className="w-8 px-0">
            <ToolIcon name="settings" size={16} />
          </Button>
        </Tooltip>
        {/* Windows 风格窗口控制按钮 */}
        <div className="ml-2 flex items-center">
          <button type="button" aria-label="最小化窗口" onClick={minimize} className="inline-flex h-8 w-11 items-center justify-center rounded-none text-text-secondary transition hover:bg-bg-hover hover:text-text-primary">
            <ToolIcon name="minus" size={14} />
          </button>
          <button type="button" aria-label="最大化窗口" onClick={toggleMaximize} className="inline-flex h-8 w-11 items-center justify-center rounded-none text-text-secondary transition hover:bg-bg-hover hover:text-text-primary">
            <ToolIcon name="maximize-2" size={12} />
          </button>
          <button type="button" aria-label="关闭窗口" onClick={close} className="inline-flex h-8 w-11 items-center justify-center rounded-none text-text-secondary transition hover:bg-status-error hover:text-white">
            <ToolIcon name="x" size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
