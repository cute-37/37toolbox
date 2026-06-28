// @author: claude | phase: v0.4 | core: packet-validator
// ================================================================
// .37tool 包校验引擎 — 独立于 PluginManager 的纯函数
// ================================================================

import type { PacketManifest } from './types';
import { PACKET_FORMAT_VERSION, VALID_PERMISSIONS } from './types';

/** 校验错误 */
export interface ValidationError {
  field: string;
  message: string;
}

/** 校验 .37tool 包的 manifest.json */
export function validatePacket(json: unknown): { ok: true; data: PacketManifest } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: [{ field: 'root', message: 'manifest.json 必须是 JSON 对象' }] };
  }

  const obj = json as Record<string, unknown>;

  // formatVersion
  if (typeof obj.formatVersion !== 'number' || obj.formatVersion !== PACKET_FORMAT_VERSION) {
    errors.push({ field: 'formatVersion', message: `formatVersion 必须为 ${PACKET_FORMAT_VERSION}` });
  }

  // tool
  if (!obj.tool || typeof obj.tool !== 'object') {
    errors.push({ field: 'tool', message: '缺少 tool 字段' });
  } else {
    const tool = obj.tool as Record<string, unknown>;
    if (typeof tool.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tool.id)) {
      errors.push({ field: 'tool.id', message: 'tool.id 必须是 kebab-case' });
    }
    if (typeof tool.name !== 'string' || !tool.name.trim()) {
      errors.push({ field: 'tool.name', message: 'tool.name 不能为空' });
    }
    if (typeof tool.description !== 'string' || !tool.description.trim()) {
      errors.push({ field: 'tool.description', message: 'tool.description 不能为空' });
    }
    if (typeof tool.category !== 'string' || !tool.category.trim()) {
      errors.push({ field: 'tool.category', message: 'tool.category 不能为空' });
    }
    if (typeof tool.version !== 'string' || !/^\d+\.\d+\.\d+/.test(tool.version)) {
      errors.push({ field: 'tool.version', message: 'tool.version 必须是语义化版本 (如 1.0.0)' });
    }
    if (typeof tool.icon !== 'string' || !tool.icon.trim()) {
      errors.push({ field: 'tool.icon', message: 'tool.icon 不能为空' });
    }
    if (!Array.isArray(tool.tags) || tool.tags.length < 2) {
      errors.push({ field: 'tool.tags', message: 'tool.tags 至少需要 2 个搜索关键词' });
    }
    if (typeof tool.hasSettings !== 'boolean' && obj.tool) {
      errors.push({ field: 'tool.hasSettings', message: 'tool.hasSettings 必须是布尔值' });
    }
  }

  // entry
  if (typeof obj.entry !== 'string' || !obj.entry.endsWith('.js') && !obj.entry.endsWith('.mjs')) {
    errors.push({ field: 'entry', message: 'entry 必须是 .js 或 .mjs 结尾的文件名' });
  }

  // permissions
  if (!obj.permissions || typeof obj.permissions !== 'object') {
    errors.push({ field: 'permissions', message: '缺少 permissions 对象' });
  } else {
    const perms = obj.permissions as Record<string, unknown>;
    for (const key of Object.keys(perms)) {
      if (!(VALID_PERMISSIONS as readonly string[]).includes(key)) {
        errors.push({ field: `permissions.${key}`, message: `未知权限: ${key}` });
      }
      if (typeof perms[key] !== 'boolean') {
        errors.push({ field: `permissions.${key}`, message: `permissions.${key} 必须是布尔值` });
      }
    }
  }

  // compatibility
  if (!obj.compatibility || typeof obj.compatibility !== 'object') {
    errors.push({ field: 'compatibility', message: '缺少 compatibility 字段' });
  } else {
    const compat = obj.compatibility as Record<string, unknown>;
    if (typeof compat.toolbox_min !== 'string' || !/^\d+\.\d+\.\d+/.test(compat.toolbox_min)) {
      errors.push({ field: 'compatibility.toolbox_min', message: 'toolbox_min 必须是版本号字符串 (如 0.3.0)' });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: json as PacketManifest };
}

/** 校验 ZIP 解压后的文件列表是否安全 */
export function validateFileList(files: { path: string; size: number }[]): { ok: true } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
  const MAX_PACKET_SIZE = 20 * 1024 * 1024; // 20MB total
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;

    // zip slip 攻击防御
    if (file.path.includes('..')) {
      errors.push({ field: 'zip', message: `路径包含非法字符: ${file.path}` });
    }
    if (file.size > MAX_FILE_SIZE) {
      errors.push({ field: 'zip', message: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB): ${file.path}` });
    }
  }

  if (totalSize > MAX_PACKET_SIZE) {
    errors.push({ field: 'zip', message: `包总大小超出限制 (${(totalSize / 1024 / 1024).toFixed(1)}MB > 20MB)` });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

/** 生成权限注入代码（安装时包裹 index.js） */
export function generatePermissionWrapper(permissions: Record<string, boolean | undefined>): string {
  const allowed = new Set(Object.entries(permissions).filter(([, v]) => v === true).map(([k]) => k));

  return `
// @generated — 37工具箱权限注入桥接
// 允许的权限: ${[...allowed].join(', ') || '无'}

window.__37toolbox_permissions = ${JSON.stringify([...allowed])};
`.trim();
}
