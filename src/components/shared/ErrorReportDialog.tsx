// @author: claude | phase: v0.5 | component: error-report-dialog
// ================================================================
// 错误报告弹窗 — 展示诊断信息 + 一键复制/导出
// ================================================================

import React, { useEffect, useState } from 'react';

import { Button, Tooltip } from './index';

export interface ErrorReportDialogProps {
  /** 触发时显示的错误消息（可选，用于引导用户） */
  triggerMessage?: string;
  onClose: () => void;
}

export const ErrorReportDialog: React.FC<ErrorReportDialogProps> = ({ triggerMessage, onClose }) => {
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const text = await (window as any).toolbox?.app?.exportErrorReport?.();
        setReport(typeof text === 'string' ? text : '');
      } catch (err) {
        setReport(`无法生成报告: ${err instanceof Error ? err.message : '未知错误'}\n\n请手动查看路径: ${await (window as any).toolbox?.app?.getErrorLogPath?.() ?? '未知'}`);
      }
      setLoading(false);
    })();
  }, []);

  const copyReport = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 纯展示
    }
  };

  const copyQuickReport = (): void => {
    const quick = triggerMessage
      ? `[37工具箱 问题反馈]\n\n错误信息: ${triggerMessage}\n时间: ${new Date().toLocaleString()}\n\n请查看详细诊断报告。`
      : `[37工具箱 问题反馈]\n时间: ${new Date().toLocaleString()}\n\n请查看详细诊断报告。`;
    try {
      navigator.clipboard.writeText(quick).then(() => setCopied(true));
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25" onClick={onClose}>
      <div
        className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">错误报告</h2>
            <p className="text-xs text-text-secondary">将以下信息复制发送给开发者</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </div>

        {/* quick copy hint */}
        {triggerMessage && (
          <div className="mx-5 mt-4 rounded-md border border-status-error/20 bg-status-error/5 p-3">
            <p className="text-xs text-status-error font-medium mb-1">检测到问题</p>
            <p className="text-xs text-text-secondary mb-2">{triggerMessage}</p>
            <Button variant="secondary" size="sm" onClick={copyQuickReport}>
              {copied ? '已复制' : '快速复制反馈'}
            </Button>
          </div>
        )}

        {/* diagnostic report */}
        <div className="mx-5 mt-3 rounded-md border border-border bg-bg-sidebar p-3">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-text-primary">诊断报告</span>
            <Tooltip content="复制完整报告">
              <Button variant="ghost" size="sm" onClick={copyReport}>
                {copied ? '已复制' : '复制'}
              </Button>
            </Tooltip>
          </div>
          {loading ? (
            <p className="text-xs text-text-muted">正在生成报告...</p>
          ) : (
            <pre className="max-h-96 overflow-auto font-mono text-2xs text-text-secondary whitespace-pre-wrap leading-relaxed select-all">
              {report || '(无报告)'}
            </pre>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 mt-3 text-2xs text-text-muted">
          <span>发送给开发者以帮助修复问题</span>
          <button className="underline hover:text-text-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};
