// @author: claude | phase: v0.2 | component: settings-panel-rewrite
// ================================================================
// 37工具箱 设置面板 — 侧边栏导航 + 分区域设置
// ================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getCategoryLabel, sortCategories } from '../../core/types';
import type { CategoryDef } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Button, Input, Select, Switch } from '../shared';
import { MarketplaceTab } from './MarketplaceTab';

// ======================================================================
// Types
// ======================================================================

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  initialSection?: SettingsSection;
}

type SettingsSection = 'appearance' | 'paths' | 'tools' | 'marketplace' | 'categories' | 'backup' | 'diagnostics' | 'about';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'paths', label: '路径', icon: 'folder-open' },
  { id: 'tools', label: '工具管理', icon: 'wrench' },
  { id: 'marketplace', label: '工具市场', icon: 'inbox' },
  { id: 'categories', label: '分类管理', icon: 'folder' },
  { id: 'backup', label: '配置备份', icon: 'inbox' },
  { id: 'diagnostics', label: '诊断', icon: 'bug' },
  { id: 'about', label: '关于', icon: 'circle-help' },
];

// ======================================================================
// Inline Edit Input
// ======================================================================

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

const InlineEdit: React.FC<InlineEditProps> = ({ value, onSave, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = (): void => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={text}
        onChange={(e): void => setText(e.target.value)}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
        className="h-7 w-32 rounded-sm border border-accent bg-bg-primary px-2 text-sm text-text-primary outline-none"
      />
      <button onClick={save} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-status-success hover:bg-bg-hover"><ToolIcon name="check" size={14} /></button>
      <button onClick={onCancel} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-status-error hover:bg-bg-hover"><ToolIcon name="x" size={14} /></button>
    </div>
  );
};

// ======================================================================
// Confirm Dialog
// ======================================================================

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel = '确认', danger, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onPointerDown={onCancel}>
    <div
      className="w-[380px] max-w-[calc(100vw-48px)] rounded-lg border border-border bg-bg-secondary p-6 shadow-xl"
      onPointerDown={(e): void => e.stopPropagation()}
    >
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button variant={danger ? 'primary' : 'primary'} onClick={onConfirm} className={danger ? 'bg-status-error hover:bg-status-error/80 border-status-error' : ''}>{confirmLabel}</Button>
      </div>
    </div>
  </div>
);

// ======================================================================
// Section: Appearance
// ======================================================================

