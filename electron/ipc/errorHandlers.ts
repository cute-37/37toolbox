// @author: claude | phase: v0.5 | electron: enhanced-error-handlers
// ================================================================
// 全局错误收集 — 结构化日志 + 诊断报告 + 用户友好导出
// 日志路径: %APPDATA%/37工具箱/error-logs/
// ================================================================

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';

const LOG_DIR = join(app.getPath('userData'), 'error-logs');
const DIAG_DIR = join(app.getPath('userData'), 'crash-reports');
const MAX_LOG_FILES = 30; // 只保留最近30个日志文件

// ====== 诊断信息收集 ======

interface ErrorContext {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
  lang: string;
  memoryMB: { total: number; free: number; used: number };
  uptimeMinutes: number;
  isPackaged: boolean;
}

function collectContext(): ErrorContext {
  const mem = process.getSystemMemoryInfo();
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    nodeVersion: process.versions.node ?? '',
    platform: process.platform,
    arch: process.arch,
    osRelease: require('node:os').release(),
    lang: process.env.LANG ?? app.getLocale(),
    memoryMB: {
      total: Math.round((mem.total ?? 0) / 1024 / 1024),
      free: Math.round((mem.free ?? 0) / 1024 / 1024),
      used: Math.round(((mem.total ?? 0) - (mem.free ?? 0)) / 1024 / 1024),
    },
    uptimeMinutes: Math.round(process.uptime() / 60),
    isPackaged: app.isPackaged,
  };
}

// ====== 日志文件管理 ======

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch {}
  }
}

function logPath(date: string): string {
  return join(LOG_DIR, `37toolbox-${date}.log`);
}

function writeEntry(level: string, source: string, message: string, stack?: string, tags: string[] = []): void {
  ensureDir(LOG_DIR);
  const ts = new Date().toISOString();
  const tagStr = tags.length > 0 ? ` [${tags.join(',')}]` : '';
  const entry = [
    `[${ts}] [${level}] [${source}]${tagStr}`,
    `  msg: ${message}`,
    stack ? `  stack:\n${stack.split('\n').map((l) => `    ${l}`).join('\n')}` : '',
    '---',
  ].join('\n') + '\n';

  try {
    const file = logPath(new Date().toISOString().slice(0, 10));
    appendFileSync(file, entry, 'utf-8');
  } catch {}

  console.error(entry);
}

function pruneOldLogs(): void {
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse();
    if (files.length > MAX_LOG_FILES) {
      for (const f of files.slice(MAX_LOG_FILES)) {
        try { require('node:fs').unlinkSync(join(LOG_DIR, f)); } catch {}
      }
    }
  } catch {}
}

// ====== 诊断报告生成 ======

interface DiagnosticReport {
  timestamp: string;
  context: ErrorContext;
  recentErrors: { timestamp: string; level: string; source: string; message: string }[];
  recentLogs: string[];
}

function generateReport(): DiagnosticReport {
  const context = collectContext();
  const recentErrors: DiagnosticReport['recentErrors'] = [];

  // 读取今天的日志
  try {
    const date = new Date().toISOString().slice(0, 10);
    const content = readFileSync(logPath(date), 'utf-8');
    const sections = content.split('\n---\n').filter(Boolean).slice(-20); // 最近20条
    for (const section of sections) {
      const lines = section.trim().split('\n');
      const headerMatch = lines[0]?.match(/\[(.+?)\] \[(\w+)\] \[(.+?)\]/);
      const msgMatch = lines[1]?.match(/^\s*msg:\s*(.+)/);
      if (headerMatch && msgMatch) {
        recentErrors.push({
          timestamp: headerMatch[1],
          level: headerMatch[2],
          source: headerMatch[3],
          message: msgMatch[1],
        });
      }
    }
  } catch {}

  // 列出所有日志文件
  let recentLogs: string[] = [];
  try {
    recentLogs = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 7)
      .map((f) => join(LOG_DIR, f));
  } catch {}

  return { timestamp: new Date().toISOString(), context, recentErrors, recentLogs };
}

