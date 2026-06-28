// @author: codex | phase: 5-fix | electron: dir-ipc-handlers
import { readdir } from 'node:fs/promises';

import { ipcMain } from 'electron';

interface DirScanPayload {
  dirPath: string;
}

/** 注册目录枚举 IPC，仅返回指定目录下的子目录名。 */
export function registerDirHandlers(): void {
  ipcMain.handle('dir:scan', async (_event, payload: DirScanPayload): Promise<string[]> => {
    try {
      const entries = await readdir(payload.dirPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name);
    } catch (error) {
      console.error(`目录扫描失败：${payload.dirPath}`, error);
      return [];
    }
  });
}
