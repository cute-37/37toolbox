// @author: claude | phase: pixiv-tool | engine
// Pixiv 下载器引擎 — 通过 Electron IPC 调用 Python bridge.py

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

export interface PixivConfig {
  storageMode: string;
  localSavePath: string;
  dbPath: string;
  logDir: string;
  tempPath: string;
  avatarsPath: string;
  nasIp: string;
  nasUser: string;
  nasPass: string;
  nasShare: string;
  nasBasePath: string;
  nasRemoteName: string;
  sftpHost: string;
  sftpPort: number;
  sftpUser: string;
  sftpPass: string;
  sftpPrivateKey: string;
  sftpBasePath: string;
  ftpHost: string;
  ftpPort: number;
  ftpUser: string;
  ftpPass: string;
  ftpBasePath: string;
  ftpTls: boolean;
  webdavUrl: string;
  webdavUser: string;
  webdavPass: string;
  webdavBasePath: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Prefix: string;
  s3ForcePathStyle: boolean;
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
  type: string;
  ok?: boolean;
  message?: string;
  error?: string;
  data?: any;
  count?: number;
  code?: number;
}

export type ProgressCallback = (msg: ProgressMessage) => void;

export interface DatabaseStats {
  artists: number;
  illusts: number;
  done: number;
  pending: number;
  failed: number;
}

interface MessageWaiter<T> {
  type: string;
  map: (msg: ProgressMessage) => T | null;
  resolve: (value: T | null) => void;
  timer: number;
}

const waiters: MessageWaiter<unknown>[] = [];
let progressHandler: ProgressCallback | null = null;

function dispatchLine(line: string): void {
  let msg: ProgressMessage;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  for (let i = waiters.length - 1; i >= 0; i -= 1) {
    const waiter = waiters[i];
    if (waiter.type === msg.type) {
      window.clearTimeout(waiter.timer);
      waiters.splice(i, 1);
      waiter.resolve(waiter.map(msg));
    }
  }

  progressHandler?.(msg);
}

function getPython() {
  return (window as any).toolbox?.python as {
    start(): Promise<{ok: boolean; error?: string}>;
    send(cmd: object): Promise<{ok: boolean; error?: string}>;
    kill(): Promise<{ok: boolean}>;
    onOutput(cb: (line: string) => void): void;
    offOutput(): void;
  } | undefined;
}

function waitForMessage<T>(
  action: string,
  args: Record<string, unknown>,
  type: string,
  map: (msg: ProgressMessage) => T | null,
  timeout = 5000,
): Promise<T | null> {
  const py = getPython();
  if (!py) return Promise.resolve(null);
  return new Promise((resolve) => {
    const waiter: MessageWaiter<T> = {
      type,
      map,
      resolve,
      timer: window.setTimeout(() => {
        const index = waiters.indexOf(waiter as MessageWaiter<unknown>);
        if (index >= 0) waiters.splice(index, 1);
        resolve(null);
      }, timeout),
    };
    waiters.push(waiter as MessageWaiter<unknown>);
    py.send({action, args});
  });
}

export async function startBridge(onProgress: ProgressCallback): Promise<{ok: boolean; error?: string}> {
  const py = getPython();
  if (!py) return {ok: false, error: 'Python bridge 不可用（非 Electron 环境）'};
  py.offOutput();
  progressHandler = onProgress;
  py.onOutput(dispatchLine);
  return py.start();
}

export async function stopBridge(): Promise<void> {
  const py = getPython();
  if (!py) return;
  progressHandler = null;
  waiters.splice(0).forEach((waiter) => {
    window.clearTimeout(waiter.timer);
    waiter.resolve(null);
  });
  py.offOutput();
  await py.kill();
}

export async function getStatus(): Promise<StatusData | null> {
  return waitForMessage<StatusData>('status', {}, 'status', (m) => (m.ok ? m.data as StatusData : null), 2000);
}

export async function getConfig(): Promise<PixivConfig | null> {
  return waitForMessage<PixivConfig>('config:get', {}, 'config', (m) => (m.ok ? m.data as PixivConfig : null), 3000);
}

