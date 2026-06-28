// @author: codex | phase: 1 | electron: preload-ipc-bridge
import { contextBridge, ipcRenderer } from 'electron';
import type { FileFilter } from 'electron';

interface FileReadPayload {
  path: string;
}

interface FileWritePayload {
  path: string;
  content: string;
}

interface FileAPI {
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<boolean>;
  openDialog: (filters?: FileFilter[]) => Promise<string | null>;
  openDirectory: (title?: string) => Promise<string | null>;
  saveDialog: (defaultName: string, filters?: FileFilter[]) => Promise<string | null>;
  fetchImage: (url: string) => Promise<string | null>;
}

interface ClipboardAPI {
  write: (text: string) => Promise<void>;
  read: () => Promise<string>;
}

interface AppAPI {
  getVersion: () => Promise<string>;
  getUserPluginsDir: () => Promise<string>;
  quit: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
  reportError: (payload: { level: string; source: string; message: string; stack?: string }) => void;
}

interface WindowAPI {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

interface ShellAPI {
  openExternal: (url: string) => Promise<void>;
}

interface DirAPI {
  scan: (dirPath: string) => Promise<string[]>;
}

interface ColorAPI {
  pickScreen: () => Promise<string | null>;
}

interface MarketInspectResult {
  ok: boolean;
  packet?: unknown;
  error?: string;
}

interface MarketInstallResult {
  ok: boolean;
  installed?: unknown;
  packet?: unknown;
  error?: string;
}

interface MarketDownloadResult {
  ok: boolean;
  path?: string;
  error?: string;
}

interface MarketAPI {
  inspectPackage: (path: string) => Promise<MarketInspectResult>;
  installPackage: (sourcePath: string, expectedId: string) => Promise<MarketInstallResult>;
  downloadPackage: (url: string) => Promise<MarketDownloadResult>;
  uninstallPackage: (id: string) => Promise<boolean>;
}

const fileApi: FileAPI = {
  read(path: string): Promise<string> {
    const payload: FileReadPayload = { path };
    return ipcRenderer.invoke('file:read', payload);
  },
  write(path: string, content: string): Promise<boolean> {
    const payload: FileWritePayload = { path, content };
    return ipcRenderer.invoke('file:write', payload);
  },
  openDialog(filters: FileFilter[] = []): Promise<string | null> {
    return ipcRenderer.invoke('file:openDialog', { filters });
  },
  openDirectory(title?: string): Promise<string | null> {
    return ipcRenderer.invoke('file:openDirectory', { title });
  },
  saveDialog(defaultName: string, filters: FileFilter[] = []): Promise<string | null> {
    return ipcRenderer.invoke('file:saveDialog', { defaultName, filters });
  },
  fetchImage(url: string): Promise<string | null> {
    return ipcRenderer.invoke('file:fetchImage', url);
  },
};

const clipboardApi: ClipboardAPI = {
  write(text: string): Promise<void> {
    return ipcRenderer.invoke('clipboard:write', { text });
  },
  read(): Promise<string> {
    return ipcRenderer.invoke('clipboard:read');
  },
};

const appApi: AppAPI = {
  getVersion(): Promise<string> {
    return ipcRenderer.invoke('app:getVersion');
  },
  getUserPluginsDir(): Promise<string> {
    return ipcRenderer.invoke('app:getUserPluginsDir');
  },
  quit(): Promise<void> {
    return ipcRenderer.invoke('app:quit');
  },
  toggleDevTools(): Promise<void> {
    return ipcRenderer.invoke('app:toggleDevTools');
  },
  reportError(payload: { level: string; source: string; message: string; stack?: string }): void {
    ipcRenderer.send('error:report', payload);
  },
};

const windowApi: WindowAPI = {
  minimize(): Promise<void> {
    return ipcRenderer.invoke('window:minimize');
  },
  toggleMaximize(): Promise<void> {
    return ipcRenderer.invoke('window:toggleMaximize');
  },
  close(): Promise<void> {
    return ipcRenderer.invoke('window:close');
  },
};

const shellApi: ShellAPI = {
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke('shell:openExternal', { url });
  },
};

const dirApi: DirAPI = {
  scan(dirPath: string): Promise<string[]> {
    return ipcRenderer.invoke('dir:scan', { dirPath });
  },
};

const colorApi: ColorAPI = {
  pickScreen(): Promise<string | null> {
    return ipcRenderer.invoke('color:pickScreen');
  },
};

const marketApi: MarketAPI = {
  inspectPackage(path: string): Promise<MarketInspectResult> {
    return ipcRenderer.invoke('market:inspectPackage', { path });
  },
  installPackage(sourcePath: string, expectedId: string): Promise<MarketInstallResult> {
    return ipcRenderer.invoke('market:installPackage', { sourcePath, expectedId });
  },
  downloadPackage(url: string): Promise<MarketDownloadResult> {
    return ipcRenderer.invoke('market:downloadPackage', { url });
  },
  uninstallPackage(id: string): Promise<boolean> {
    return ipcRenderer.invoke('market:uninstallPackage', { id });
  },
};

interface PythonAPI {
  start: () => Promise<{ ok: boolean; error?: string }>;
  send: (cmd: object) => Promise<{ ok: boolean; error?: string }>;
  kill: () => Promise<{ ok: boolean }>;
  onOutput: (callback: (line: string) => void) => void;
  offOutput: () => void;
}

const pythonApi: PythonAPI = {
  start(): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('python:start');
  },
  send(cmd: object): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('python:send', cmd);
  },
  kill(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('python:kill');
  },
  onOutput(callback: (line: string) => void): void {
    ipcRenderer.send('python:subscribe');
    ipcRenderer.on('python:output', (_event, line: string) => callback(line));
  },
  offOutput(): void {
    ipcRenderer.send('python:unsubscribe');
    ipcRenderer.removeAllListeners('python:output');
  },
};

contextBridge.exposeInMainWorld('toolbox', {
  file: fileApi,
  clipboard: clipboardApi,
  app: appApi,
  window: windowApi,
  shell: shellApi,
  dir: dirApi,
  color: colorApi,
  market: marketApi,
  python: pythonApi,
});
