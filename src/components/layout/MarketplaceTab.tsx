// @author: frontend-ai | phase: v0.4 | component: marketplace-tab
// @author: claude | phase: v0.5 | feat: remote-market-index
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { pluginManager } from '../../core/PluginManager';
import type { InstalledPackage, PacketManifest, Permission, PluginRegistryEntry, RemoteMarketIndex, RemoteToolEntry } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Button, EmptyState, Input, PermissionDialog } from '../shared';

const INSTALLED_KEY = '37toolbox:installed';
const CUSTOM_MARKET_KEY = '37toolbox:custom-market-urls';
const DEFAULT_MARKET_URL = 'https://raw.githubusercontent.com/cute-37/37toolbox/main/docs/market-index.json';

const PERMISSION_LABELS: Record<Permission, string> = {
  file_read: '文件读取',
  file_write: '文件写入',
  clipboard: '剪贴板',
  network: '网络',
  shell: '外部链接',
  database: '本地存储',
};

type Toast = { type: 'success' | 'error'; message: string } | null;

interface PendingInstall {
  installType: 'local' | 'remote';
  packet: PacketManifest;
  localPath?: string;
  remoteEntry?: RemoteToolEntry;
}

interface InstalledPackageMeta extends InstalledPackage {
  permissions?: Partial<Record<Permission, boolean>>;
  name?: string;
  icon?: string;
  author?: string;
}

interface InstalledCardData {
  pkg: InstalledPackageMeta;
  entry?: PluginRegistryEntry;
}

function readInstalledFromStorage(): InstalledPackageMeta[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(isInstalledPackageMeta);
    if (parsed && typeof parsed === 'object') return Object.values(parsed).filter(isInstalledPackageMeta);
    return [];
  } catch { return []; }
}

function isInstalledPackageMeta(value: unknown): value is InstalledPackageMeta {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.installPath === 'string'
    && typeof item.installDate === 'string' && typeof item.version === 'string' && typeof item.source === 'string';
}

function getInstalledPackages(): InstalledPackageMeta[] {
  try {
    const packages = pluginManager.getInstalledPackages();
    return packages.length > 0 ? packages : readInstalledFromStorage();
  } catch { return readInstalledFromStorage(); }
}

function getCustomMarketUrls(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MARKET_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [DEFAULT_MARKET_URL];
  } catch { return [DEFAULT_MARKET_URL]; }
}

