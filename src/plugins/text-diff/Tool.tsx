// @author: frontend-ai | phase: 4b | tool: text-diff | ui
import React, { useEffect, useMemo, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, TextArea } from '../../components/shared';
import { computeDiff, computeDiffStats, manifest } from './engine';

/** 文本对比 UI。 */
const TextDiffTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [left, setLeft] = useState<string>('');
  const [right, setRight] = useState<string>('');
  const lines = useMemo(() => computeDiff(left, right), [left, right]);
  const stats = useMemo(() => computeDiffStats(lines), [lines]);

  useEffect((): void => {
    onStatusChange(left || right ? 'success' : 'idle', left || right ? `新增 ${stats.added} / 删除 ${stats.removed}` : undefined);
  }, [left, onStatusChange, right, stats.added, stats.removed]);

  const loadFile = async (side: 'left' | 'right'): Promise<void> => {
    const path = await window.toolbox?.file?.openDialog?.([{ name: 'Text', extensions: ['txt', 'md', 'json', 'log', '*'] }]);
    if (!path) return;
    const content = await window.toolbox?.file?.read?.(path);
    if (typeof content !== 'string') return;
    if (side === 'left') setLeft(content);
    else setRight(content);
  };

  const pasteClipboard = async (side: 'left' | 'right'): Promise<void> => {
    const content = await window.toolbox?.clipboard?.read?.();
    if (typeof content !== 'string') return;
    if (side === 'left') setLeft(content);
    else setRight(content);
  };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id) return;
      if (detail.action === 'paste-left') void pasteClipboard('left');
      if (detail.action === 'paste-right') void pasteClipboard('right');
      if (detail.action === 'left-file') void loadFile('left');
      if (detail.action === 'right-file') void loadFile('right');
      if (detail.action === 'swap') { setLeft(right); setRight(left); }
      if (detail.action === 'clear') { setLeft(''); setRight(''); }
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={(): void => { void pasteClipboard('left'); }}>粘贴到左侧</Button>
        <Button onClick={(): void => { void pasteClipboard('right'); }}>粘贴到右侧</Button>
        <Button onClick={(): void => { void loadFile('left'); }}>左侧文件</Button>
        <Button onClick={(): void => { void loadFile('right'); }}>右侧文件</Button>
        <Button onClick={(): void => { setLeft(right); setRight(left); }}>交换左右</Button>
        <Button onClick={(): void => { setLeft(''); setRight(''); }}>清空</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea aria-label="左侧文本" value={left} onChange={(event): void => setLeft(event.target.value)} placeholder="原始文本" rows={10} showLineNumbers />
        <TextArea aria-label="右侧文本" value={right} onChange={(event): void => setRight(event.target.value)} placeholder="新文本" rows={10} showLineNumbers />
      </div>
      {left || right ? (
        <section className="overflow-hidden rounded-md border border-border bg-bg-secondary">
          <div className="max-h-80 overflow-auto font-mono text-xs">
            {lines.map((line, index) => (
              <div key={`${index}-${line.content}`} className={`grid grid-cols-[64px_1fr] gap-3 px-3 py-1 ${line.type === 'added' ? 'bg-[var(--diff-added-bg)]' : line.type === 'removed' ? 'bg-[var(--diff-removed-bg)]' : ''}`}>
                <span className="text-text-muted">{line.lineNumber.left ?? '-'} / {line.lineNumber.right ?? '-'}</span>
                <span className="whitespace-pre-wrap">{line.content || ' '}</span>
              </div>
            ))}
          </div>
        </section>
      ) : <EmptyState title="输入两段文本开始对比" />}
      <p className="font-mono text-xs text-text-secondary">新增 {stats.added} 行 / 删除 {stats.removed} 行 / 未变 {stats.unchanged} 行</p>
    </div>
  );
};

export { manifest };
export default TextDiffTool;
