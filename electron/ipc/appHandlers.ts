// @author: codex | phase: 1 | electron: app-ipc-handlers
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { app, ipcMain, shell } from 'electron';

interface OpenExternalPayload {
  url: string;
}

/** 注册应用控制与外部链接 IPC。 */
export function registerAppHandlers(): void {
  ipcMain.handle('app:getVersion', (): string => {
    return app.getVersion();
  });

  ipcMain.handle('app:getUserPluginsDir', async (): Promise<string> => {
    const dirPath = join(app.getPath('home'), '37工具箱', 'plugins');
    await mkdir(dirPath, { recursive: true });
    return dirPath;
  });

  ipcMain.handle('app:quit', (): void => {
    app.exit(0);
  });

  ipcMain.handle('shell:openExternal', async (_event, payload: OpenExternalPayload): Promise<void> => {
    await shell.openExternal(payload.url);
  });
}
