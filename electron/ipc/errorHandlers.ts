// @author: claude | phase: v0.3 | electron: error-ipc-handlers
// ================================================================
// 全局错误上报 — 主进程 + 渲染进程双向捕获
// ================================================================

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';

const LOG_DIR = join(app.getPath('userData'), 'error-logs');
const LOG_FILE = join(LOG_DIR, `error-${new Date().toISOString().slice(0, 10)}.log`);

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  }
}

function writeLog(level: string, source: string, message: string, stack?: string): void {
  ensureLogDir();
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] [${source}] ${message}${stack ? `\n${stack}` : ''}\n`;
  try {
    appendFileSync(LOG_FILE, entry, 'utf-8');
  } catch {}
  console.error(entry);
}

/** 获取最近的错误日志路径 */
function getLogPath(): string {
  ensureLogDir();
  return LOG_FILE;
}

/** 获取所有错误日志列表 */
function listLogs(): string[] {
  try {
    const { readdirSync } = require('node:fs');
    return readdirSync(LOG_DIR)
      .filter((f: string) => f.endsWith('.log'))
      .sort()
      .reverse()
      .map((f: string) => join(LOG_DIR, f));
  } catch { return []; }
}

/** 注册错误相关 IPC */
export function registerErrorHandlers(): void {
  // 渲染进程上报错误
  ipcMain.on('error:report', (_event, payload: {
    level: string;
    source: string;
    message: string;
    stack?: string;
  }) => {
    writeLog(payload.level ?? 'ERROR', payload.source ?? 'renderer', payload.message, payload.stack);
  });

  // 获取日志路径
  ipcMain.handle('error:logPath', () => getLogPath());

  // 列出所有日志
  ipcMain.handle('error:listLogs', () => listLogs());
}

/**
 * 应用启动时调用 — 捕获主进程未处理的崩溃，写入日志并弹窗通知。
 */
export function registerGlobalErrorCapture(): void {
  process.on('uncaughtException', (err: Error) => {
    writeLog('FATAL', 'main', err.message, err.stack);
    try {
      const { dialog } = require('electron');
      dialog.showErrorBox('37工具箱 遇到错误', `${err.message}\n\n错误日志已保存到:\n${getLogPath()}\n\n请重启应用。`);
      app.exit(1);
    } catch {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    writeLog('ERROR', 'main:unhandledRejection', msg, stack);
  });
}
