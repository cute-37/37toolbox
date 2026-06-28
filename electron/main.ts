// @author: codex | phase: 1 | electron: main-process
// @author: claude | phase: 6 | fix: chinese-path-encoding
import { join } from 'node:path';

import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';

import { registerAppHandlers } from './ipc/appHandlers';
import { registerClipboardHandlers } from './ipc/clipboardHandlers';
import { registerDirHandlers } from './ipc/dirHandlers';
import { registerErrorHandlers, registerGlobalErrorCapture } from './ipc/errorHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerMarketHandlers } from './ipc/marketHandlers';
import { registerPythonHandlers } from './ipc/pythonHandlers';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

/**
 * 获取项目根目录。
 * 开发模式用 process.cwd()（用户从项目根执行 npm run dev），
 * 生产模式用 app.getAppPath()（打包后的 asar 根目录）。
 * 这样绕过了 Windows 中文路径下 import.meta.url 的编码问题。
 */
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const ROOT = isDev ? process.cwd() : app.getAppPath();
const APP_ICON_PATH = join(ROOT, 'resources/icon.ico');
const TRAY_ICON_PATH = join(ROOT, 'resources/icon.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.cowork3p.37toolbox');
}

const windowConfig: BrowserWindowConstructorOptions = {
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  title: '37工具箱',
  icon: APP_ICON_PATH,
  frame: false,
  thickFrame: false,
  webPreferences: {
    preload: join(ROOT, 'dist-electron/preload.mjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};

/** 创建中文应用菜单，供系统快捷键与托盘环境使用。 */
function createApplicationMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '隐藏到托盘', click: (): void => mainWindow?.hide() },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CommandOrControl+Q',
          click: (): void => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '重置缩放', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', click: (): void => mainWindow?.close() },
      ],
    },
    {
      label: '帮助',
      submenu: [{ label: '关于 37工具箱', click: (): void => mainWindow?.show() }],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

/** 创建主窗口并加载开发或生产入口。 */
async function createWindow(): Promise<void> {
  try {
    mainWindow = new BrowserWindow(windowConfig);
  } catch (err) {
    console.error('创建窗口失败:', err);
    dialog.showErrorBox('启动失败', `无法创建应用窗口: ${err instanceof Error ? err.message : '未知错误'}`);
    app.quit();
    return;
  }

  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId): void => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL): void => {
      console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    mainWindow.webContents.on('render-process-gone', (_event, details): void => {
      console.error('[renderer:gone]', details);
    });
  }

  try {
    if (isDev) {
      const devUrl = process.env.VITE_DEV_SERVER_URL;
      if (!devUrl) throw new Error('VITE_DEV_SERVER_URL 未设置');
      await mainWindow.loadURL(devUrl);
    } else {
      await mainWindow.loadFile(join(ROOT, 'dist/index.html'));
    }
  } catch (err) {
    console.error('加载页面失败:', err);
    dialog.showErrorBox('启动失败', `无法加载页面: ${err instanceof Error ? err.message : '未知错误'}`);
    app.quit();
    return;
  }

  mainWindow.on('close', (event): void => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

/** 创建系统托盘菜单。 */
function createTray(): void {
  try {
    tray = new Tray(TRAY_ICON_PATH);
  } catch (err) {
    console.warn('托盘图标加载失败，使用空托盘:', err);
    tray = new Tray(nativeImage.createEmpty());
  }
  const menu = Menu.buildFromTemplate([
    { label: '显示窗口', click: (): void => mainWindow?.show() },
    {
      label: '退出',
      click: (): void => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip('37工具箱');
  tray.setContextMenu(menu);
  tray.on('click', (): void => {
    mainWindow?.show();
  });
}

/** 注册主进程能力。 */
function registerMainProcess(): void {
  registerGlobalErrorCapture();
  registerFileHandlers();
  registerDirHandlers();
  registerClipboardHandlers();
  registerAppHandlers();
  registerMarketHandlers();
  registerPythonHandlers();
  registerErrorHandlers();
  ipcMain.handle('window:minimize', (): void => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:toggleMaximize', (): void => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', (): void => {
    mainWindow?.close();
  });
  ipcMain.handle('app:toggleDevTools', (): void => {
    mainWindow?.webContents.toggleDevTools();
  });
  ipcMain.handle('color:pickScreen', async (): Promise<string | null> => pickScreenColor());
  globalShortcut.register('CommandOrControl+Shift+K', (): void => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
      return;
    }
    mainWindow?.show();
  });
}

/** 初始化自动更新。开发环境跳过，避免本地调试时误请求发布源。 */
function initializeAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.on('error', (error): void => {
    console.error('[autoUpdater:error]', error);
  });
  autoUpdater.on('update-available', (): void => {
    console.log('[autoUpdater] update available');
  });
  autoUpdater.on('update-not-available', (): void => {
    console.log('[autoUpdater] update not available');
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown): void => {
    console.error('[autoUpdater:check-failed]', error);
  });
}

async function pickScreenColor(): Promise<string | null> {
  const displays = screen.getAllDisplays();
  const maxWidth = Math.max(...displays.map((display) => Math.round(display.size.width * display.scaleFactor)));
  const maxHeight = Math.max(...displays.map((display) => Math.round(display.size.height * display.scaleFactor)));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxWidth, height: maxHeight },
  });
  if (!sources.length) {
    return null;
  }

  const wasVisible = mainWindow?.isVisible() ?? false;
  mainWindow?.hide();

  return new Promise((resolve) => {
    const channel = `color:overlay-picked:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const overlays: BrowserWindow[] = [];
    let resolved = false;
    let closedCount = 0;

    const finish = (value: string | null): void => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeAllListeners(channel);
      overlays.forEach((overlay) => {
        if (!overlay.isDestroyed()) overlay.close();
      });
      if (wasVisible) mainWindow?.show();
      resolve(value);
    };

    ipcMain.once(channel, (_event, value: string | null): void => {
      finish(value);
    });

    displays.forEach((display, index) => {
      const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[index] ?? sources[0];
      const dataUrl = source.thumbnail.toDataURL();
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#000000',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
        },
      });
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.on('closed', (): void => {
        closedCount += 1;
        if (closedCount >= overlays.length && !resolved) finish(null);
      });
      const html = createColorPickerOverlayHtml(channel);
      void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      overlay.webContents.once('did-finish-load', (): void => {
        overlay.webContents.send('color:overlay-image', dataUrl);
      });
      overlays.push(overlay);
    });
  });
}

function createColorPickerOverlayHtml(channel: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; cursor: crosshair; background: #000; user-select: none; }
canvas { width: 100vw; height: 100vh; display: block; }
.tip { position: fixed; left: 16px; top: 16px; padding: 8px 10px; border-radius: 4px; background: rgba(0,0,0,.72); color: #fff; font: 13px system-ui, sans-serif; pointer-events: none; }
</style>
</head>
<body>
<canvas id="screen"></canvas>
<div class="tip">点击取色，Esc 取消</div>
<script>
const { ipcRenderer } = require('electron');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const img = new Image();
let ready = false;
img.onload = () => {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ready = true;
};
ipcRenderer.on('color:overlay-image', (_event, dataUrl) => {
  img.src = dataUrl;
});
function toHex(value) { return value.toString(16).padStart(2, '0'); }
window.addEventListener('click', (event) => {
  if (!ready) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)));
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  ipcRenderer.send(${JSON.stringify(channel)}, '#' + toHex(pixel[0]) + toHex(pixel[1]) + toHex(pixel[2]));
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') ipcRenderer.send(${JSON.stringify(channel)}, null);
});
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  ipcRenderer.send(${JSON.stringify(channel)}, null);
});
</script>
</body>
</html>`;
}

app.whenReady().then(async (): Promise<void> => {
  registerMainProcess();
  createApplicationMenu();
  await createWindow();
  createTray();
  initializeAutoUpdater();
});

app.on('before-quit', (): void => {
  isQuitting = true;
});

app.on('will-quit', (): void => {
  globalShortcut.unregisterAll();
});

app.on('activate', async (): Promise<void> => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
