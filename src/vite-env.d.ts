// @author: codex | phase: 1 | types: vite-env
// @author: claude | phase: v0.2 | fix: complete-toolbox-types
/// <reference types="vite/client" />

interface FileFilter {
  name: string;
  extensions: string[];
}

interface Window {
  toolbox?: {
    file?: {
      read: (path: string) => Promise<string>;
      write: (path: string, content: string) => Promise<boolean>;
      openDialog: (filters?: FileFilter[]) => Promise<string | null>;
      openDirectory: (title?: string) => Promise<string | null>;
      saveDialog: (defaultName: string, filters?: FileFilter[]) => Promise<string | null>;
      fetchImage: (url: string) => Promise<string | null>;
    };
    clipboard?: {
      write: (text: string) => Promise<void>;
      read: () => Promise<string>;
    };
    app?: {
      getVersion: () => Promise<string>;
      getUserPluginsDir: () => Promise<string>;
      quit: () => Promise<void>;
      toggleDevTools?: () => Promise<void>;
      reportError?: (payload: { level: string; source: string; message: string; stack?: string }) => void;
      exportErrorReport?: () => Promise<string>;
      getErrorLogPath?: () => Promise<string>;
      listErrorLogs?: () => Promise<{ name: string; path: string }[]>;
      readErrorLog?: (filePath: string) => Promise<string>;
    };
    shell?: {
      openExternal: (url: string) => Promise<void>;
    };
    dir?: {
      scan: (dirPath: string) => Promise<string[]>;
    };
    color?: {
      pickScreen: () => Promise<string | null>;
    };
    market?: {
      fetchIndex: (url: string) => Promise<{ ok: boolean; index?: unknown; error?: string }>;
      inspectPackage: (path: string) => Promise<{ ok: boolean; packet?: unknown; error?: string }>;
      installPackage: (sourcePath: string, expectedId: string) => Promise<{ ok: boolean; installed?: unknown; packet?: unknown; error?: string }>;
      downloadPackage: (url: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
      uninstallPackage: (id: string) => Promise<boolean>;
    };
    window?: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
    };
    python?: {
      start: () => Promise<{ ok: boolean; error?: string }>;
      send: (cmd: object) => Promise<{ ok: boolean; error?: string }>;
      kill: () => Promise<{ ok: boolean }>;
      onOutput: (callback: (line: string) => void) => void;
      offOutput: () => void;
    };
  };
}
