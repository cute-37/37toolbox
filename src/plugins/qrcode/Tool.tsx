// @author: frontend-ai | phase: 4b | tool: qrcode | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Select, TextArea } from '../../components/shared';
import { generateQRCode, manifest, type QRCodeOptions } from './engine';

/** 二维码生成 UI。 */
const QRCodeTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [options, setOptions] = useState<QRCodeOptions>({ content: '', size: 256, errorCorrection: 'M', foreground: '#000000', background: '#ffffff' });
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect((): (() => void) | void => {
    if (!options.content.trim()) {
      setDataUrl('');
      onStatusChange('idle');
      return;
    }
    onStatusChange('running', '生成二维码');
    const timer = window.setTimeout((): void => {
      void generateQRCode(options).then((url) => {
        setDataUrl(url);
        setError('');
        onStatusChange('success', '二维码已生成');
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '二维码生成失败';
        setError(message);
        onStatusChange('error', message);
      });
    }, 300);
    return (): void => window.clearTimeout(timer);
  }, [onStatusChange, options]);

  const update = <K extends keyof QRCodeOptions>(key: K, value: QRCodeOptions[K]): void => setOptions((current) => ({ ...current, [key]: value }));

  const copyImage = async (): Promise<void> => {
    if (!dataUrl) return;
    try {
      const blob = await fetch(dataUrl).then((response) => response.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      onStatusChange('success', '二维码图片已复制');
    } catch {
      await window.toolbox?.clipboard?.write(dataUrl);
      onStatusChange('success', '已复制二维码 Data URL');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-3 rounded-md border border-border bg-bg-secondary p-4">
        <TextArea aria-label="二维码内容" value={options.content} onChange={(event): void => update('content', event.target.value)} placeholder="输入文本或 URL" rows={8} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select aria-label="纠错等级" value={options.errorCorrection} onChange={(event): void => update('errorCorrection', event.target.value as QRCodeOptions['errorCorrection'])} options={['L', 'M', 'Q', 'H'].map((value) => ({ value, label: `纠错 ${value}` }))} />
          <label className="text-xs text-text-secondary">尺寸 {options.size}<input className="mt-2 w-full accent-[var(--accent)]" type="range" min={128} max={512} value={options.size} onChange={(event): void => update('size', Number(event.target.value))} /></label>
          <input aria-label="前景色" type="color" value={options.foreground} onChange={(event): void => update('foreground', event.target.value)} className="h-9 w-full rounded-sm bg-bg-sidebar" />
          <input aria-label="背景色" type="color" value={options.background} onChange={(event): void => update('background', event.target.value)} className="h-9 w-full rounded-sm bg-bg-sidebar" />
        </div>
        {error ? <p className="text-xs text-status-error">{error}</p> : null}
      </section>
      <section className="flex flex-col items-center justify-center rounded-md border border-border bg-bg-secondary p-4">
        {dataUrl ? <img src={dataUrl} alt="二维码预览" className="rounded-sm bg-white p-3" /> : <EmptyState title="二维码预览" description="输入内容后自动生成。" />}
        {dataUrl ? (
          <div className="mt-3 flex gap-2">
            <a className="inline-flex h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover" href={dataUrl} download="qrcode.png">下载 PNG</a>
            <Button onClick={(): void => { void copyImage(); }}>复制图片</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export { manifest };
export default QRCodeTool;
