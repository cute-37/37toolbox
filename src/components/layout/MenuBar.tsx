// @author: frontend-ai | phase: v0.2 | component: MenuBar
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { ContextMenuItem } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';

type MenuKey = 'file' | 'actions' | 'view' | 'window' | 'help';

interface MenuDef {
  id: MenuKey;
  label: string;
  items: ContextMenuItem[];
}

interface MenuBarProps {
  onOpenSettings: () => void;
}

const dispatchToolAction = (toolId: string, action: string): void => {
  window.dispatchEvent(new CustomEvent('toolbox:tool-action', { detail: { toolId, action } }));
};

const openPath = async (path: string | null | undefined): Promise<void> => {
  if (!path) return;
  const normalized = path.replace(/\\/g, '/');
  await window.toolbox?.shell?.openExternal(`file:///${encodeURI(normalized)}`);
};

/** 渲染应用级中文菜单栏。 */
export const MenuBar: React.FC<MenuBarProps> = ({ onOpenSettings }) => {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeToolId = useAppStore((state) => state.activeToolId);
  const activePlugin = useAppStore((state) => state.getActivePlugin());
  const activateTool = useAppStore((state) => state.activateTool);
  const scanPlugins = useAppStore((state) => state.scanPlugins);

  const activeToolName = activePlugin?.manifest.name ?? '当前工具';
  const toolActions = useMemo<ContextMenuItem[]>(() => getToolMenuItems(activeToolId, activeToolName), [activeToolId, activeToolName]);

  const menus = useMemo<MenuDef[]>(() => [
    {
      id: 'file',
      label: '文件',
      items: [
        { id: 'dashboard', label: '返回仪表盘', icon: 'panel-left', shortcut: 'Ctrl+P', onClick: (): void => activateTool('') },
        { id: 'settings', label: '打开设置', icon: 'settings', onClick: onOpenSettings },
        { id: 'plugin-dir', label: '打开插件目录', icon: 'folder-open', onClick: (): void => { void window.toolbox?.app?.getUserPluginsDir?.().then(openPath); } },
        { id: 'refresh-plugins', label: '刷新插件列表', icon: 'refresh-cw', onClick: (): void => { void scanPlugins(); } },
        { id: 'sep-1', label: '', separator: true, onClick: (): void => undefined },
        { id: 'quit', label: '退出', icon: 'x', shortcut: 'Alt+F4', onClick: (): void => { void window.toolbox?.app?.quit(); } },
      ],
    },
    {
      id: 'actions',
      label: '操作',
      items: toolActions,
    },
    {
      id: 'view',
      label: '视图',
      items: [
        { id: 'toggle-theme', label: '切换主题', icon: 'sun', onClick: (): void => { window.dispatchEvent(new CustomEvent('toolbox:global-action', { detail: { action: 'toggle-theme' } })); } },
        { id: 'reload', label: '重新加载应用', icon: 'refresh-cw', shortcut: 'Ctrl+R', onClick: (): void => { if (window.confirm('重新加载会重置部分运行中的工具状态，确定继续？')) window.location.reload(); } },
        { id: 'devtools', label: '开发者工具', icon: 'bug', shortcut: 'Ctrl+Shift+I', onClick: (): void => { void window.toolbox?.app?.toggleDevTools?.(); } },
      ],
    },
    {
      id: 'window',
      label: '窗口',
      items: [
        { id: 'minimize', label: '最小化', icon: 'minus', onClick: (): void => { void window.toolbox?.window?.minimize(); } },
        { id: 'maximize', label: '最大化/还原', icon: 'maximize-2', onClick: (): void => { void window.toolbox?.window?.toggleMaximize(); } },
        { id: 'close', label: '关闭窗口', icon: 'x', danger: true, onClick: (): void => { void window.toolbox?.window?.close(); } },
      ],
    },
    {
      id: 'help',
      label: '帮助',
      items: [
        {
          id: 'about',
          label: '关于 37工具箱',
          icon: 'circle-help',
          onClick: (): void => {
            void window.toolbox?.app?.getVersion?.().then((version) => window.alert(`37工具箱\n版本 ${version ?? '0.1.0'}`));
          },
        },
        {
          id: 'diagnostics',
          label: '复制诊断信息',
          icon: 'copy',
          onClick: (): void => {
            const info = [
              `37工具箱`,
              `activeTool=${activeToolId ?? 'dashboard'}`,
              `userAgent=${navigator.userAgent}`,
              `time=${new Date().toISOString()}`,
            ].join('\n');
            void window.toolbox?.clipboard?.write(info);
          },
        },
      ],
    },
  ], [activateTool, activeToolId, onOpenSettings, scanPlugins, toolActions]);

  useEffect((): (() => void) => {
    const close = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    return (): void => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="titlebar-no-drag relative z-20 flex h-8 shrink-0 items-center text-sm text-text-secondary">
      {menus.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            type="button"
            onClick={(): void => setOpenMenu((current) => current === menu.id ? null : menu.id)}
            onPointerEnter={(): void => {
              if (openMenu) setOpenMenu(menu.id);
            }}
            className={`h-7 rounded-sm px-2 transition hover:bg-bg-hover hover:text-text-primary ${openMenu === menu.id ? 'bg-bg-active text-text-primary' : ''}`}
          >
            {menu.label}
          </button>
          {openMenu === menu.id ? (
            <div className="absolute left-0 top-9 w-56 animate-[contextMenuIn_80ms_ease] rounded-md border border-border bg-bg-secondary p-1 shadow-lg">
              {menu.items.map((item) => item.separator ? (
                <div key={item.id} className="my-1 border-t border-border" />
              ) : (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={(): void => {
                    item.onClick();
                    setOpenMenu(null);
                  }}
                  className={`flex h-8 w-full items-center gap-2 rounded-sm px-3 text-left transition hover:bg-bg-hover disabled:pointer-events-none disabled:opacity-40 ${item.danger ? 'text-status-error' : 'text-text-primary'}`}
                >
                  {item.icon ? <ToolIcon name={item.icon} size={14} /> : <span className="w-3.5" />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.shortcut ? <span className="font-mono text-2xs text-text-muted">{item.shortcut}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

function getToolMenuItems(activeToolId: string | null, activeToolName: string): ContextMenuItem[] {
  if (!activeToolId) {
    return [
      { id: 'no-tool', label: '先打开一个工具', icon: 'circle-help', disabled: true, onClick: (): void => undefined },
    ];
  }

  const send = (action: string): (() => void) => () => dispatchToolAction(activeToolId, action);
  const commonHeader: ContextMenuItem = { id: 'current-tool', label: activeToolName, icon: 'wrench', disabled: true, onClick: (): void => undefined };
  const sep: ContextMenuItem = { id: 'sep', label: '', separator: true, onClick: (): void => undefined };

  const map: Record<string, ContextMenuItem[]> = {
    'markdown-preview': [
      commonHeader, sep,
      { id: 'md-bold', label: '加粗选中内容', icon: 'text-select', shortcut: 'Ctrl+B', onClick: send('bold') },
      { id: 'md-link', label: '插入链接', icon: 'plus', onClick: send('link') },
      { id: 'md-image', label: '插入图片', icon: 'image', onClick: send('image') },
      { id: 'md-copy-html', label: '复制 HTML', icon: 'copy', onClick: send('copy-html') },
      { id: 'md-export-html', label: '导出 HTML', icon: 'folder-open', onClick: send('export-html') },
    ],
    'text-diff': [
      commonHeader, sep,
      { id: 'diff-paste-left', label: '粘贴到左侧', icon: 'clipboard', onClick: send('paste-left') },
      { id: 'diff-paste-right', label: '粘贴到右侧', icon: 'clipboard', onClick: send('paste-right') },
      { id: 'diff-left-file', label: '打开左侧文件', icon: 'folder-open', onClick: send('left-file') },
      { id: 'diff-right-file', label: '打开右侧文件', icon: 'folder-open', onClick: send('right-file') },
      { id: 'diff-swap', label: '交换左右', icon: 'refresh-cw', onClick: send('swap') },
      { id: 'diff-clear', label: '清空', icon: 'trash-2', onClick: send('clear') },
    ],
    'json-formatter': [
      commonHeader, sep,
      { id: 'json-load', label: '从文件加载', icon: 'folder-open', onClick: send('load') },
      { id: 'json-format', label: '格式化', icon: 'braces', onClick: send('format') },
      { id: 'json-minify', label: '压缩', icon: 'braces', onClick: send('minify') },
      { id: 'json-sort', label: '排序 Key', icon: 'refresh-cw', onClick: send('sort') },
      { id: 'json-copy', label: '复制结果', icon: 'copy', onClick: send('copy') },
      { id: 'json-save', label: '保存结果', icon: 'folder-open', onClick: send('save') },
      { id: 'json-clear', label: '清空', icon: 'trash-2', onClick: send('clear') },
    ],
    'image-compress': [
      commonHeader, sep,
      { id: 'image-add', label: '添加图片', icon: 'image', onClick: send('add-images') },
      { id: 'image-clear', label: '清空队列', icon: 'trash-2', onClick: send('clear') },
    ],
    'color-picker': [
      commonHeader, sep,
      { id: 'color-pick', label: '屏幕吸色', icon: 'pipette', onClick: send('pick-screen') },
      { id: 'color-copy-hex', label: '复制 HEX', icon: 'copy', onClick: send('copy-hex') },
      { id: 'color-copy-rgb', label: '复制 RGB', icon: 'copy', onClick: send('copy-rgb') },
      { id: 'color-copy-hsl', label: '复制 HSL', icon: 'copy', onClick: send('copy-hsl') },
      { id: 'color-save', label: '收藏当前颜色', icon: 'plus', onClick: send('save-color') },
    ],
    base64: [
      commonHeader, sep,
      { id: 'base64-encode', label: '编码', icon: 'binary', onClick: send('encode') },
      { id: 'base64-decode', label: '解码', icon: 'binary', onClick: send('decode') },
      { id: 'base64-copy', label: '复制输出', icon: 'copy', onClick: send('copy') },
    ],
  };

  return map[activeToolId] ?? [
    commonHeader, sep,
    { id: 'unsupported', label: '当前工具暂无菜单操作', icon: 'circle-help', disabled: true, onClick: (): void => undefined },
  ];
}
