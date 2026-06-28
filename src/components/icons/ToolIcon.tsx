// @author: claude | phase: 0 | component: tool-icon
// ================================================================
// 工具图标组件 — 将 manifest.icon 字符串映射为 Lucide React 图标
// 所有 SidebarItem / ToolWorkspace header / EmptyState 都通过此组件获取图标
// ================================================================

import React from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

import {
  // 13 个内置工具图标
  Clock,
  Key,
  Ruler,
  Calculator,
  Image,
  QrCode,
  Pipette,
  GitCompare,
  FileText,
  Braces,
  Binary,
  Regex,
  Download,

  // Pixiv 下载器 + 追番工具
  Tv,

  // UI 框架自用图标
  Search,
  Settings,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  Wrench,
  Inbox,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Trash2,
  FolderOpen,
  Plus,
  Undo2,
  Redo2,
  Scissors,
  Clipboard,
  TextSelect,
  RefreshCw,
  Bug,
  Minus,
  Maximize2,
  CircleHelp,
  Lock,
  Folder,
} from 'lucide-react';

/**
 * 图标名 → Lucide 组件的完整映射表。
 * 新增工具时在此追加一行。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  // 工具图标
  clock: Clock,
  key: Key,
  ruler: Ruler,
  calculator: Calculator,
  image: Image,
  'qr-code': QrCode,
  pipette: Pipette,
  'git-compare': GitCompare,
  'file-text': FileText,
  braces: Braces,
  binary: Binary,
  regex: Regex,
  download: Download,
  tv: Tv,

  // UI 框架图标
  search: Search,
  settings: Settings,
  moon: Moon,
  sun: Sun,
  'panel-left-close': PanelLeftClose,
  'panel-left': PanelLeft,
  wrench: Wrench,
  inbox: Inbox,
  x: X,
  copy: Copy,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'rotate-cw': RotateCw,
  'refresh-cw': RefreshCw,
  'trash-2': Trash2,
  'folder-open': FolderOpen,
  plus: Plus,
  'undo-2': Undo2,
  'redo-2': Redo2,
  scissors: Scissors,
  clipboard: Clipboard,
  'text-select': TextSelect,
  bug: Bug,
  minus: Minus,
  'maximize-2': Maximize2,
  'circle-help': CircleHelp,
  lock: Lock,
  folder: Folder,
};

/**
 * 获取对应名称的 Lucide 图标组件。找不到时返回 null（调用方自行处理 fallback）。
 */
export function getIcon(name: string): LucideIcon | null {
  return ICON_MAP[name] ?? null;
}

/**
 * 获取所有可用的图标名列表（供调试或图标选择器用）。
 */
export function getAvailableIcons(): string[] {
  return Object.keys(ICON_MAP);
}

// ================================================================
// ToolIcon 组件
// ================================================================

export interface ToolIconProps extends Omit<LucideProps, 'ref'> {
  /** manifest.icon 中定义的图标名 */
  name: string;
}

/**
 * 根据图标名字符串渲染对应的 Lucide 图标。
 *
 * 用法:
 *   <ToolIcon name="clock" size={20} />
 *   <ToolIcon name="braces" className="text-accent" size={16} />
 *
 * 如果 name 在映射表中不存在，渲染一个占位方块（□）。
 */
const ToolIcon: React.FC<ToolIconProps> = ({ name, size = 18, ...rest }) => {
  const IconComponent = ICON_MAP[name];

  if (!IconComponent) {
    // 优雅降级：未知图标显示占位符
    return (
      <span
        className="inline-flex items-center justify-center text-text-muted select-none"
        style={{ width: size, height: size, fontSize: Math.max(12, Number(size) * 0.7) }}
        title={`未知图标: ${name}`}
      >
        □
      </span>
    );
  }

  return <IconComponent size={size} {...rest} />;
};

export default ToolIcon;
