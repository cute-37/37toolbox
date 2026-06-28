// @author: frontend-ai | phase: v0.4 | component: PermissionDialog
import React, { useMemo } from 'react';

import { validatePacket } from '../../core/packetValidator';
import type { PacketManifest, Permission } from '../../core/types';
import { VALID_PERMISSIONS } from '../../core/types';
import ToolIcon from '../icons/ToolIcon';
import { Button } from './Button';

export interface PermissionDialogProps {
  rawManifest?: unknown;
  fallbackName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const PERMISSION_META: Record<Permission, { label: string; description: string }> = {
  file_read: { label: '文件读取', description: '打开和读取本地文件' },
  file_write: { label: '文件写入', description: '写入和保存本地文件' },
  clipboard: { label: '剪贴板', description: '读写系统剪贴板' },
  network: { label: '网络', description: '访问外部网络地址' },
  shell: { label: '外部链接', description: '打开外部程序或链接' },
  database: { label: '本地存储', description: '使用本地持久化数据' },
};

function resolveManifest(rawManifest: unknown): PacketManifest | null {
  const result = validatePacket(rawManifest);
  return result.ok ? result.data : null;
}

/** 安装前展示工具请求的权限。 */
export const PermissionDialog: React.FC<PermissionDialogProps> = ({ rawManifest, fallbackName = '本地工具包', onCancel, onConfirm }) => {
  const manifest = useMemo(() => rawManifest ? resolveManifest(rawManifest) : null, [rawManifest]);
  const toolName = manifest?.tool.name ?? fallbackName;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onPointerDown={onCancel}>
      <div
        className="w-[440px] max-w-[calc(100vw-48px)] rounded-lg border border-border bg-bg-secondary p-6 shadow-xl"
        onPointerDown={(event): void => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent">
            <ToolIcon name="lock" size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">安装确认</h3>
            <p className="mt-0.5 text-xs text-text-secondary">请确认工具包权限后继续。</p>
          </div>
        </div>

        <p className="mt-5 text-sm text-text-secondary">
          「<span className="font-medium text-text-primary">{toolName}</span>」将请求以下权限：
        </p>

        <div className="mt-4 space-y-2">
          {VALID_PERMISSIONS.map((permission) => {
            const granted = manifest?.permissions[permission] === true;
            const unknown = !manifest;
            const meta = PERMISSION_META[permission];
            return (
              <div key={permission} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${granted ? 'border-status-success/25 bg-status-success/10' : 'border-border bg-bg-primary'}`}>
                <span className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ${granted ? 'text-status-success' : 'text-text-muted'}`}>
                  <ToolIcon name={granted ? 'check' : 'x'} size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${granted ? 'text-text-primary' : 'text-text-secondary'}`}>{meta.label}</p>
                  <p className="text-xs text-text-muted">{unknown ? '手动安装包将在安装器中校验该权限。' : granted ? meta.description : '不请求'}</p>
                </div>
              </div>
            );
          })}
        </div>

        {!manifest ? (
          <p className="mt-4 rounded-md border border-border bg-bg-primary px-3 py-2 text-xs text-text-secondary">
            当前前端无法预读 .37tool 包内 manifest。确认后会交给安装器校验包格式、入口文件和权限声明。
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="primary" onClick={onConfirm}>确认安装</Button>
        </div>
      </div>
    </div>
  );
};
