// @author: claude | phase: pixiv-tool | engine
// ================================================================
// Pixiv 下载器引擎 — 通过 Electron IPC 调用 Python bridge.py
// ================================================================

// ====== 类型 ======

export interface AccountInfo {
  name: string;
  username: string;
  isMain: boolean;
  isValid: boolean;
  remark: string;
}

export interface StatusData {
  artists: number;
  illusts: number;
  done: number;
  pending: number;
  failed: number;
  accounts: AccountInfo[];
  storageMode: string;
  savePath: string;
  mainAccount: string;
}

export interface DbStats {
  artists: number;
  illusts: number;
  done: number;
  pending: number;
  failed: number;
}

export interface PixivConfig {
  storageMode: string;
  localSavePath: string;
  nasIp: string;
  nasUser: string;
  nasShare: string;
  nasBasePath: string;
  nasRemoteName: string;
  downloadThreads: number;
  mainAccountSyncThreads: number;
  backupAccountSyncThreads: number;
  mainAccountDownloadThreads: number;
  backupAccountDownloadThreads: number;
  metadataRefreshLimit: number;
  ugoiraOutput: string;
  rateLimitEnabled: boolean;
  autoThrottleEnabled: boolean;
  failureRateThreshold: number;
}

export interface ProgressMessage {
  type: 'progress' | 'sync_complete' | 'download_complete' | 'token_result' | 'error' | 'stderr' | 'process_exit' | 'cancelled';
  ok?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
  count?: number;
  code?: number;
}

export type ProgressCallback = (msg: ProgressMessage) => void;

// ====== 工具函数 ======

function getPython(): { start: () => Promise<{ ok: boolean; error?: string }>; send: (cmd: object) => Promise<{ ok: boolean; error?: string }>; kill: () => Promise<{ ok: boolean }>; onOutput: (cb: (line: string) => void) => void; offOutput: () => void } | undefined {
  return (window as any).toolbox?.python;
}

/**
 * 启动 Python bridge，订阅实时输出。
 * @param onProgress - 实时进度回调
 */
export async function startBridge(onProgress: ProgressCallback): Promise<{ ok: boolean; error?: string }> {
  const py = getPython();
  if (!py) return { ok: false, error: 'Python bridge 不可用（非 Electron 环境）' };

  py.offOutput();
  py.onOutput((line: string) => {
    try {
      const msg: ProgressMessage = JSON.parse(line);
      onProgress(msg);
    } catch {
      // 非 JSON 行忽略
    }
  });

  return py.start();
}

/** 停止 Python bridge */
export async function stopBridge(): Promise<void> {
  const py = getPython();
  if (!py) return;
  py.offOutput();
  await py.kill();
}

/** 获取状态 */
export async function getStatus(): Promise<StatusData | null> {
  const py = getPython();
  if (!py) return null;
  return new Promise((resolve) => {
    let result: StatusData | null = null;
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'status' && msg.ok) {
          result = msg.data;
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'status' }).then(() => {
      setTimeout(() => resolve(result), 1000);
    });
  });
}

/** 发送命令并等待指定类型的响应 */
async function sendAndWait<T>(action: string, args: Record<string, unknown> = {}, resultType: string, timeoutMs = 30000): Promise<T | null> {
  const py = getPython();
  if (!py) return null;

  return new Promise((resolve) => {
    let resolved = false;
    const handler = (line: string) => {
      if (resolved) return;
      try {
        const msg = JSON.parse(line);
        if (msg.type === resultType) {
          resolved = true;
          py.offOutput();
          resolve(msg as T);
        }
      } catch { /* ignore */ }
    };

    py.onOutput(handler);
    py.send({ action, args }).catch(() => resolve(null));

    setTimeout(() => {
      if (!resolved) {
        py.offOutput();
        resolve(null);
      }
    }, timeoutMs);
  });
}

/** 获取完整配置 */
export async function getConfig(): Promise<PixivConfig | null> {
  const py = getPython();
  if (!py) return null;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'config' && msg.ok) {
          py.offOutput();
          resolve(msg.data as PixivConfig);
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'config:get' });
    setTimeout(() => resolve(null), 3000);
  });
}

