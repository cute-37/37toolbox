// @author: frontend-ai | phase: 4b | tool: downloader | ui
import React, { useEffect, useMemo, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Input } from '../../components/shared';
import { createDownloader, manifest, type DownloadTask } from './engine';

const formatBytes = (bytes: number): string => bytes <= 0 ? '--' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
const STORAGE_KEY = '37toolbox:downloader-tasks';

/** 下载器 UI。 */
const DownloaderTool: React.FC<ToolProps> = ({ settings, onSettingsChange, onStatusChange }) => {
  const downloader = useMemo(() => createDownloader(loadPersistedTasks()), []);
  const [url, setUrl] = useState<string>('');
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState<string>('');
  const savePath = typeof settings.savePath === 'string' ? settings.savePath : '';

  useEffect((): (() => void) => downloader.onProgress((next) => {
    setTasks(next);
    persistTasks(next);
  }), [downloader]);

  const addTask = (): void => {
    if (!/^https?:\/\//i.test(url.trim())) {
      setError('请输入 http 或 https URL');
      onStatusChange('error', 'URL 无效');
      return;
    }
    setError('');
    onStatusChange('running', '添加下载任务');
    void downloader.addTask(url.trim(), undefined, savePath).then(() => {
      setUrl('');
      onStatusChange('success', '任务已添加');
    });
  };

  const retryTask = (task: DownloadTask): void => {
    onStatusChange('running', '重新下载');
    downloader.removeTask(task.id);
    void downloader.addTask(task.url, task.fileName, task.savePath || savePath);
  };

  const exportTasks = (): void => {
    const blob = new Blob([JSON.stringify(tasks.map(stripRuntimeFields), null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'downloader-tasks.json';
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const importTasks = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const parsed = JSON.parse(text) as DownloadTask[];
      downloader.replaceTasks(parsed.filter((task) => task.id && task.url && task.fileName).map(stripRuntimeFields));
      onStatusChange('success', '下载队列已导入');
    }).catch(() => {
      onStatusChange('error', '下载队列导入失败');
    });
    event.target.value = '';
  };

  const totalSpeed = tasks.reduce((sum, task) => sum + task.speed, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input aria-label="下载地址" value={url} onChange={(event): void => setUrl(event.target.value)} placeholder="https://example.com/file.zip" />
          <Button variant="primary" onClick={addTask}>新建任务</Button>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input aria-label="保存路径" value={savePath} onChange={(event): void => onSettingsChange({ ...settings, savePath: event.target.value })} placeholder="保存路径（记录到任务元数据）" />
          <Button onClick={exportTasks}>导出队列</Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm hover:bg-bg-hover">
            导入队列
            <input type="file" accept="application/json,.json" className="hidden" onChange={importTasks} />
          </label>
        </div>
        {error ? <p className="mt-2 text-xs text-status-error">{error}</p> : null}
      </section>
      {tasks.length === 0 ? <EmptyState title="暂无下载任务" description="输入 URL 后创建任务并开始下载。" /> : (
        <section className="space-y-2">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-md border border-border bg-bg-secondary p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{task.fileName}</h3>
                  <p className="truncate font-mono text-2xs text-text-muted">{task.url}</p>
                </div>
                <span className={`rounded-sm px-2 py-1 text-2xs ${task.status === 'completed' ? 'bg-status-success text-white' : task.status === 'failed' ? 'bg-status-error text-white' : 'bg-bg-active text-text-secondary'}`}>{task.status}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-sidebar"><div className="h-full bg-accent" style={{ width: `${task.progress}%` }} /></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                <span>{task.progress}% / {formatBytes(task.downloadedSize)} / {formatBytes(task.totalSize)} / {formatBytes(task.speed)}/s</span>
                <span className="flex gap-2">
                  {task.status === 'paused' ? <Button size="sm" onClick={(): void => downloader.resumeTask(task.id)}>继续</Button> : <Button size="sm" onClick={(): void => downloader.pauseTask(task.id)}>暂停</Button>}
                  {task.status === 'failed' || task.status === 'completed' ? <Button size="sm" onClick={(): void => retryTask(task)}>重试</Button> : null}
                  {task.downloadUrl ? <a className="inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm hover:bg-bg-hover" href={task.downloadUrl} download={task.fileName}>保存</a> : null}
                  <Button size="sm" onClick={(): void => downloader.cancelTask(task.id)}>取消</Button>
                  <Button size="sm" variant="ghost" onClick={(): void => downloader.removeTask(task.id)}>删除</Button>
                </span>
              </div>
              {task.error ? <p className="mt-2 text-xs text-status-error">{task.error}</p> : null}
            </article>
          ))}
        </section>
      )}
      <p className="font-mono text-xs text-text-secondary">任务 {tasks.length} / 全局速度 {formatBytes(totalSpeed)}/s</p>
    </div>
  );
};

export { manifest };
export default DownloaderTool;

function loadPersistedTasks(): DownloadTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as DownloadTask[]).map(stripRuntimeFields);
  } catch {
    return [];
  }
}

function persistTasks(tasks: DownloadTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.map(stripRuntimeFields)));
}

function stripRuntimeFields(task: DownloadTask): DownloadTask {
  return { ...task, speed: 0, status: task.status === 'downloading' ? 'paused' : task.status, downloadUrl: undefined };
}
