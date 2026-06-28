// @author: codex | phase: 1 | electron: clipboard-ipc-handlers
import { clipboard, ipcMain } from 'electron';

interface ClipboardWritePayload {
  text: string;
}

/** 注册剪贴板 IPC。 */
export function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard:write', (_event, payload: ClipboardWritePayload): void => {
    clipboard.writeText(payload.text);
  });

  ipcMain.handle('clipboard:read', (): string => {
    return clipboard.readText();
  });
}
