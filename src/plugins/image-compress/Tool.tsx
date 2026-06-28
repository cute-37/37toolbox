// @author: frontend-ai | phase: 4b | tool: image-compress | ui
import React, { useEffect, useRef, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Input, Select } from '../../components/shared';
import { compressImage, manifest, type CompressOptions, type CompressResult } from './engine';

const formatBytes = (bytes: number): string => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;

interface ImageJob {
  id: string;
  file: File;
  originalUrl: string;
  result?: CompressResult;
  error?: string;
}

/** 图片压缩 UI。 */
const ImageCompressTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const jobsRef = useRef<ImageJob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [options, setOptions] = useState<CompressOptions>({ quality: 0.8, format: 'original' });

  useEffect((): void => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect((): (() => void) => {
    return (): void => {
      jobsRef.current.forEach((job) => {
        URL.revokeObjectURL(job.originalUrl);
        if (job.result?.previewUrl) URL.revokeObjectURL(job.result.previewUrl);
      });
    };
  }, []);

  useEffect((): void => {
    if (!jobs.length) return;
    onStatusChange('running', '批量压缩中');
    void Promise.all(jobs.map(async (job) => {
      try {
        const next = await compressImage(job.file, options);
        return { ...job, result: next, error: undefined };
      } catch (err) {
        const message = err instanceof Error ? err.message : '图片压缩失败';
        return { ...job, result: undefined, error: message };
      }
    })).then((nextJobs) => {
      jobs.forEach((job) => {
        if (job.result?.previewUrl) URL.revokeObjectURL(job.result.previewUrl);
      });
      setJobs(nextJobs);
      const failed = nextJobs.filter((job) => job.error).length;
      setError(failed ? `${failed} 张图片压缩失败` : '');
      onStatusChange(failed ? 'error' : 'success', failed ? `${failed} 张失败` : `已压缩 ${nextJobs.length} 张`);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const setSelectedFiles = (files: FileList | File[]): void => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      setError('请拖入或选择图片文件');
      onStatusChange('error', '未发现图片文件');
      return;
    }
    jobs.forEach((job) => {
      URL.revokeObjectURL(job.originalUrl);
      if (job.result?.previewUrl) URL.revokeObjectURL(job.result.previewUrl);
    });
    const nextJobs = imageFiles.map((nextFile) => ({
      id: crypto.randomUUID(),
      file: nextFile,
      originalUrl: URL.createObjectURL(nextFile),
    }));
    setJobs(nextJobs);
    setError('');
    onStatusChange('running', '批量压缩中');
    void Promise.all(nextJobs.map(async (job) => {
      try {
        const next = await compressImage(job.file, options);
        return { ...job, result: next, error: undefined };
      } catch (err) {
        const message = err instanceof Error ? err.message : '图片压缩失败';
        return { ...job, result: undefined, error: message };
      }
    })).then((compressed) => {
      setJobs(compressed);
      const failed = compressed.filter((job) => job.error).length;
      setError(failed ? `${failed} 张图片压缩失败` : '');
      onStatusChange(failed ? 'error' : 'success', failed ? `${failed} 张失败` : `已压缩 ${compressed.length} 张`);
    });
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const files = event.dataTransfer.files;
    if (files.length) setSelectedFiles(files);
  };

  const clearJobs = (): void => {
    jobs.forEach((job) => {
      URL.revokeObjectURL(job.originalUrl);
      if (job.result?.previewUrl) URL.revokeObjectURL(job.result.previewUrl);
    });
    setJobs([]);
    setError('');
    onStatusChange('idle');
  };

  const totalOriginal = jobs.reduce((sum, job) => sum + job.file.size, 0);
  const totalCompressed = jobs.reduce((sum, job) => sum + (job.result?.compressedSize ?? 0), 0);

  const update = <K extends keyof CompressOptions>(key: K, value: CompressOptions[K]): void => setOptions((current) => ({ ...current, [key]: value }));

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id) return;
      if (detail.action === 'add-images') fileInputRef.current?.click();
      if (detail.action === 'clear') clearJobs();
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  return (
    <div className="space-y-4">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-text-secondary transition ${dragActive ? 'border-accent bg-accent-subtle text-text-primary' : 'border-border-light bg-bg-secondary hover:bg-bg-hover'}`}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span>{jobs.length ? `已选择 ${jobs.length} 张图片` : dragActive ? '松手导入图片' : '拖入图片或点击选择，可多选'}</span>
        <span className="mt-1 text-xs text-text-muted">支持 JPG、PNG、WebP、GIF 等浏览器可读取图片</span>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event): void => { if (event.target.files) setSelectedFiles(event.target.files); }} />
      </label>
      {error ? <p className="text-xs text-status-error">{error}</p> : null}
      {jobs.length ? (
        <section className="space-y-3">
          <div className="rounded-md border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
            总计：{formatBytes(totalOriginal)} {'->'} {totalCompressed ? formatBytes(totalCompressed) : '--'}
            {totalCompressed ? `，减少 ${Math.max(0, 100 - (totalCompressed / totalOriginal) * 100).toFixed(1)}%` : ''}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <article key={job.id} className="rounded-md border border-border bg-bg-secondary p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{job.file.name}</h3>
                    <p className="text-xs text-text-secondary">{formatBytes(job.file.size)}{job.result ? ` -> ${formatBytes(job.result.compressedSize)}` : ''}</p>
                  </div>
                  {job.result ? <a className="inline-flex h-8 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover" href={job.result.previewUrl} download={job.file.name}>下载</a> : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <img src={job.originalUrl} alt="原图预览" className="max-h-48 rounded-sm object-contain" />
                  {job.result ? <img src={job.result.previewUrl} alt="压缩预览" className="max-h-48 rounded-sm object-contain" /> : <div className="flex min-h-32 items-center justify-center rounded-sm bg-bg-sidebar text-sm text-text-muted">压缩中</div>}
                </div>
                {job.error ? <p className="mt-2 text-xs text-status-error">{job.error}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : <EmptyState title="等待图片" description="选择图片后会自动压缩并显示对比。" />}
      <div className="grid gap-3 rounded-md border border-border bg-bg-secondary p-4 sm:grid-cols-4">
        <label className="text-xs text-text-secondary sm:col-span-2">质量 {options.quality}<input className="mt-2 w-full accent-[var(--accent)]" type="range" min={0.1} max={1} step={0.05} value={options.quality} onChange={(event): void => update('quality', Number(event.target.value))} /></label>
        <Select aria-label="格式" value={options.format} onChange={(event): void => update('format', event.target.value as CompressOptions['format'])} options={['original', 'jpeg', 'png', 'webp'].map((value) => ({ value, label: value }))} />
        <Input aria-label="最大宽度" placeholder="最大宽度" type="number" onChange={(event): void => update('maxWidth', event.target.value ? Number(event.target.value) : undefined)} />
        <Input aria-label="最大高度" placeholder="最大高度" type="number" onChange={(event): void => update('maxHeight', event.target.value ? Number(event.target.value) : undefined)} />
        <Button disabled={!jobs.length} onClick={clearJobs}>清空队列</Button>
      </div>
    </div>
  );
};

export { manifest };
export default ImageCompressTool;