/** 更新配置 */
export async function updateConfig(data: Partial<PixivConfig>): Promise<boolean> {
  const py = getPython();
  if (!py) return false;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'config_saved') {
          resolve(msg.ok === true);
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'config:set', args: data });
    setTimeout(() => resolve(false), 3000);
  });
}

/** 验证路径 */
export async function validatePath(path: string): Promise<{ ok: boolean; message: string }> {
  const py = getPython();
  if (!py) return { ok: false, message: '不可用' };
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'validate') {
          resolve({ ok: msg.ok === true, message: String(msg.message ?? '') });
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'validate:path', args: { path } });
    setTimeout(() => resolve({ ok: false, message: '超时' }), 5000);
  });
}

/** 开始同步 */
export async function startSync(deep: boolean, artistId?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({ action: 'sync', args: { deep, aid: artistId ?? null } });
}

/** 开始下载 */
export async function startDownload(limit?: number, artistId?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({ action: 'download', args: { limit: limit ?? null, aid: artistId ?? null } });
}

/** 同步并下载 */
export async function startSyncAndDownload(deep: boolean, limit?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({ action: 'sync-and-download', args: { deep, limit: limit ?? null } });
}

/** 获取 token 授权 URL */
export async function getTokenUrl(): Promise<{ url: string; verifier: string } | null> {
  const py = getPython();
  if (!py) return null;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'token_url' && msg.ok) {
          resolve(msg.data as { url: string; verifier: string });
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'token:url' });
    setTimeout(() => resolve(null), 5000);
  });
}

/** 用授权码换取 token */
export async function exchangeToken(code: string, verifier: string, name?: string, remark?: string): Promise<{ ok: boolean; name?: string; username?: string; error?: string }> {
  const py = getPython();
  if (!py) return { ok: false, error: '不可用' };
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'token_result') {
          resolve({
            ok: msg.ok === true,
            name: msg.data?.name,
            username: msg.data?.username,
            error: msg.error,
          });
        }
      } catch { /* ignore */ }
    });
    py.send({ action: 'token:exchange', args: { code, verifier, name: name ?? '', remark: remark ?? '' } });
    setTimeout(() => resolve({ ok: false, error: '超时' }), 15000);
  });
}

/** 测试所有 token */
export async function testTokens(): Promise<boolean> {
  const py = getPython();
  if (!py) return false;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'token_test_done') resolve(true);
      } catch { /* ignore */ }
    });
    py.send({ action: 'token:test' });
    setTimeout(() => resolve(false), 10000);
  });
}

/** 删除账号 */
export async function removeToken(name: string): Promise<boolean> {
  const py = getPython();
  if (!py) return false;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'token_removed') resolve(true);
      } catch { /* ignore */ }
    });
    py.send({ action: 'token:remove', args: { name } });
    setTimeout(() => resolve(false), 3000);
  });
}

/** 设为主账号 */
export async function setMainAccount(name: string): Promise<boolean> {
  const py = getPython();
  if (!py) return false;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'account_set') resolve(true);
      } catch { /* ignore */ }
    });
    py.send({ action: 'account:set-main', args: { name } });
    setTimeout(() => resolve(false), 3000);
  });
}

/** 数据库统计 */
export async function getDbStats(): Promise<DbStats | null> {
  const py = getPython();
  if (!py) return null;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'db_stats' && msg.ok) resolve(msg.data as DbStats);
      } catch { /* ignore */ }
    });
    py.send({ action: 'db:stats' });
    setTimeout(() => resolve(null), 3000);
  });
}

/** 预览待处理任务 */
export async function getPreview(limit = 20): Promise<unknown[]> {
  const py = getPython();
  if (!py) return [];
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'preview' && msg.ok) resolve(msg.data as unknown[] ?? []);
      } catch { /* ignore */ }
    });
    py.send({ action: 'preview', args: { limit } });
    setTimeout(() => resolve([]), 5000);
  });
}

/** 重试失败任务 */
export async function retryFailed(): Promise<number> {
  const py = getPython();
  if (!py) return 0;
  return new Promise((resolve) => {
    py.onOutput((line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'retry_done' && msg.ok) resolve(Number(msg.count ?? 0));
      } catch { /* ignore */ }
    });
    py.send({ action: 'retry' });
    setTimeout(() => resolve(0), 3000);
  });
}

/** 请求停止 */
export async function requestStop(): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({ action: 'stop' });
}