export async function updateConfig(data: Partial<PixivConfig>): Promise<boolean> {
  return (await waitForMessage<boolean>('config:set', data, 'config_saved', (m) => m.ok === true, 3000)) === true;
}

export async function getDatabaseStats(): Promise<DatabaseStats | null> {
  return waitForMessage<DatabaseStats>(
    'db:stats',
    {},
    'db_stats',
    (m) => (m.ok ? m.data as DatabaseStats : null),
    5000,
  );
}

async function runDataCommand(action: string, path: string): Promise<boolean> {
  const result = await waitForMessage<boolean>(
    action,
    {path},
    'data_result',
    (m) => m.ok === true,
    10000,
  );
  return result === true;
}

export async function exportDatabase(path: string): Promise<boolean> {
  return runDataCommand('db:export', path);
}

export async function importDatabase(path: string): Promise<boolean> {
  return runDataCommand('db:import', path);
}

export async function backupDatabase(path: string): Promise<boolean> {
  return runDataCommand('db:backup', path);
}

export async function exportPixivSettings(path: string): Promise<boolean> {
  return runDataCommand('settings:export', path);
}

export async function importPixivSettings(path: string): Promise<boolean> {
  return runDataCommand('settings:import', path);
}

export async function validatePath(path: string): Promise<{ok: boolean; message: string}> {
  return await waitForMessage<{ok: boolean; message: string}>(
    'validate:path',
    {path},
    'validate',
    (m) => ({ok: m.ok === true, message: String(m.message ?? '')}),
    5000,
  ) ?? {ok: false, message: '超时'};
}

export async function startSync(deep: boolean, artistId?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({action: 'sync', args: {deep, aid: artistId ?? null}});
}

export async function startDownload(limit?: number, artistId?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({action: 'download', args: {limit: limit ?? null, aid: artistId ?? null}});
}

export async function startSyncAndDownload(deep: boolean, limit?: number): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({action: 'sync-and-download', args: {deep, limit: limit ?? null}});
}

export async function getTokenUrl(): Promise<{url: string; verifier: string} | null> {
  return waitForMessage<{url: string; verifier: string}>('token:url', {}, 'token_url', (m) => (m.ok ? m.data as {url: string; verifier: string} : null), 5000);
}

export async function exchangeToken(code: string, verifier: string, name?: string, remark?: string): Promise<{ok: boolean; name?: string; username?: string; error?: string}> {
  return await waitForMessage<{ok: boolean; name?: string; username?: string; error?: string}>(
    'token:exchange',
    {code, verifier, name: name ?? '', remark: remark ?? ''},
    'token_result',
    (m) => ({ok: m.ok === true, name: m.data?.name, username: m.data?.username, error: m.error}),
    15000,
  ) ?? {ok: false, error: '超时'};
}

export async function testTokens(): Promise<boolean> {
  return (await waitForMessage<boolean>('token:test', {}, 'token_test_done', () => true, 10000)) === true;
}

export async function removeToken(name: string): Promise<boolean> {
  return (await waitForMessage<boolean>('token:remove', {name}, 'token_removed', (m) => m.ok !== false, 3000)) === true;
}

export async function setMainAccount(name: string): Promise<boolean> {
  return (await waitForMessage<boolean>('account:set-main', {name}, 'account_set', (m) => m.ok !== false, 3000)) === true;
}

export async function getPreview(limit = 20): Promise<unknown[]> {
  return await waitForMessage<unknown[]>('preview', {limit}, 'preview', (m) => (m.ok ? m.data as unknown[] : []), 5000) ?? [];
}

export async function retryFailed(): Promise<number> {
  return await waitForMessage<number>('retry', {}, 'retry_done', (m) => (m.ok ? Number(m.count ?? 0) : 0), 3000) ?? 0;
}

export async function requestStop(): Promise<void> {
  const py = getPython();
  if (!py) return;
  await py.send({action: 'stop'});
}
