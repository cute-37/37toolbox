// @author: frontend-ai | phase: v0.4 | component: marketplace-tab
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { pluginManager } from '../../core/PluginManager';
import type { InstalledPackage, PacketManifest, Permission, PluginRegistryEntry } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Button, EmptyState, PermissionDialog } from '../shared';

const INSTALLED_KEY = '37toolbox:installed';

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
  path: string;
  packet: PacketManifest;
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
    if (Array.isArray(parsed)) {
      return parsed.filter(isInstalledPackageMeta);
    }
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed).filter(isInstalledPackageMeta);
    }
    return [];
  } catch {
    return [];
  }
}

function isInstalledPackageMeta(value: unknown): value is InstalledPackageMeta {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.installPath === 'string'
    && typeof item.installDate === 'string'
    && typeof item.version === 'string'
    && typeof item.source === 'string';
}

function getInstalledPackages(): InstalledPackageMeta[] {
  try {
    const packages = pluginManager.getInstalledPackages();
    return packages.length > 0 ? packages : readInstalledFromStorage();
  } catch {
    return readInstalledFromStorage();
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** 设置页中的工具市场：安装、查看和卸载外部工具。 */
export const MarketplaceTab: React.FC = () => {
  const plugins = useAppStore((state) => state.plugins);
  const scanPlugins = useAppStore((state) => state.scanPlugins);
  const unloadTool = useAppStore((state) => state.unloadTool);
  const [installed, setInstalled] = useState<InstalledPackageMeta[]>(getInstalledPackages);
  const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<Toast>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshInstalled = (): void => setInstalled(getInstalledPackages());

  useEffect(() => {
    refreshInstalled();
    return (): void => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const cards = useMemo<InstalledCardData[]>(() => {
    const byId = new Map(plugins.map((entry) => [entry.manifest.id, entry]));
    return installed.map((pkg) => ({ pkg, entry: byId.get(pkg.id) }));
  }, [installed, plugins]);

  const showToast = (next: Toast): void => {
    setToast(next);
    if (next) {
      window.setTimeout(() => setToast(null), 3000);
    }
  };

  const startProgress = (): void => {
    setProgress(12);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((value) => Math.min(value + 9, 88));
    }, 180);
  };

  const stopProgress = (done: boolean): void => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setProgress(done ? 100 : 0);
    if (done) {
      window.setTimeout(() => setProgress(0), 700);
    }
  };

  const choosePackage = async (): Promise<void> => {
    const path = await window.toolbox?.file?.openDialog?.([{ name: '37 工具包', extensions: ['37tool'] }]);
    if (!path) return;

    const inspected = await window.toolbox?.market?.inspectPackage?.(path);
    if (!inspected?.ok || !inspected.packet) {
      showToast({ type: 'error', message: inspected?.error ?? '无法读取安装包 manifest' });
      return;
    }
    setPendingInstall({ path, packet: inspected.packet as PacketManifest });
  };

  const confirmInstall = async (): Promise<void> => {
    if (!pendingInstall) return;
    const target = pendingInstall;
    setPendingInstall(null);
    setInstalling(true);
    startProgress();

    const result = await pluginManager.installFromPath(target.path);
    if (result.ok) {
      stopProgress(true);
      await scanPlugins();
      refreshInstalled();
      showToast({ type: 'success', message: `已安装 ${target.packet.tool.name}` });
    } else {
      stopProgress(false);
      showToast({ type: 'error', message: result.error ?? '安装失败' });
    }
    setInstalling(false);
  };

  const uninstallPackage = async (pkg: InstalledPackageMeta): Promise<void> => {
    setRemovingId(pkg.id);
    const ok = await pluginManager.uninstall(pkg.id);
    if (ok) {
      unloadTool(pkg.id);
      await scanPlugins();
      refreshInstalled();
      showToast({ type: 'success', message: `已卸载 ${pkg.name ?? pkg.id}` });
    } else {
      showToast({ type: 'error', message: '卸载失败，请确认该工具不是内置工具' });
    }
    setRemovingId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-bg-primary px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">已安装工具</h3>
          <p className="mt-1 text-xs text-text-secondary">管理本机安装的 .37tool 外部工具包。</p>
        </div>
        <Button variant="primary" size="sm" onClick={choosePackage} disabled={installing}>
          <ToolIcon name="folder-open" size={14} />
          手动安装
        </Button>
      </div>

      {progress > 0 ? (
        <div className="overflow-hidden rounded-md border border-border bg-bg-primary">
          <div className="h-1 bg-bg-active">
            <div className="h-full bg-status-success transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="px-3 py-2 text-xs text-text-secondary">{installing ? '正在安装工具包...' : '安装完成'}</p>
        </div>
      ) : null}

      {toast ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${toast.type === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>
          {toast.message}
        </div>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState icon="inbox" title="暂无外部工具" description="点击手动安装添加本地 .37tool 工具包。" />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {cards.map(({ pkg, entry }) => {
            const permissions = Object.entries(pkg.permissions ?? {}).filter(([, granted]) => granted).map(([key]) => key as Permission);
            const name = entry?.manifest.name ?? pkg.name ?? pkg.id;
            const icon = entry?.manifest.icon ?? pkg.icon ?? 'wrench';
            return (
              <div key={pkg.id} className="rounded-md border border-border bg-bg-secondary p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                    <ToolIcon name={icon} size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-text-primary">{name}</h4>
                        <p className="mt-1 truncate text-xs text-text-secondary">
                          {(pkg.author ?? '未知作者')} · {formatDate(pkg.installDate)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-text-muted">v{pkg.version}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {permissions.length > 0 ? permissions.map((permission) => (
                        <span key={permission} className="rounded-sm bg-accent-subtle px-2 py-1 text-2xs font-medium text-accent">
                          权限: {PERMISSION_LABELS[permission]}
                        </span>
                      )) : (
                        <span className="rounded-sm bg-bg-primary px-2 py-1 text-2xs text-text-muted">权限未记录</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-status-error hover:bg-status-error/10 hover:text-status-error"
                        disabled={removingId === pkg.id}
                        onClick={(): void => {
                          if (window.confirm(`确定要卸载 ${name} 吗？`)) {
                            void uninstallPackage(pkg);
                          }
                        }}
                      >
                        <ToolIcon name="trash-2" size={13} />
                        卸载
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

      {pendingInstall ? (
        <PermissionDialog
          rawManifest={pendingInstall.packet}
          fallbackName={fileName(pendingInstall.path)}
          onCancel={(): void => setPendingInstall(null)}
          onConfirm={(): void => { void confirmInstall(); }}
        />
      ) : null}
    </div>
  );
};