function writeCrashReport(level: string, message: string, stack?: string): string {
  ensureDir(DIAG_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(DIAG_DIR, `crash-${ts}.txt`);
  const context = collectContext();
  const report = [
    '========================================',
    '  37工具箱 Crash Report',
    '========================================',
    `Time:     ${new Date().toISOString()}`,
    `Level:    ${level}`,
    `Message:  ${message}`,
    '',
    '--- Diagnostic Info ---',
    `Version:        ${context.appVersion}`,
    `Electron:       ${context.electronVersion}`,
    `Node.js:        ${context.nodeVersion}`,
    `Platform:       ${context.platform} / ${context.arch}`,
    `OS Release:     ${context.osRelease}`,
    `Locale:         ${context.lang}`,
    `Memory:         ${context.memoryMB.used}MB used / ${context.memoryMB.total}MB total`,
    `Uptime:         ${context.uptimeMinutes} 分钟`,
    `Packaged:       ${context.isPackaged}`,
    '',
    '--- Stack Trace ---',
    stack || '(no stack trace)',
    '',
    '========================================',
    '将本文件发送给开发者以帮助诊断问题。',
    '========================================',
  ].join('\n');

  try { appendFileSync(file, report, 'utf-8'); } catch {}
  return file;
}

// ====== IPC 注册 ======

export function registerErrorHandlers(): void {
  pruneOldLogs();

  // 渲染进程上报错误（增强版：自动附确诊信息）
  ipcMain.on('error:report', (_event, payload: {
    level: string;
    source: string;
    message: string;
    stack?: string;
    tags?: string[];
  }) => {
    writeEntry(payload.level ?? 'ERROR', payload.source ?? 'renderer', payload.message, payload.stack, payload.tags);
  });

  // 获取诊断报告
  ipcMain.handle('error:diagnosticReport', () => {
    return generateReport();
  });

  // 导出完整错误报告（纯文本，可直接复制发送给开发者）
  ipcMain.handle('error:exportReport', () => {
    const diag = generateReport();
    const lines = [
      '========================================',
      '  37工具箱 错误报告',
      '========================================',
      `生成时间: ${diag.timestamp}`,
      `版本:     ${diag.context.appVersion}`,
      `系统:     ${diag.context.platform} / ${diag.context.arch} / ${diag.context.osRelease}`,
      `运行时长: ${diag.context.uptimeMinutes} 分钟`,
      `内存:     ${diag.context.memoryMB.used}MB / ${diag.context.memoryMB.total}MB`,
      '',
      '--- 最近错误 ---',
      ...(diag.recentErrors.length > 0
        ? diag.recentErrors.map((e) => `[${e.timestamp}] [${e.source}] ${e.message}`)
        : ['(无错误记录)']
      ),
      '',
      '--- 日志文件 ---',
      ...diag.recentLogs.map((f) => `  ${f}`),
      '',
      '========================================',
    ];
    return lines.join('\n');
  });

  // 获取日志路径
  ipcMain.handle('error:logPath', () => logPath(new Date().toISOString().slice(0, 10)));

  // 列出所有日志文件
  ipcMain.handle('error:listLogs', () => {
    try {
      return readdirSync(LOG_DIR)
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse()
        .map((f) => ({ name: f, path: join(LOG_DIR, f) }));
    } catch { return []; }
  });

  // 读取指定日志文件内容
  ipcMain.handle('error:readLog', (_event, filePath: string) => {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return content.slice(-50000); // 只返回最近 50KB
    } catch { return ''; }
  });
}

// ====== 主进程全局捕获 ======

export function registerGlobalErrorCapture(): void {
  process.on('uncaughtException', (err: Error) => {
    const crashFile = writeCrashReport('FATAL', err.message, err.stack);
    writeEntry('FATAL', 'main', err.message, err.stack, ['crash']);
    try {
      const { dialog } = require('electron');
      dialog.showErrorBox(
        '37工具箱 遇到严重错误',
        `${err.message || '未知错误'}\n\n崩溃报告已保存到:\n${crashFile}\n\n请将此文件发送给开发者以帮助修复。\n点击确定后应用将退出。`,
      );
      app.exit(1);
    } catch {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    writeEntry('ERROR', 'main:unhandledRejection', msg, stack, ['promise']);
  });
}
