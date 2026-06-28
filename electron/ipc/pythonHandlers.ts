// @author: claude | phase: pixiv-tool | electron: python-ipc-handlers
// ================================================================
// Pixiv 下载器 Python 进程管理
// 在 Electron 主进程中 spawn Python bridge.py，通过 stdout JSON 行通信
// ================================================================

import { existsSync } from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';

let pythonProcess: ChildProcess | null = null;
let outputCallback: ((line: string) => void) | null = null;

/** 获取 Python 执行路径（优先 conda env "pix"，spawn 失败时自动 fallback） */
function getPythonPath(): string {
  const isWin = process.platform === 'win32';
  if (isWin) {
    // 优先尝试 conda env "pix"
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    const condaRoot = process.env.CONDA_EXE ? join(process.env.CONDA_EXE, '..', '..') : '';
    const candidates = [
      process.env.CONDA_PREFIX ? join(process.env.CONDA_PREFIX, 'python.exe') : '',
      condaRoot ? join(condaRoot, 'envs', 'pix', 'python.exe') : '',
      'D:\\Coding\\miniconda3\\envs\\pix\\python.exe',
      `${userProfile}\\miniconda3\\envs\\pix\\python.exe`,
      `${userProfile}\\anaconda3\\envs\\pix\\python.exe`,
      `${userProfile}\\.conda\\envs\\pix\\python.exe`,
      'python',
    ].filter(Boolean);
    // 返回第一个存在的，或默认 'python'
    for (const p of candidates) {
      try { if (p === 'python' || existsSync(p)) return p; } catch { /* fallthrough */ }
    }
    return 'python';
  }
  return 'python3';
}

/** 返回 bridge.py 路径 */
function getBridgePath(projectRoot: string): string {
  return join(projectRoot, '工具开发', 'pixiv-downloader', 'bridge.py');
}

/**
 * 启动 Python bridge（管道模式）。
 * bridge 启动后通过 stdout 逐行输出 JSON 消息，通过 stdin 接收 JSON 命令。
 */
function startBridge(projectRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pythonProcess && !pythonProcess.killed) {
      resolve();
      return;
    }

    const bridgePath = getBridgePath(projectRoot);
    const pythonExe = getPythonPath();

    if (!existsSync(bridgePath)) {
      reject(new Error(`Python bridge 不存在：${bridgePath}`));
      return;
    }

    pythonProcess = spawn(pythonExe, [bridgePath, '--pipe'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let ready = false;
    let stdoutBuffer = '';

    pythonProcess.stdout!.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        if (!ready && line.includes('"ready"')) {
          ready = true;
          resolve();
          continue;
        }
        if (outputCallback) {
          outputCallback(line);
        }
      }
    });

    pythonProcess.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg && outputCallback) {
        outputCallback(JSON.stringify({ type: 'stderr', message: msg }));
      }
    });

    pythonProcess.on('error', (err) => {
      if (!ready) reject(err);
    });

    pythonProcess.on('close', (code) => {
      const tail = stdoutBuffer.trim();
      if (tail && outputCallback) {
        outputCallback(tail);
      }
      stdoutBuffer = '';
      pythonProcess = null;
      if (!ready) {
        reject(new Error(`Python bridge 启动失败，退出码：${code ?? 'unknown'}`));
        return;
      }
      if (outputCallback) {
        outputCallback(JSON.stringify({ type: 'process_exit', code }));
      }
    });

    setTimeout(() => {
      if (!ready) {
        reject(new Error('Python bridge 启动超时，未收到 ready 消息'));
      }
    }, 5000);
  });
}

/** 向 Python bridge 发送一条 JSON 命令 */
function sendToBridge(cmd: object): void {
  if (!pythonProcess || pythonProcess.killed) {
    throw new Error('Python 进程未启动');
  }
  pythonProcess.stdin!.write(JSON.stringify(cmd) + '\n');
}

/** 注册所有 Pixiv Python IPC handlers */
export function registerPythonHandlers(): void {
  const projectRoot = process.env.VITE_DEV_SERVER_URL
    ? process.cwd()
    : process.resourcesPath;

  ipcMain.handle('python:start', async () => {
    try {
      await startBridge(projectRoot);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('python:send', async (_event, cmd: object) => {
    try {
      sendToBridge(cmd);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('python:kill', async () => {
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill();
      pythonProcess = null;
    }
    return { ok: true };
  });

  // 注册一个 renderer → main 单向流式回调通道
  ipcMain.on('python:subscribe', (event) => {
    outputCallback = (line: string) => {
      try {
        event.sender.send('python:output', line);
      } catch {
        // renderer 可能已销毁
      }
    };
  });

  ipcMain.on('python:unsubscribe', () => {
    outputCallback = null;
  });
}