const AppearanceSection: React.FC = () => {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">主题</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={(): void => { if (theme !== 'dark') toggleTheme(); }}
            className={`rounded-lg border-2 p-4 text-left transition ${theme === 'dark' ? 'border-accent bg-bg-active' : 'border-border bg-bg-primary hover:border-border-light'}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <ToolIcon name="moon" size={18} className={theme === 'dark' ? 'text-accent' : 'text-text-muted'} />
              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-text-primary' : 'text-text-secondary'}`}>暗色模式</span>
            </div>
            <div className="flex gap-1.5">
              <div className="h-5 w-5 rounded-sm bg-[#1a1a1f] ring-1 ring-inset ring-white/10" />
              <div className="h-5 w-5 rounded-sm bg-[#222228] ring-1 ring-inset ring-white/10" />
              <div className="h-5 w-5 rounded-sm bg-[#e8a850] ring-1 ring-inset ring-white/10" />
              <div className="h-5 w-5 rounded-sm bg-[#e4e4eb] ring-1 ring-inset ring-white/10" />
            </div>
          </button>
          <button
            onClick={(): void => { if (theme !== 'light') toggleTheme(); }}
            className={`rounded-lg border-2 p-4 text-left transition ${theme === 'light' ? 'border-accent bg-bg-active' : 'border-border bg-bg-primary hover:border-border-light'}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <ToolIcon name="sun" size={18} className={theme === 'light' ? 'text-accent' : 'text-text-muted'} />
              <span className={`text-sm font-medium ${theme === 'light' ? 'text-text-primary' : 'text-text-secondary'}`}>亮色模式</span>
            </div>
            <div className="flex gap-1.5">
              <div className="h-5 w-5 rounded-sm bg-[#f7f7f9] ring-1 ring-inset ring-black/10" />
              <div className="h-5 w-5 rounded-sm bg-[#ffffff] ring-1 ring-inset ring-black/10" />
              <div className="h-5 w-5 rounded-sm bg-[#e8a850] ring-1 ring-inset ring-black/10" />
              <div className="h-5 w-5 rounded-sm bg-[#202027] ring-1 ring-inset ring-black/10" />
            </div>
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">侧边栏</h3>
        <SidebarWidthSetting />
      </div>
    </div>
  );
};

const SidebarWidthSetting: React.FC = () => {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">侧边栏宽度</p>
          <p className="text-xs text-text-secondary">{sidebarWidth}px（范围 224–320）</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={224}
            max={320}
            value={sidebarWidth}
            onChange={(e): void => setSidebarWidth(Number(e.target.value))}
            className="h-1 w-24 accent-[var(--accent)]"
          />
          <span className="w-10 text-right font-mono text-sm text-text-primary">{sidebarWidth}</span>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// Section: Tool Visibility
// ======================================================================

const ToolsSection: React.FC = () => {
  const plugins = useAppStore((s) => s.plugins);
  const hiddenTools = useAppStore((s) => s.hiddenTools);
  const categories = useAppStore((s) => s.categories);
  const hideTool = useAppStore((s) => s.hideTool);
  const showTool = useAppStore((s) => s.showTool);
  const setToolCategory = useAppStore((s) => s.setToolCategory);
  const [search, setSearch] = useState('');

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.label, value: c.id })),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plugins;
    return plugins.filter((e) =>
      [e.manifest.name, e.manifest.description, ...e.manifest.tags].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
  }, [plugins, search]);

  const visibleCount = plugins.length - hiddenTools.length;
  const showAll = (): void => plugins.forEach((e) => showTool(e.manifest.id));
  const hideAll = (): void => plugins.forEach((e) => hideTool(e.manifest.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          value={search}
          onChange={(e): void => setSearch(e.target.value)}
          placeholder="搜索工具..."
          className="flex-1"
        />
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={showAll}>全部启用</Button>
          <Button variant="ghost" size="sm" onClick={hideAll}>全部关闭</Button>
        </div>
      </div>

      <p className="text-xs text-text-secondary">
        已启用 <span className="text-accent font-medium">{visibleCount}</span> / {plugins.length} 个工具。关闭的工具不会出现在侧边栏和仪表盘中。
      </p>

      <div className="space-y-1">
        {filtered.map((entry) => {
          const visible = !hiddenTools.includes(entry.manifest.id);
          return (
            <div
              key={entry.manifest.id}
              className={`grid grid-cols-[20px_minmax(0,1fr)_112px_auto] items-center gap-3 rounded-md border px-3 py-2 transition ${visible ? 'border-border bg-bg-primary' : 'border-border bg-bg-primary/40 opacity-60'}`}
            >
              <ToolIcon name={entry.manifest.icon} size={16} className={visible ? 'text-accent shrink-0' : 'text-text-muted shrink-0'} />
              <span className={`text-sm leading-none truncate ${visible ? 'text-text-primary' : 'text-text-muted'}`}>{entry.manifest.name}</span>
              <Select
                value={entry.manifest.category}
                onChange={(e): void => setToolCategory(entry.manifest.id, e.target.value)}
                options={categoryOptions}
                className="h-6 text-2xs py-0"
              />
              <div className="flex justify-end">
                <Switch
                  ariaLabel={`${visible ? '隐藏' : '显示'} ${entry.manifest.name}`}
                  checked={visible}
                  onChange={(checked): void => (checked ? showTool(entry.manifest.id) : hideTool(entry.manifest.id))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ======================================================================
// Section: Categories
// ======================================================================

const CategoriesSection: React.FC = () => {
  const plugins = useAppStore((s) => s.plugins);
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const removeCategory = useAppStore((s) => s.removeCategory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CategoryDef | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => sortCategories(categories), [categories]);
  const totalCount = categories.length;

  const toolCount = (catId: string): number =>
    plugins.filter((e) => e.manifest.category === catId).length;

  const startAdd = (): void => {
    setAdding(true);
    setNewName('');
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const commitAdd = (): void => {
    const trimmed = newName.trim();
    if (trimmed) {
      addCategory(trimmed);
    }
    setAdding(false);
    setNewName('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          {totalCount} 个分类（可自由删改）
        </p>
        <Button variant="primary" size="sm" onClick={startAdd}>
          <ToolIcon name="plus" size={14} />
          新建分类
        </Button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-accent bg-bg-primary p-3">
          <ToolIcon name="folder" size={16} className="text-accent" />
          <input
            ref={addInputRef}
            value={newName}
            onChange={(e): void => setNewName(e.target.value)}
            onKeyDown={(e): void => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
            placeholder="输入分类名称..."
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <button onClick={commitAdd} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-status-success hover:bg-bg-hover"><ToolIcon name="check" size={14} /></button>
          <button onClick={(): void => { setAdding(false); setNewName(''); }} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-muted hover:bg-bg-hover"><ToolIcon name="x" size={14} /></button>
        </div>
      )}

      {totalCount <= 6 && (
        <div className="rounded-lg border border-dashed border-border-light bg-bg-primary px-4 py-3">
          <p className="text-sm text-text-secondary">
            <ToolIcon name="lock" size={12} className="inline mr-1 text-text-muted" />
            所有分类均可自由删改。仅「未分类」为系统兜底不可删除。
          </p>
        </div>
      )}

      <div className="space-y-1">
        {sorted.map((category) => {
          const count = toolCount(category.id);
          const isEditing = editingId === category.id;
          const isFallback = category.id === '_uncategorized';
          return (
            <div
              key={category.id}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-bg-primary px-3 py-2.5 transition hover:border-border-light"
            >
              <ToolIcon
                name={isFallback ? 'lock' : 'folder'}
                size={15}
                className={isFallback ? 'text-text-muted shrink-0' : 'text-accent shrink-0'}
              />
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <InlineEdit
                    value={category.label}
                    onSave={(val): void => { updateCategory(category.id, val); setEditingId(null); }}
                    onCancel={(): void => setEditingId(null)}
                  />
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm leading-none text-text-primary">
                      {category.label}
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-text-muted">{count} 个工具</span>
                    {isFallback && (
                      <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-2xs text-text-muted">兜底</span>
                    )}
                  </div>
                )}
              </div>
              {!isEditing && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={(): void => setEditingId(category.id)}>重命名</Button>
                  {!isFallback && (
                    <Button variant="ghost" size="sm" onClick={(): void => setDeleteTarget(category)}>
                      <span className="whitespace-nowrap text-status-error">删除</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`删除「${deleteTarget.label}」`}
          message={`该分类下的 ${toolCount(deleteTarget.id)} 个工具将被移到「未分类」分类，确定删除？`}
          confirmLabel="删除"
          danger
          onConfirm={(): void => { removeCategory(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={(): void => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

// ======================================================================
// Section: Paths
// ======================================================================

type PathKey = 'download' | 'export' | 'temp';

const PATH_DEFAULTS: Record<PathKey, string> = {
  download: '',
  export: '',
  temp: '',
};

const PATH_LABELS: Record<PathKey, { label: string; desc: string }> = {
  download: { label: '默认下载目录', desc: '下载器保存文件的默认位置' },
  export: { label: '默认导出目录', desc: '图片压缩、二维码等工具的导出位置' },
  temp: { label: '临时文件目录', desc: '工具生成的临时文件存放位置（留空使用系统临时目录）' },
};

function loadPaths(): Record<string, string> {
  try {
    const raw = localStorage.getItem('37toolbox:paths');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePaths(paths: Record<string, string>): void {
  localStorage.setItem('37toolbox:paths', JSON.stringify(paths));
}

function collectToolboxSettings(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith('37toolbox:')) {
      const value = localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }
  return entries;
}

function parseToolboxSettingsBackup(content: string): Record<string, string> {
  const parsed = JSON.parse(content) as { entries?: unknown };
  if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  const entries: Record<string, string> = {};
  Object.entries(parsed.entries as Record<string, unknown>).forEach(([key, value]) => {
    if (key.startsWith('37toolbox:') && typeof value === 'string') {
      entries[key] = value;
    }
  });
  return entries;
}

const PathsSection: React.FC = () => {
  const [paths, setPaths] = useState<Record<string, string>>(loadPaths);
  const [error, setError] = useState<string | null>(null);

  const pickFolder = async (key: PathKey): Promise<void> => {
    setError(null);
    try {
      const result = await window.toolbox?.file?.openDirectory?.(PATH_LABELS[key].label);
      if (result) {
        const next = { ...paths, [key]: result };
        setPaths(next);
        savePaths(next);
      }
    } catch {
      setError('目录选择失败，请重试');
    }
  };

  const updatePath = (key: PathKey, value: string): void => {
    const next = { ...paths, [key]: value };
    setPaths(next);
    savePaths(next);
  };

  const resetPath = (key: PathKey): void => {
    const next = { ...paths };
    delete next[key];
    setPaths(next);
    savePaths(next);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-bg-primary px-4 py-3">
        <p className="text-sm text-text-secondary">
          设置工具常用的默认路径。留空表示使用系统默认位置。点击「浏览」通过文件对话框选择目录。
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</div>
      )}

      <div className="space-y-3">
        {(Object.keys(PATH_LABELS) as PathKey[]).map((key) => {
          const value = paths[key] ?? PATH_DEFAULTS[key];
          return (
            <div key={key} className="rounded-lg border border-border bg-bg-primary p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{PATH_LABELS[key].label}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{PATH_LABELS[key].desc}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={value}
                      onChange={(e): void => updatePath(key, e.target.value)}
                      placeholder="未设置（使用默认位置）"
                      className="flex-1 font-mono text-xs"
                    />
                    <Button variant="secondary" size="sm" onClick={(): void => { void pickFolder(key); }}>浏览</Button>
                    {value ? (
                      <Button variant="ghost" size="sm" onClick={(): void => resetPath(key)}>
                        <ToolIcon name="x" size={12} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ======================================================================
// Section: Backup
// ======================================================================

const BackupSection: React.FC = () => {
  const scanPlugins = useAppStore((s) => s.scanPlugins);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportSettings = async (): Promise<void> => {
    setStatus(null);
    setError(null);
    try {
      const path = await window.toolbox?.file?.saveDialog?.('37toolbox-settings.json', [{ name: 'JSON', extensions: ['json'] }]);
      if (!path) return;
      const payload = {
        schema: '37toolbox-settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: collectToolboxSettings(),
      };
      await window.toolbox?.file?.write?.(path, JSON.stringify(payload, null, 2));
      setStatus(`已导出到 ${path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    }
  };

  const importSettings = async (): Promise<void> => {
    setStatus(null);
    setError(null);
    try {
      const path = await window.toolbox?.file?.openDialog?.([{ name: 'JSON', extensions: ['json'] }]);
      if (!path) return;
      const content = await window.toolbox?.file?.read?.(path);
      if (!content) throw new Error('备份文件为空');
      const entries = parseToolboxSettingsBackup(content);
      Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
      await scanPlugins();
      setStatus('配置已导入。部分界面偏好会在重新打开应用后完全生效。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-bg-primary px-4 py-3">
        <p className="text-sm text-text-secondary">
          导出和导入工具箱本地配置，包括工具设置、隐藏工具、分类和默认路径。Pixiv 下载器的数据库文件请在 Pixiv 下载器设置页单独备份。
        </p>
      </div>

      {status && (
        <div className="rounded-md border border-status-success/30 bg-status-success/10 px-4 py-3 text-sm text-status-success">{status}</div>
      )}
      {error && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</div>
      )}

      <div className="rounded-lg border border-border bg-bg-primary p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">工具箱配置</p>
            <p className="mt-0.5 text-xs text-text-secondary">导入会覆盖同名本地设置。</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={exportSettings}>导出</Button>
            <Button variant="primary" size="sm" onClick={importSettings}>导入</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// Section: Diagnostics
// ======================================================================

const DiagnosticsSection: React.FC = () => {
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logFiles, setLogFiles] = useState<{ name: string; path: string }[]>([]);

  const generateReport = async (): Promise<void> => {
    setLoading(true);
    try {
      const text = await (window as any).toolbox?.app?.exportErrorReport?.() ?? '(无法生成)';
      setReport(typeof text === 'string' ? text : String(text));
      setLogsOpen(true);
    } catch { setReport('生成报告失败'); }
    setLoading(false);
  };

  const copyReport = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(report || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  useEffect(() => {
    generateReport();
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-bg-primary px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">错误诊断与报告</h3>
            <p className="mt-1 text-xs text-text-secondary">收集应用运行信息，方便反馈给开发者排查问题。</p>
          </div>
          <Button variant="primary" size="sm" onClick={generateReport}>刷新</Button>
        </div>

        <div className="flex gap-2 mb-3">
          <Button variant="secondary" size="sm" onClick={copyReport}>
            {copied ? '已复制' : '复制完整报告'}
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-text-muted">正在生成诊断报告...</p>
        ) : (
          <>
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg-sidebar p-3 font-mono text-2xs text-text-secondary leading-relaxed whitespace-pre-wrap select-all">
              {report || '(无诊断数据)'}
            </pre>
            {report.length > 0 && (
              <p className="mt-2 text-2xs text-text-muted">
                将上方报告复制发送给开发者以帮助排查问题。不包含个人信息。
              </p>
            )}
          </>
        )}
      </div>

      {/* 日志文件列表 */}
      <div className="rounded-lg border border-border bg-bg-primary px-5 py-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">日志文件</h3>
        <ul className="space-y-1 text-xs">
          {logFiles.length > 0 ? logFiles.map((f) => (
            <li key={f.name} className="flex items-center gap-2 rounded-sm px-2 py-1 bg-bg-secondary">
              <ToolIcon name="file-text" size={12} className="text-text-muted shrink-0" />
              <span className="truncate font-mono text-text-secondary flex-1">{f.name}</span>
              <span className="text-text-muted shrink-0">{f.path}</span>
            </li>
          )) : (
            <p className="text-text-muted">暂无日志文件（应用运行正常时会记录错误信息）。</p>
          )}
        </ul>
      </div>

      <p className="text-center text-2xs text-text-muted">
        日志保存路径: %APPDATA%/37工具箱/error-logs/
      </p>
    </div>
  );
};

// ======================================================================
// Section: About
// ======================================================================

const AboutSection: React.FC = () => (
  <div className="space-y-5">
    <div className="rounded-lg border border-border bg-bg-primary p-6 text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-accent-subtle">
        <span className="text-2xl font-bold text-accent">37</span>
      </div>
      <h3 className="text-lg font-bold text-text-primary">37工具箱</h3>
      <p className="mt-1 text-sm text-text-secondary">一个可扩展的桌面工具箱</p>
      <p className="mt-1 font-mono text-xs text-text-muted">版本 0.1.0</p>
    </div>

    <div className="rounded-lg border border-border bg-bg-primary p-5">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">技术栈</h4>
      <div className="flex flex-wrap gap-2">
        {['Electron 31', 'React 18', 'TypeScript 5', 'Vite 5', 'Tailwind CSS 3', 'Zustand 5', 'Lucide Icons'].map((tech) => (
          <span key={tech} className="rounded-sm bg-bg-secondary px-2.5 py-1 font-mono text-2xs text-text-secondary">{tech}</span>
        ))}
      </div>
    </div>

    <div className="rounded-lg border border-border bg-bg-primary p-5">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">协作 AI</h4>
      <div className="space-y-2 text-sm text-text-secondary">
        <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-accent" /><span className="text-text-primary">Claude</span> — 架构设计 · Spec 编写 · 代码审查</div>
        <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-status-info" /><span className="text-text-primary">Codex</span> — 后端引擎 · Electron · 构建打包</div>
        <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-status-success" /><span className="text-text-primary">Frontend AI</span> — UI 组件 · 交互设计 · 视觉实现</div>
      </div>
    </div>

    <p className="text-center text-2xs text-text-muted">Built with vibe coding · 2026</p>
  </div>
);

// ======================================================================
// Main Component
// ======================================================================

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose, initialSection = 'appearance' }) => {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  React.useEffect((): void => {
    if (open) {
      setSection(initialSection);
    }
  }, [initialSection, open]);

  if (!open) return null;

  const SectionComponent = {
    appearance: AppearanceSection,
    paths: PathsSection,
    tools: ToolsSection,
    marketplace: MarketplaceTab,
    categories: CategoriesSection,
    backup: BackupSection,
    diagnostics: DiagnosticsSection,
    about: AboutSection,
  }[section]!;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onPointerDown={onClose}>
      <div
        className="titlebar-no-drag flex h-[640px] max-h-[calc(100vh-80px)] w-[800px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-border bg-bg-sidebar shadow-2xl"
        onPointerDown={(e): void => e.stopPropagation()}
      >
        {/* Sidebar */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-border bg-bg-sidebar">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <ToolIcon name="settings" size={16} className="text-accent" />
            <span className="text-sm font-semibold text-text-primary">设置</span>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={(): void => setSection(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition ${
                  section === s.id
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <ToolIcon name={s.icon} size={15} />
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg-secondary">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
            <h2 className="text-base font-semibold text-text-primary">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <ToolIcon name="x" size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <SectionComponent />
          </div>
        </div>
      </div>
    </div>
  );
};
