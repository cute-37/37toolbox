// @author: frontend-ai | phase: 2 | component: StatusBar
import React from 'react';

import type { ToolStatus } from '../../core/types';

export interface StatusBarProps {
  status: ToolStatus;
  message?: string;
}

const labels: Record<ToolStatus, string> = {
  idle: '就绪',
  running: '处理中...',
  success: '完成',
  error: '错误',
};

/** 渲染工具状态栏。 */
export const StatusBar: React.FC<StatusBarProps> = ({ status, message }) => (
  <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-bg-sidebar px-3 text-2xs text-text-muted">
    <span className={status === 'error' ? 'text-status-error' : status === 'success' ? 'text-status-success' : ''}>
      {status === 'error' && message ? `${labels[status]}: ${message}` : message ?? labels[status]}
    </span>
    <span>Ctrl+P 搜索工具</span>
  </footer>
);
