// @author: frontend-ai | phase: 4b | tool: base64 | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, TextArea } from '../../components/shared';
import { base64Decode, base64Encode, base64FileToDataUrl, base64ToObjectUrl, fromUrlSafeBase64, manifest, parseDataUrl, toUrlSafeBase64 } from './engine';

/** Base64 编解码 UI。 */
const Base64Tool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [urlSafe, setUrlSafe] = useState<boolean>(false);
  const [download, setDownload] = useState<{ url: string; fileName: string } | null>(null);

  useEffect((): (() => void) | void => {
    if (!download) return;
    return (): void => URL.revokeObjectURL(download.url);
  }, [download]);

  const run = (): void => {
    const source = mode === 'decode' && urlSafe ? fromUrlSafeBase64(input) : input;
    const result = mode === 'encode' ? base64Encode(source) : base64Decode(source);
    if (result.ok) {
      setOutput(mode === 'encode' && urlSafe ? toUrlSafeBase64(result.output) : result.output);
      setError('');
      setDownload(null);
      onStatusChange('success', mode === 'encode' ? '编码完成' : '解码完成');
    } else {
      setError(result.error);
      setOutput('');
      onStatusChange('error', result.error);
    }
  };

  const decodeAsFile = (): void => {
    if (download) URL.revokeObjectURL(download.url);
    const result = base64ToObjectUrl(urlSafe ? fromUrlSafeBase64(input || output) : input || output);
    if ('error' in result) {
      setError(result.error);
      onStatusChange('error', result.error);
      return;
    }
    setDownload(result);
    setError('');
    onStatusChange('success', '已生成可下载文件');
  };

  const dataUrl = parseDataUrl(input || output);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    onStatusChange('running', '读取文件');
    void base64FileToDataUrl(file).then((dataUrl) => {
      setOutput(dataUrl);
      onStatusChange('success', 'Data URL 已生成');
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : '文件读取失败';
      setError(message);
      onStatusChange('error', message);
    });
  };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id) return;
      if (detail.action === 'encode') {
        setMode('encode');
        const result = base64Encode(input);
        setOutput(urlSafe ? toUrlSafeBase64(result.output) : result.output);
        setError('');
        setDownload(null);
        onStatusChange('success', '编码完成');
      }
      if (detail.action === 'decode') {
        setMode('decode');
        const result = base64Decode(urlSafe ? fromUrlSafeBase64(input) : input);
        if (result.ok) {
          setOutput(result.output);
          setError('');
          setDownload(null);
          onStatusChange('success', '解码完成');
        } else {
          setError(result.error);
          setOutput('');
          onStatusChange('error', result.error);
        }
      }
      if (detail.action === 'copy' && output) void navigator.clipboard.writeText(output);
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['encode', 'decode'] as const).map((item) => <Button key={item} variant={mode === item ? 'primary' : 'secondary'} onClick={(): void => setMode(item)}>{item === 'encode' ? '编码' : '解码'}</Button>)}
        <label className="inline-flex h-9 items-center gap-2 rounded-sm border border-border bg-bg-secondary px-3 text-sm">
          <input type="checkbox" checked={urlSafe} onChange={(event): void => setUrlSafe(event.target.checked)} />
          URL 安全
        </label>
        <Button onClick={run}>{mode === 'encode' ? '编码' : '解码'}</Button>
        <Button onClick={(): void => void navigator.clipboard.writeText(output)}>复制输出</Button>
        <Button onClick={decodeAsFile}>Base64 转文件</Button>
        {download ? <a className="inline-flex h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover" href={download.url} download={download.fileName}>下载文件</a> : null}
        <label className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm hover:bg-bg-hover">
          文件转 Data URL
          <input type="file" className="hidden" onChange={handleFile} />
        </label>
      </div>
      {dataUrl ? <p className="text-xs text-text-secondary">已识别 Data URL：{dataUrl.mime}，可直接解码或转文件。</p> : null}
      {error ? <p className="text-xs text-status-error">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea aria-label="Base64 输入" value={input} onChange={(event): void => setInput(event.target.value)} placeholder="输入文本或 Base64 字符串" rows={18} />
        {output ? <TextArea aria-label="Base64 输出" value={output} readOnly rows={18} /> : <EmptyState title="暂无输出" description="输入内容后点击编码或解码。" />}
      </div>
    </div>
  );
};

export { manifest };
export default Base64Tool;