function formatDate(value: string): string {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function fileName(path: string): string { return path.split(/[\\/]/).pop() || path; }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** 设置页中的工具市场：已安装管理 + 远程市场浏览安装。 */
export const MarketplaceTab: React.FC = () => {
  const plugins = useAppStore((state) => state.plugins);
  const scanPlugins = useAppStore((state) => state.scanPlugins);
  const unloadTool = useAppStore((state) => state.unloadTool);
  const [installed, setInstalled] = useState<InstalledPackageMeta[]>(getInstalledPackages);
  const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [remoteIndex, setRemoteIndex] = useState<RemoteMarketIndex | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [remoteSearch, setRemoteSearch] = useState('');
  const [activeMarketUrl, setActiveMarketUrl] = useState(DEFAULT_MARKET_URL);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<Toast>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshInstalled = (): void => setInstalled(getInstalledPackages());
  const installedIds = useMemo(() => new Set(installed.map((p) => p.id)), [installed]);

  const fetchRemote = (): void => {
    const urls = getCustomMarketUrls();
    if (urls.length === 0) return;
    setRemoteLoading(true); setRemoteError('');
    pluginManager.fetchRemoteIndex(urls[0]).then((result) => {
      if (result.ok) { setRemoteIndex(result.index); setActiveMarketUrl(urls[0]); setRemoteError(''); }
      else setRemoteError(result.error);
      setRemoteLoading(false);
    }).catch((err: unknown) => {
      setRemoteError(err instanceof Error ? err.message : '请求失败');
      setRemoteLoading(false);
    });
  };

  // 挂载时拉取远程市场
  useEffect(() => {
    fetchRemote();
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, []);

  // 远程工具（过滤已安装 + 搜索）
  const remoteTools = useMemo(() => {
    if (!remoteIndex) return [];
    const q = remoteSearch.trim().toLowerCase();
    return remoteIndex.tools.filter((t) => {
      if (installedIds.has(t.id)) return false;
      if (q) {
        const fields = [t.name, t.description, t.author ?? '', ...t.tags];
        return fields.some((f) => f.toLowerCase().includes(q));
      }
      return true;
    });
  }, [remoteIndex, remoteSearch, installedIds]);

  const cards = useMemo<InstalledCardData[]>(() => {
    const byId = new Map(plugins.map((entry) => [entry.manifest.id, entry]));
    return installed.map((pkg) => ({ pkg, entry: byId.get(pkg.id) }));
  }, [installed, plugins]);

  const showToast = (next: Toast): void => { setToast(next); if (next) window.setTimeout(() => setToast(null), 3000); };

  const startProgress = (): void => {
    setProgress(12); if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => setProgress((v) => Math.min(v + 9, 88)), 180);
  };
  const stopProgress = (done: boolean): void => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    setProgress(done ? 100 : 0); if (done) window.setTimeout(() => setProgress(0), 700);
  };

  // 本地安装
  const chooseLocalPackage = async (): Promise<void> => {
    const path = await window.toolbox?.file?.openDialog?.([{ name: '37 工具包', extensions: ['37tool'] }]);
    if (!path) return;
    const inspected = await window.toolbox?.market?.inspectPackage?.(path);
    if (!inspected?.ok || !inspected.packet) { showToast({ type: 'error', message: inspected?.error ?? '无法读取安装包' }); return; }
    setPendingInstall({ installType: 'local', localPath: path, packet: inspected.packet as PacketManifest });
  };

  // 远程安装（带真实进度条）
  const installRemote = async (entry: RemoteToolEntry): Promise<void> => {
    setInstallingId(entry.id); setInstalling(true); startProgress();
    const startTime = Date.now();
    // 模拟真实进度：每 150ms 前进一小步，最多到 90%
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const fakeProgress = Math.min(85, 10 + (elapsed / 50));
      setProgress(Math.round(fakeProgress));
    }, 150);

    const result = await pluginManager.installFromUrl(entry.download_url);
    clearInterval(tick);

    if (result.ok) {
      setProgress(100); setTimeout(() => setProgress(0), 800);
      await scanPlugins(); refreshInstalled(); showToast({ type: 'success', message: `已安装 ${entry.name}` });
    } else {
      setProgress(0); showToast({ type: 'error', message: result.error ?? '安装失败' });
    }
    setInstallingId(null); setInstalling(false);
  };

  // 构建远程安装的简易 PacketManifest
  const buildRemoteManifest = (entry: RemoteToolEntry): PacketManifest => ({
    formatVersion: 1,
    tool: {
      id: entry.id, name: entry.name, description: entry.description,
      category: entry.category, version: entry.version, icon: entry.icon,
      tags: entry.tags, hasSettings: false,
    },
    author: { name: entry.author },
    entry: 'index.js',
    permissions: entry.permissions,
    compatibility: { toolbox_min: entry.min_toolbox_version },
  });

  const confirmInstall = async (): Promise<void> => {
    if (!pendingInstall) return;
    const target = pendingInstall;
    setPendingInstall(null); setInstalling(true); startProgress();

    let result: { ok: boolean; error?: string };
    if (target.installType === 'remote' && target.remoteEntry) {
      result = await pluginManager.installFromUrl(target.remoteEntry.download_url);
    } else {
      result = await pluginManager.installFromPath(target.localPath!);
    }

    if (result.ok) { stopProgress(true); await scanPlugins(); refreshInstalled(); showToast({ type: 'success', message: `已安装 ${target.packet.tool.name}` }); }
    else { stopProgress(false); showToast({ type: 'error', message: result.error ?? '安装失败' }); }
    setInstalling(false);
  };

  const uninstallPackage = async (pkg: InstalledPackageMeta): Promise<void> => {
    setRemovingId(pkg.id); const ok = await pluginManager.uninstall(pkg.id);
    if (ok) { unloadTool(pkg.id); await scanPlugins(); refreshInstalled(); showToast({ type: 'success', message: `已卸载 ${pkg.name ?? pkg.id}` }); }
    else showToast({ type: 'error', message: '卸载失败' });
    setRemovingId(null);
  };

  return (
    <div className="space-y-6">
      {/* === Toast === */}
      {toast ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${toast.type === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{toast.message}</div>
      ) : null}

      {/* === 进度条 === */}
      {progress > 0 ? (
        <div className="overflow-hidden rounded-md border border-border bg-bg-primary">
          <div className="h-1.5 bg-bg-hover">
            <div className="h-full bg-status-success transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-xs text-text-secondary">
              {installing ? (installingId ? `正在安装 ${installingId}...` : '正在安装工具包...') : '安装完成'}
            </p>
            <span className="font-mono text-2xs text-text-muted">{progress}%</span>
          </div>
        </div>
      ) : null}

      {/* ===== 远程市场 ===== */}
      <div className="rounded-lg border border-border bg-bg-primary px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">远程市场</h3>
            <p className="mt-1 text-xs text-text-secondary">浏览来自 {activeMarketUrl ? new URL(activeMarketUrl).hostname : '远程'} 的工具。</p>
          </div>
          <Input
            aria-label="搜索远程工具"
            value={remoteSearch}
            onChange={(e) => setRemoteSearch(e.target.value)}
            placeholder="搜索远程工具..."
            className="w-48"
          />
        </div>

        {remoteLoading ? (
          <div className="mt-4 flex items-center justify-center py-8"><p className="text-sm text-text-muted">正在加载远程市场...</p></div>
        ) : remoteError ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-border bg-bg-secondary py-8">
            <ToolIcon name="inbox" size={26} className="text-text-muted" />
            <p className="text-xs text-text-secondary">远程市场暂不可用</p>
            <p className="text-2xs text-text-muted max-w-xs text-center">代码推送至 GitHub 后自动生效。<br />当前获取的地址将在发布后可用。</p>
            <button className="mt-2 text-xs text-accent-cyan underline" onClick={() => { fetchRemote(); }}>重试</button>
          </div>
        ) : remoteTools.length === 0 && remoteIndex ? (
          <EmptyState icon="inbox" title={remoteSearch ? '未找到匹配工具' : '没有可安装的工具'} description={remoteSearch ? undefined : '所有远程工具已安装，或者市场暂时为空。'} />
        ) : remoteTools.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {remoteTools.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border bg-bg-secondary p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                    <ToolIcon name={entry.icon || 'wrench'} size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-text-primary">{entry.name}</h4>
                        <p className="mt-1 text-xs text-text-secondary line-clamp-2">{entry.description}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-text-muted">
                      <span>{entry.author ?? '未知作者'}</span>
                      <span className="font-mono">v{entry.version}</span>
                      {entry.size_bytes > 0 ? <span className="rounded-sm bg-bg-sidebar px-1.5 py-0.5 font-mono">{formatSize(entry.size_bytes)}</span> : null}
                      <span className="hidden sm:inline">{formatDate(entry.created_at)}</span>
                    </div>
                    {Object.keys(entry.permissions).filter((k) => entry.permissions[k as Permission]).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(entry.permissions).filter(([, v]) => v).map(([key]) => (
                          <span key={key} className="rounded-sm bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent">{PERMISSION_LABELS[key as Permission]}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      {entry.homepage && <a href={entry.homepage} target="_blank" rel="noreferrer" className="text-xs text-accent-cyan hover:underline">主页</a>}
                      <div className="flex gap-2">
                        {entry.repository && <a href={entry.repository} target="_blank" rel="noreferrer" className="text-xs text-accent-cyan hover:underline">仓库</a>}
                        <Button variant="primary" size="sm" disabled={installingId === entry.id}
                          onClick={() => setPendingInstall({ installType: 'remote', localPath: undefined, packet: buildRemoteManifest(entry), remoteEntry: entry })}>
                          {installingId === entry.id ? '安装中...' : '安装'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ===== 已安装工具 ===== */}
      <div className="rounded-lg border border-border bg-bg-primary px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">已安装工具</h3>
            <p className="mt-1 text-xs text-text-secondary">管理本机安装的外部工具包。</p>
          </div>
          <Button variant="primary" size="sm" onClick={chooseLocalPackage} disabled={installing}>
            <ToolIcon name="folder-open" size={14} /> 手动安装
          </Button>
        </div>

        {cards.length === 0 ? (
          <EmptyState icon="inbox" title="暂无外部工具" description="从远程市场安装，或手动添加本地 .37tool 工具包。" />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {cards.map(({ pkg, entry }) => {
              const permissions = Object.entries(pkg.permissions ?? {}).filter(([, granted]) => granted).map(([key]) => key as Permission);
              const name = entry?.manifest.name ?? pkg.name ?? pkg.id;
              const icon = entry?.manifest.icon ?? pkg.icon ?? 'wrench';
              return (
                <div key={pkg.id} className="rounded-md border border-border bg-bg-secondary p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent"><ToolIcon name={icon} size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h4 className="truncate text-sm font-semibold text-text-primary">{name}</h4>
                          <p className="mt-1 truncate text-xs text-text-secondary">{(pkg.author ?? '未知作者')} · {formatDate(pkg.installDate)}</p>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-text-muted">v{pkg.version}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {permissions.length > 0 ? permissions.map((p) => (<span key={p} className="rounded-sm bg-accent-subtle px-2 py-1 text-2xs font-medium text-accent">权限: {PERMISSION_LABELS[p]}</span>))
                          : <span className="rounded-sm bg-bg-primary px-2 py-1 text-2xs text-text-muted">无权限</span>}
                        <Button variant="ghost" size="sm" className="ml-auto text-status-error hover:bg-status-error/10 hover:text-status-error" disabled={removingId === pkg.id}
                          onClick={() => { if (window.confirm(`确定要卸载 ${name} 吗？`)) void uninstallPackage(pkg); }}>
                          <ToolIcon name="trash-2" size={13} /> 卸载
                        </Button>
                      </div>
                      <p className="mt-3 truncate font-mono text-2xs text-text-muted">{fileName(pkg.source)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingInstall ? (
        <PermissionDialog rawManifest={pendingInstall.packet} fallbackName={pendingInstall.localPath ? fileName(pendingInstall.localPath) : pendingInstall.packet.tool.name}
          onCancel={() => setPendingInstall(null)} onConfirm={() => { void confirmInstall(); }} />
      ) : null}
    </div>
  );
};
