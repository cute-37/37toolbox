// @author: codex | phase: 4a | tool: downloader | engine
import type { ToolManifest } from '../../core/types';

export interface DownloadTask {
  id: string;
  url: string;
  fileName: string;
  savePath: string;
  totalSize: number;
  downloadedSize: number;
  speed: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number;
  error?: string;
  downloadUrl?: string;
  createdAt: number;
}

export interface DownloaderAPI {
  addTask(url: string, fileName?: string, savePath?: string): Promise<DownloadTask>;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  cancelTask(id: string): void;
  removeTask(id: string): void;
  getTasks(): DownloadTask[];
  replaceTasks(tasks: DownloadTask[]): void;
  onProgress(callback: (tasks: DownloadTask[]) => void): () => void;
}

export const manifest: ToolManifest = {
  id: 'downloader',
  name: '下载器',
  description: '管理文件下载任务',
  category: 'download',
  version: '1.0.0',
  icon: 'download',
  tags: ['download', 'http', 'file', 'aria2'],
  hasSettings: true,
  defaultSettings: { savePath: '' },
};

/** 创建下载任务管理器。 */
export function createDownloader(initialTasks: DownloadTask[] = []): DownloaderAPI {
  const tasks = new Map<string, DownloadTask>(initialTasks.map((task) => [task.id, { ...task, status: task.status === 'downloading' ? 'paused' : task.status, speed: 0, downloadUrl: undefined }]));
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<(tasks: DownloadTask[]) => void>();

  const notify = (): void => {
    const snapshot = [...tasks.values()];
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    async addTask(url: string, fileName?: string, savePath?: string): Promise<DownloadTask> {
      const task = createTask(url, fileName, savePath);
      tasks.set(task.id, task);
      notify();
      void downloadTask(task, tasks, controllers, notify);
      return task;
    },
    pauseTask(id: string): void {
      controllers.get(id)?.abort();
      controllers.delete(id);
      updateStatus(tasks, id, 'paused');
      notify();
    },
    resumeTask(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      void downloadTask({ ...task, downloadedSize: 0, progress: 0, error: undefined, downloadUrl: undefined }, tasks, controllers, notify);
    },
    cancelTask(id: string): void {
      controllers.get(id)?.abort();
      controllers.delete(id);
      updateStatus(tasks, id, 'failed', '任务已取消');
      notify();
    },
    removeTask(id: string): void {
      controllers.get(id)?.abort();
      controllers.delete(id);
      const task = tasks.get(id);
      if (task?.downloadUrl) URL.revokeObjectURL(task.downloadUrl);
      tasks.delete(id);
      notify();
    },
    getTasks(): DownloadTask[] {
      return [...tasks.values()];
    },
    replaceTasks(nextTasks: DownloadTask[]): void {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      tasks.forEach((task) => {
        if (task.downloadUrl) URL.revokeObjectURL(task.downloadUrl);
      });
      tasks.clear();
      nextTasks.forEach((task) => tasks.set(task.id, { ...task, status: task.status === 'downloading' ? 'paused' : task.status, speed: 0, downloadUrl: undefined }));
      notify();
    },
    onProgress(callback: (tasks: DownloadTask[]) => void): () => void {
      listeners.add(callback);
      callback([...tasks.values()]);
      return (): void => {
        listeners.delete(callback);
      };
    },
  };
}

async function downloadTask(
  task: DownloadTask,
  tasks: Map<string, DownloadTask>,
  controllers: Map<string, AbortController>,
  notify: () => void,
): Promise<void> {
  const controller = new AbortController();
  controllers.set(task.id, controller);
  const startedAt = Date.now();
  tasks.set(task.id, { ...task, status: 'downloading' });
  notify();

  try {
    const response = await fetch(task.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const totalSize = Number(response.headers.get('content-length') ?? 0);
    const blob = response.body ? await readStream(response, task, totalSize, startedAt, tasks, notify) : await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    tasks.set(task.id, { ...tasks.get(task.id)!, totalSize: totalSize || blob.size, downloadedSize: blob.size, speed: 0, status: 'completed', progress: 100, downloadUrl });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : '下载失败';
    tasks.set(task.id, { ...tasks.get(task.id)!, status: 'failed', error: message });
  } finally {
    controllers.delete(task.id);
    notify();
  }
}

async function readStream(
  response: Response,
  task: DownloadTask,
  totalSize: number,
  startedAt: number,
  tasks: Map<string, DownloadTask>,
  notify: () => void,
): Promise<Blob> {
  const reader = response.body!.getReader();
  const chunks: ArrayBuffer[] = [];
  let downloadedSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    downloadedSize += value.byteLength;
    const seconds = Math.max(0.1, (Date.now() - startedAt) / 1000);
    tasks.set(task.id, {
      ...tasks.get(task.id)!,
      totalSize,
      downloadedSize,
      speed: Math.round(downloadedSize / seconds),
      progress: totalSize > 0 ? Math.min(99, Math.round((downloadedSize / totalSize) * 100)) : 0,
    });
    notify();
  }

  return new Blob(chunks);
}

function createTask(url: string, fileName?: string, savePath?: string): DownloadTask {
  const parsedName = fileName ?? url.split('/').filter(Boolean).at(-1) ?? 'download.bin';
  return {
    id: crypto.randomUUID(),
    url,
    fileName: parsedName,
    savePath: savePath ?? '',
    totalSize: 0,
    downloadedSize: 0,
    speed: 0,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
  };
}

function updateStatus(
  tasks: Map<string, DownloadTask>,
  id: string,
  status: DownloadTask['status'],
  error?: string,
): void {
  const task = tasks.get(id);
  if (!task) return;
  tasks.set(id, { ...task, status, error });
}
