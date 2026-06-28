// @author: frontend-ai | phase: 4b | tool: regex-test | ui
import React, { useEffect, useMemo, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Input, Switch, TextArea } from '../../components/shared';
import { manifest, replaceRegex, testRegex, type RegexFlags } from './engine';

/** 正则测试 UI。 */
const RegexTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [pattern, setPattern] = useState<string>('');
  const [input, setInput] = useState<string>('');
  const [replacement, setReplacement] = useState<string>('');
  const [flags, setFlags] = useState<RegexFlags>({ global: true, ignoreCase: false, multiline: false, dotAll: false, unicode: false });
  const result = useMemo(() => pattern ? testRegex(pattern, flags, input) : { ok: true as const, matches: [], count: 0 }, [flags, input, pattern]);
  const replaced = useMemo(() => pattern ? replaceRegex(pattern, flags, input, replacement) : null, [flags, input, pattern, replacement]);
  const resultCount = result.ok ? result.count : 0;
  const resultError = result.ok ? '' : result.error;

  useEffect((): void => {
    if (!pattern) onStatusChange('idle');
    else if (result.ok) onStatusChange('success', `${resultCount} 个匹配`);
    else onStatusChange('error', resultError);
  }, [onStatusChange, pattern, result.ok, resultCount, resultError]);

  const setFlag = (key: keyof RegexFlags, checked: boolean): void => setFlags((current) => ({ ...current, [key]: checked }));

  return (
    <div className="space-y-3">
      <Input aria-label="正则表达式" value={pattern} onChange={(event): void => setPattern(event.target.value)} placeholder="输入正则表达式，不含 / /" className={!result.ok ? 'border-status-error' : ''} />
      <div className="flex flex-wrap gap-3">
        {([
          ['global', 'g'],
          ['ignoreCase', 'i'],
          ['multiline', 'm'],
          ['dotAll', 's'],
          ['unicode', 'u'],
        ] as const).map(([key, label]) => <span key={key} className="flex items-center gap-2 text-xs"><Switch ariaLabel={label} checked={flags[key]} onChange={(checked): void => setFlag(key, checked)} />{label}</span>)}
      </div>
      {!result.ok ? <p className="text-xs text-status-error">{result.error}</p> : null}
      <TextArea aria-label="测试文本" value={input} onChange={(event): void => setInput(event.target.value)} placeholder="输入测试文本" rows={10} />
      {result.ok && input ? (
        <section className="rounded-md border border-border bg-bg-secondary p-4">
          <h3 className="font-medium">高亮预览</h3>
          <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-bg-sidebar p-3 font-mono text-xs leading-6">
            {renderHighlighted(input, result.matches)}
          </div>
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-bg-secondary p-4">
          <h3 className="font-medium">匹配结果</h3>
          {result.ok && result.matches.length > 0 ? (
            <div className="mt-3 space-y-2">
              {result.matches.map((match, index) => (
                <div key={`${match.index}-${index}`} className="rounded-sm bg-bg-sidebar p-2 font-mono text-xs">
                  <div>#{index + 1} [{match.index}] {match.text}</div>
                  {match.captures.length ? <div className="mt-1 text-text-secondary">捕获：{match.captures.map((item, groupIndex) => `$${groupIndex + 1}=${item ?? ''}`).join(' / ')}</div> : null}
                  {Object.keys(match.groups).length ? <div className="mt-1 text-text-secondary">命名组：{Object.entries(match.groups).map(([key, value]) => `${key}=${value}`).join(' / ')}</div> : null}
                </div>
              ))}
            </div>
          ) : <EmptyState title="暂无匹配" />}
        </section>
        <section className="rounded-md border border-border bg-bg-secondary p-4">
          <Input aria-label="替换为" value={replacement} onChange={(event): void => setReplacement(event.target.value)} placeholder="替换为" />
          <TextArea aria-label="替换结果" value={replaced?.ok ? replaced.replaced ?? '' : ''} readOnly rows={8} className="mt-3" />
        </section>
      </div>
    </div>
  );
};

export { manifest };
export default RegexTool;

function renderHighlighted(input: string, matches: Array<{ index: number; text: string }>): React.ReactNode[] {
  if (!matches.length) return [input];
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    const start = Math.max(cursor, match.index);
    const end = start + match.text.length;
    if (start > cursor) nodes.push(<span key={`t-${index}`}>{input.slice(cursor, start)}</span>);
    nodes.push(<mark key={`m-${index}`} className="rounded-sm bg-accent px-0.5 text-white">{input.slice(start, end) || ' '}</mark>);
    cursor = end;
  });
  if (cursor < input.length) nodes.push(<span key="tail">{input.slice(cursor)}</span>);
  return nodes;
}
