// @author: frontend-ai | phase: 4b | tool: json-formatter | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Select, TextArea } from '../../components/shared';
import { formatJSON, manifest, minifyJSON, validateJSON, type JSONOutput } from './engine';

/** JSON 格式化 UI。 */
const JsonTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<string>('');
  const [valid, setValid] = useState<boolean | null>(null);
  const [view, setView] = useState<'text' | 'tree'>('text');
  const [treeData, setTreeData] = useState<unknown>(null);

  const applyResult = (result: JSONOutput): void => {
    if (result.ok) {
      setOutput(result.formatted);
      setTreeData(result.data);
      setError('');
      setValid(true);
      setStats(`keys ${result.stats.keys} / depth ${result.stats.depth} / ${result.stats.size} bytes`);
      onStatusChange('success', 'JSON 有效');
    } else {
      setError(`${result.error}（${result.line}:${result.column}）`);
      setValid(false);
      setOutput('');
      setTreeData(null);
      setStats('');
      onStatusChange('error', result.error);
    }
  };

  const loadFromFile = async (): Promise<void> => {
    const path = await window.toolbox?.file?.openDialog?.([{ name: 'JSON', extensions: ['json', 'txt'] }]);
    if (!path) return;
    const content = await window.toolbox?.file?.read?.(path);
    if (typeof content === 'string') {
      setInput(content);
      setOutput('');
      setTreeData(null);
      setError('');
      setStats('');
      setValid(null);
      onStatusChange('success', '已加载文件');
    }
  };

  const sortKeys = (): void => {
    try {
      const parsed = JSON.parse(input);
      const sorted = sortJsonKeys(parsed);
      const formatted = JSON.stringify(sorted, null, Number(indent));
      setInput(formatted);
      setOutput(formatted);
      setTreeData(sorted);
      setError('');
      setValid(true);
      onStatusChange('success', 'Key 已排序');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'JSON 排序失败';
      setError(message);
      setValid(false);
      onStatusChange('error', message);
    }
  };

  const saveOutput = async (): Promise<void> => {
    if (!output) return;
    const path = await window.toolbox?.file?.saveDialog?.('formatted.json', [{ name: 'JSON', extensions: ['json'] }]);
    if (!path) return;
    await window.toolbox?.file?.write?.(path, output);
    onStatusChange('success', 'JSON 已保存');
  };

  const validateInput = (): void => {
    const result = validateJSON(input);
    if (result.ok) {
      setError('');
      setValid(true);
      onStatusChange('success', '校验通过');
    } else {
      setError(`${result.error}（${result.line}:${result.column}）`);
      setValid(false);
      onStatusChange('error', result.error);
    }
  };

  const clear = (): void => {
    setInput('');
    setOutput('');
    setTreeData(null);
    setError('');
    setStats('');
    setValid(null);
  };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id) return;
      if (detail.action === 'load') void loadFromFile();
      if (detail.action === 'format') applyResult(formatJSON(input, Number(indent) as 2 | 4));
      if (detail.action === 'minify') applyResult(minifyJSON(input));
      if (detail.action === 'sort') sortKeys();
      if (detail.action === 'copy' && output) void window.toolbox?.clipboard?.write(output);
      if (detail.action === 'save') void saveOutput();
      if (detail.action === 'clear') clear();
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={(): void => applyResult(formatJSON(input, Number(indent) as 2 | 4))}>格式化</Button>
        <Button onClick={(): void => applyResult(minifyJSON(input))}>压缩</Button>
        <Button onClick={sortKeys}>排序 Key</Button>
        <Button onClick={validateInput}>校验</Button>
        <Select aria-label="缩进" value={indent} onChange={(event): void => setIndent(event.target.value as '2' | '4')} options={[{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }]} />
        <Button onClick={(): void => { void loadFromFile(); }}>从文件加载</Button>
        <Button disabled={!output} onClick={(): void => void window.toolbox?.clipboard?.write(output)}>复制结果</Button>
        <Button disabled={!output} onClick={(): void => { void saveOutput(); }}>保存结果</Button>
        <Button disabled={!output} variant={view === 'tree' ? 'primary' : 'secondary'} onClick={(): void => setView((current) => current === 'tree' ? 'text' : 'tree')}>{view === 'tree' ? '文本视图' : '树视图'}</Button>
        <Button onClick={clear}>清空</Button>
      </div>
      {valid !== null ? <span className={`inline-flex rounded-sm px-2 py-1 text-xs ${valid ? 'bg-status-success text-white' : 'bg-status-error text-white'}`}>{valid ? '校验通过' : '校验失败'}</span> : null}
      {error ? <p className="rounded-sm border border-status-error bg-bg-secondary p-2 text-xs text-status-error">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea aria-label="JSON 输入" value={input} onChange={(event): void => setInput(event.target.value)} placeholder="粘贴 JSON 到这里" rows={20} showLineNumbers />
        {output ? (
          view === 'tree'
            ? <section className="max-h-[560px] overflow-auto rounded-md border border-border bg-bg-secondary p-4 font-mono text-xs">{renderJsonTree(treeData)}</section>
            : <TextArea aria-label="JSON 输出" value={output} readOnly rows={20} showLineNumbers />
        ) : <EmptyState title="等待输出" description="格式化或压缩后结果会显示在这里。" />}
      </div>
      {stats ? <p className="font-mono text-xs text-text-secondary">{stats}</p> : null}
    </div>
  );
};

export { manifest };
export default JsonTool;

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortJsonKeys(item)]));
  }
  return value;
}

function renderJsonTree(value: unknown, keyName = 'root', depth = 0): React.ReactNode {
  const indent = { paddingLeft: `${depth * 16}px` };
  if (Array.isArray(value)) {
    return (
      <div style={indent}>
        <div className="text-accent">{keyName}: Array({value.length})</div>
        {value.map((item, index) => <div key={`${keyName}-${index}`}>{renderJsonTree(item, `[${index}]`, depth + 1)}</div>)}
      </div>
    );
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div style={indent}>
        <div className="text-accent">{keyName}: Object({entries.length})</div>
        {entries.map(([key, item]) => <div key={key}>{renderJsonTree(item, key, depth + 1)}</div>)}
      </div>
    );
  }
  return <div style={indent}><span className="text-text-secondary">{keyName}: </span><span>{JSON.stringify(value)}</span></div>;
}
