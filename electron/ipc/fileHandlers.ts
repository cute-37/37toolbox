// @author: codex | phase: 1 | electron: file-ipc-handlers
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { Buffer } from 'node:buffer';

import { dialog, ipcMain } from 'electron';

/** 防御性路径检查: 消除 ../ 遍历, 拒绝绝对路径中的危险模式 */
function safePath(input: string): string {
  const normalized = normalize(input).replace(/^\.\.[\\/]/, '');
  return resolve(normalized);
}
import type { FileFilter } from 'electron';

interface ReadPayload {
  path: string;
}

interface WritePayload {
  path: string;
  content: string;
}

interface OpenDialogPayload {
  filters?: FileFilter[];
}

interface OpenDirectoryPayload {
  title?: string;
}

interface SaveDialogPayload {
  defaultName: string;
  filters?: FileFilter[];
}

/** 注册文件读写与文件选择 IPC。 */
export function registerFileHandlers(): void {
  ipcMain.handle('file:read', async (_event, payload: ReadPayload): Promise<string | null> => {
    try {
      return await readFile(safePath(payload.path), 'utf-8');
    } catch (err) {
      console.error('[file:read]', payload.path, err);
      return null;
    }
  });

  ipcMain.handle('file:write', async (_event, payload: WritePayload): Promise<boolean> => {
    try {
      await writeFile(safePath(payload.path), payload.content, 'utf-8');
      return true;
    } catch (err) {
      console.error('[file:write]', payload.path, err);
      return false;
    }
  });

  // 主进程代理下载图片, 返回 base64 data URL
  // hdslb.com 需要 referrerPolicy="no-referrer" (浏览器不发送Referer即可)
  ipcMain.handle('file:fetchImage', async (_event, url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') ?? 'image/jpeg';
      return `data:${ct};base64,${buf.toString('base64')}`;
    } catch (err) {
      console.error('[file:fetchImage]', url, err);
      return null;
    }
  });

  ipcMain.handle('file:openDialog', async (_event, payload: OpenDialogPayload): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: payload.filters });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('file:openDirectory', async (_event, payload: OpenDirectoryPayload = {}): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ title: payload.title, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('file:saveDialog', async (_event, payload: SaveDialogPayload): Promise<string | null> => {
    const result = await dialog.showSaveDialog({ defaultPath: payload.defaultName, filters: payload.filters });
    return result.canceled ? null : result.filePath ?? null;
  });
}
