// @author: claude | phase: pixiv-tool | ui
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ToolProps } from '../../core/types';
import {
  manifest,
  startBridge, stopBridge, getStatus, getConfig, updateConfig, validatePath,
  startSync, startDownload, startSyncAndDownload,
  getTokenUrl, exchangeToken, testTokens, removeToken, setMainAccount,
  getDbStats, getPreview, retryFailed, requestStop,
  type StatusData, type PixivConfig, type ProgressMessage, type DbStats,
  type ProgressCallback,
} from './engine';

// ===================== 子组件 =====================

/** 进度日志面板 */
const LogPanel: React.FC<{ lines: string[]; running: boolean; onStop: () => void }> = ({ lines, running, onStop }) => (
  <div className="flex flex-col rounded-md border border-border bg-bg-secondary">
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="text-xs font-medium text-text-primary">
        {running ? '⏳ 运行中...' : '输出'}
      </span>
      {running && (
        <button onClick={onStop} className="rounded-sm bg-status-error px-2 py-0.5 text-2xs text-white hover:opacity-80">
          停止
        </button>
      )}
    </div>
    <pre className="max-h-80 overflow-y-auto p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
      {lines.length === 0 ? '等待操作...' : lines.map((l, i) => <div key={i}>{l}</div>)}
    </pre>
  </div>
);

/** 数据库统计卡片 */
const StatsCards: React.FC<{ stats: StatusData | null }> = ({ stats }) => {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {[
        ['画师', stats.artists],
        ['作品', stats.illusts],
        ['已下载', stats.done],
        ['待下载', stats.pending],
        ['失败', stats.failed],
      ].map(([label, value]) => (
        <div key={label} className="rounded-md border border-border bg-bg-secondary p-3 text-center">
          <div className="text-lg font-semibold text-text-primary">{value}</div>
          <div className="text-2xs text-text-secondary">{label}</div>
        </div>
      ))}
    </div>
  );
};

// ===================== 主组件 =====================

const PixivTool: React.FC<ToolProps> = ({ settings, onSettingsChange, onStatusChange }) => {
  const [tab, setTab] = useState<'ops' | 'accounts' | 'config'>('ops');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const logRef = useRef<string[]>([]);

  const addLog = useCallback((msg: string) => {
    logRef.current = [...logRef.current.slice(-500), msg];
    setLogs([...logRef.current]);
  }, []);

  const progressCb: ProgressCallback = useCallback((msg: ProgressMessage) => {
    if (msg.type === 'progress' || msg.type === 'stderr') {
      addLog(msg.type === 'stderr' ? `[stderr] ${msg.message}` : msg.message ?? '');
    } else if (msg.type === 'sync_complete' || msg.type === 'download_complete') {
      const prefix = msg.type === 'sync_complete' ? '[同步]' : '[下载]';
      addLog(msg.ok ? `${prefix} ${msg.message}` : `${prefix} 错误: ${msg.error || msg.message}`);
      if (msg.ok) setRunning(false);
      else addLog(`  错误: ${msg.error}`);
    } else if (msg.type === 'process_exit') {
      addLog(`[进程退出] code=${msg.code}`);
      setRunning(false);
      setBridgeReady(false);
    } else if (msg.type === 'cancelled') {
      addLog(`[已停止] ${msg.message ?? ''}`);
      setRunning(false);
    } else if (msg.type === 'error') {
      addLog(`[错误] ${msg.error}`);
    }
  }, [addLog]);

  // 启动 bridge
  useEffect(() => {
    startBridge(progressCb).then((res) => {
      if (res.ok) {
        setBridgeReady(true);
        setBridgeError('');
        addLog('[Bridge] Python 进程已启动');
        // 获取初始状态
        getStatus().then(setStatus);
      } else {
        setBridgeError(res.error ?? '启动失败');
        addLog(`[Bridge] 启动失败: ${res.error}`);
      }
    });
    return () => { stopBridge(); };
  }, []);

  // 运行状态通知
  useEffect(() => {
    onStatusChange(running ? 'running' : bridgeReady ? 'success' : 'idle',
      running ? '正在处理...' : bridgeReady ? '就绪' : '等待 Python 环境');
  }, [running, bridgeReady, onStatusChange]);

  // ====== 操作处理 ======

  const handleSync = (deep: boolean) => {
    setRunning(true); setLogs([]); logRef.current = [];
    addLog(deep ? '[全量同步] 开始...' : '[增量同步] 开始...');
    startSync(deep).catch(e => addLog(`[错误] ${e}`));
  };

  const handleDownload = (limit?: number) => {
    setRunning(true); setLogs([]); logRef.current = [];
    addLog('[下载] 开始...');
    startDownload(limit).catch(e => addLog(`[错误] ${e}`));
  };

  const handleSyncAndDownload = (deep: boolean, limit?: number) => {
    setRunning(true); setLogs([]); logRef.current = [];
    addLog('[同步+下载] 开始...');
    startSyncAndDownload(deep, limit).catch(e => addLog(`[错误] ${e}`));
  };

  const handleStop = () => { requestStop(); setRunning(false); addLog('[手动停止]'); };

  const handleRefresh = () => { getStatus().then(setStatus); addLog('[刷新统计]'); };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Bridge 状态 */}
      {bridgeError && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
          <strong>Python 连接失败:</strong> {bridgeError}
          <p className="mt-1 text-text-muted">
            请确保已安装 Python 及依赖库 (pip install pixivpy3 requests tqdm pysmb pillow)。
            <br />conda 环境: conda activate pix
          </p>
        </div>
      )}

      {/* 统计栏 */}
      <StatsCards stats={status} />

      {/* Tab 导航 */}
      <div className="flex gap-1 border-b border-border">
        {[
          ['ops', '操作'],
          ['accounts', '账号'],
          ['config', '设置'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as 'ops' | 'accounts' | 'config')}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-[1px] ${tab === key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {tab === 'ops' && (
        <OpsTab
          bridgeReady={bridgeReady} running={running}
          onSync={handleSync} onDownload={handleDownload}
          onSyncAndDownload={handleSyncAndDownload}
          onRefresh={handleRefresh} logs={logs}
          onStop={handleStop}
        />
      )}
      {tab === 'accounts' && <AccountsTab addLog={addLog} bridgeReady={bridgeReady} />}
      {tab === 'config' && (
        <ConfigTab
          settings={settings} onSettingsChange={onSettingsChange}
          bridgeReady={bridgeReady} addLog={addLog}
        />
      )}
    </div>
  );
};

// ===================== 操作 Tab =====================

interface OpsTabProps {
  bridgeReady: boolean; running: boolean;
  onSync: (deep: boolean) => void;
  onDownload: (limit?: number) => void;
  onSyncAndDownload: (deep: boolean, limit?: number) => void;
  onRefresh: () => void;
  onStop: () => void;
  logs: string[];
}

const OpsTab: React.FC<OpsTabProps> = ({ bridgeReady, running, onSync, onDownload, onSyncAndDownload, onRefresh, onStop, logs }) => {
  const [deep, setDeep] = useState(false);
  const [limit, setLimit] = useState('');

  const limitNum = limit ? parseInt(limit, 10) : undefined;

  return (
    <div className="space-y-4">
      {/* 操作按钮行 */}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!bridgeReady || running}
          onClick={() => onSync(deep)}
          className="inline-flex h-9 items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:opacity-50"
        >
          {deep ? '全量同步' : '增量同步'}
        </button>
        <button
          disabled={!bridgeReady || running}
          onClick={() => onDownload(limitNum)}
          className="inline-flex h-9 items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:opacity-50"
        >
          仅下载
        </button>
        <button
          disabled={!bridgeReady || running}
          onClick={() => onSyncAndDownload(deep, limitNum)}
          className="inline-flex h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          同步+下载
        </button>
        <button
          disabled={!bridgeReady}
          onClick={onRefresh}
          className="inline-flex h-9 items-center rounded-sm border border-border bg-bg-secondary px-3 text-sm font-medium text-text-secondary transition hover:bg-bg-hover disabled:opacity-50"
        >
          刷新
        </button>
      </div>

      {/* 选项 */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} className="accent-[var(--accent)]" />
          全量扫描
        </label>
        <label className="flex items-center gap-2">
          数量限制
          <input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="无限制" className="w-20 rounded-sm border border-border bg-bg-secondary px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-muted" />
        </label>
      </div>

      {/* 日志面板 */}
      <LogPanel lines={logs} running={running} onStop={onStop} />
    </div>
  );
};

// ===================== 账号 Tab =====================

const AccountsTab: React.FC<{ addLog: (s: string) => void; bridgeReady: boolean }> = ({ addLog, bridgeReady }) => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [tokenMode, setTokenMode] = useState<'idle' | 'waiting'>('idle');
  const [authUrl, setAuthUrl] = useState('');
  const [verifier, setVerifier] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [accountName, setAccountName] = useState('');
  const [remark, setRemark] = useState('');

  const refresh = () => getStatus().then(setStatus);

  useEffect(() => { refresh(); }, [bridgeReady]);

  const handleGetUrl = async () => {
    setTokenMode('waiting');
    const res = await getTokenUrl();
    if (res) {
      setAuthUrl(res.url);
      setVerifier(res.verifier);
      addLog('[Token] 请在浏览器中打开授权 URL 并登录');
    } else {
      addLog('[Token] 获取授权 URL 失败');
      setTokenMode('idle');
    }
  };

  const handleExchange = async () => {
    if (!codeInput.trim() || !verifier) return;
    addLog('[Token] 正在换取 refresh_token...');
    const res = await exchangeToken(codeInput.trim(), verifier, accountName.trim(), remark.trim());
    if (res.ok) {
      addLog(`[Token] 成功添加账号: ${res.name} (${res.username})`);
      setTokenMode('idle');
      setCodeInput(''); setAccountName(''); setRemark('');
      refresh();
    } else {
      addLog(`[Token] 换取失败: ${res.error}`);
    }
  };

  const handleTestAll = async () => {
    addLog('[Token] 正在测试所有账号...');
    await testTokens();
    addLog('[Token] 测试完成');
    refresh();
  };

  const handleRemove = async (name: string) => {
    await removeToken(name);
    addLog(`[Token] 已删除: ${name}`);
    refresh();
  };

  const handleSetMain = async (name: string) => {
    await setMainAccount(name);
    addLog(`[Token] 已设为主账号: ${name}`);
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* 已保存账号列表 */}
      {status && status.accounts.length > 0 ? (
        <div className="space-y-2">
          {status.accounts.map(acc => (
            <div key={acc.name} className="flex items-center gap-3 rounded-md border border-border bg-bg-secondary p-3">
              <div className={`h-2 w-2 rounded-full ${acc.isValid ? 'bg-status-success' : 'bg-status-error'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{acc.username || acc.name}</span>
                  {acc.isMain && <span className="rounded-sm bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent">主账号</span>}
                  {acc.remark && <span className="text-2xs text-text-muted">({acc.remark})</span>}
                </div>
                <div className="text-2xs text-text-muted">{acc.name}</div>
              </div>
              <div className="flex gap-1">
                {!acc.isMain && (
                  <button onClick={() => handleSetMain(acc.name)} className="rounded-sm px-2 py-1 text-2xs text-text-secondary hover:bg-bg-hover">设为主</button>
                )}
                <button onClick={() => handleRemove(acc.name)} className="rounded-sm px-2 py-1 text-2xs text-status-error hover:bg-bg-hover">删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-text-secondary">暂无账号，请添加</p>}

      <div className="flex gap-2">
        <button onClick={handleTestAll} disabled={!bridgeReady}
          className="inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50"
        >测试全部</button>
        <button onClick={handleGetUrl} disabled={tokenMode === 'waiting' || !bridgeReady}
          className="inline-flex h-8 items-center rounded-sm bg-accent px-3 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
        >添加账号</button>
      </div>

      {/* Token 获取流程 */}
      {tokenMode === 'waiting' && (
        <div className="rounded-md border border-border bg-bg-secondary p-4 space-y-3">
          <p className="text-xs text-text-primary font-medium">获取 Refresh Token</p>
          <ol className="text-xs text-text-secondary space-y-1 pl-4 list-decimal">
            <li>点击下方链接在浏览器中打开</li>
            <li>登录 Pixiv 账号</li>
            <li>授权后浏览器地址栏会变成 <code className="font-mono text-accent">pixiv://...</code></li>
            <li>把完整 URL 粘贴到下方输入框</li>
          </ol>
          <a href={authUrl} target="_blank" rel="noreferrer"
            className="block truncate rounded-sm bg-bg-sidebar px-3 py-2 font-mono text-2xs text-accent-cyan hover:underline"
          >{authUrl}</a>
          <div className="flex gap-2">
            <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="粘贴回调 URL" className="flex-1 rounded-sm border border-border bg-bg-sidebar px-3 py-2 font-mono text-xs text-text-primary" />
            <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="账号名" className="w-24 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" />
            <input value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注" className="w-20 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" />
          </div>
          <button onClick={handleExchange} disabled={!codeInput.trim()}
            className="inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
          >换取 Token</button>
        </div>
      )}
    </div>
  );
};

// ===================== 设置 Tab =====================

const ConfigTab: React.FC<{
  settings: Record<string, unknown>;
  onSettingsChange: (s: Record<string, unknown>) => void;
  bridgeReady: boolean;
  addLog: (s: string) => void;
}> = ({ settings, onSettingsChange, bridgeReady, addLog }) => {

  const update = (key: string, value: unknown) => {
    const next = { ...settings, [key]: value };
    onSettingsChange(next);
  };

  const handleSaveAll = async () => {
    await updateConfig(settings as Partial<PixivConfig>);
    addLog('[配置] 已同步到 Python settings.json');
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* 存储 */}
      <fieldset className="rounded-md border border-border bg-bg-secondary p-4">
        <legend className="text-sm font-medium text-text-primary px-1">存储</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-secondary flex items-center gap-2">
            存储目标
            <select value={String(settings.storageMode ?? 'local')} onChange={e => update('storageMode', e.target.value)}
              className="rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary flex-1"
            >
              <option value="local">本地文件系统</option>
              <option value="smb">SMB/CIFS 网络共享</option>
            </select>
          </label>
          <label className="text-xs text-text-secondary col-span-2 flex items-center gap-2">
            本地路径
            <input value={String(settings.localSavePath ?? '')} onChange={e => update('localSavePath', e.target.value)}
              className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 font-mono text-xs text-text-primary" placeholder="./downloads"
            />
          </label>
          {String(settings.storageMode) === 'smb' && (<>
            <label className="text-xs text-text-secondary flex items-center gap-2">服务器地址<input value={String(settings.nasIp ?? '')} onChange={e => update('nasIp', e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary" placeholder="192.168.1.50" /></label>
            <label className="text-xs text-text-secondary flex items-center gap-2">用户名<input value={String(settings.nasUser ?? '')} onChange={e => update('nasUser', e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary" /></label>
            <label className="text-xs text-text-secondary flex items-center gap-2">共享名称<input value={String(settings.nasShare ?? '')} onChange={e => update('nasShare', e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary" /></label>
            <label className="text-xs text-text-secondary flex items-center gap-2">远程路径<input value={String(settings.nasBasePath ?? 'PIXIV')} onChange={e => update('nasBasePath', e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary" /></label>
            <label className="text-xs text-text-secondary flex items-center gap-2">客户端名<input value={String(settings.nasRemoteName ?? '')} onChange={e => update('nasRemoteName', e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary" /></label>
          </>)}
        </div>
      </fieldset>

      {/* 线程 */}
      <fieldset className="rounded-md border border-border bg-bg-secondary p-4">
        <legend className="text-sm font-medium text-text-primary px-1">线程与性能</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['downloadThreads', '下载线程', 1, 10],
            ['mainAccountSyncThreads', '主同步', 1, 5],
            ['backupAccountSyncThreads', '备同步', 1, 5],
            ['mainAccountDownloadThreads', '主下载', 1, 5],
            ['backupAccountDownloadThreads', '备下载', 1, 5],
            ['metadataRefreshLimit', '回看数量', 0, 100],
          ].map(([key, label, min, max]) => (
            <label key={key} className="text-xs text-text-secondary flex items-center gap-2">
              {label}
              <input type="number" min={min} max={max} value={Number(settings[key] ?? (key === 'downloadThreads' ? 4 : key === 'metadataRefreshLimit' ? 20 : 1))}
                onChange={e => update(key, Math.max(Number(min), Math.min(Number(max), parseInt(e.target.value) || Number(min))))}
                className="w-16 rounded-sm border border-border bg-bg-sidebar px-2 py-1 font-mono text-xs text-text-primary"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Ugoira + 风控 */}
      <fieldset className="rounded-md border border-border bg-bg-secondary p-4">
        <legend className="text-sm font-medium text-text-primary px-1">动图与风控</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-secondary flex items-center gap-2">
            Ugoira 格式
            <select value={String(settings.ugoiraOutput ?? 'gif')} onChange={e => update('ugoiraOutput', e.target.value)}
              className="rounded-sm border border-border bg-bg-sidebar px-2 py-1 text-xs text-text-primary"
            >
              <option value="gif">GIF</option>
              <option value="apng">APNG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <label className="text-xs text-text-secondary flex items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.rateLimitEnabled ?? true)} onChange={e => update('rateLimitEnabled', e.target.checked)} className="accent-[var(--accent)]" />
            风控保护
          </label>
          <label className="text-xs text-text-secondary flex items-center gap-2">
            失败率阈值
            <input type="number" min={0.1} max={0.9} step={0.05} value={Number(settings.failureRateThreshold ?? 0.5)}
              onChange={e => update('failureRateThreshold', parseFloat(e.target.value) || 0.5)}
              className="w-16 rounded-sm border border-border bg-bg-sidebar px-2 py-1 font-mono text-xs text-text-primary"
            />
          </label>
          <label className="text-xs text-text-secondary flex items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.autoThrottleEnabled ?? true)} onChange={e => update('autoThrottleEnabled', e.target.checked)} className="accent-[var(--accent)]" />
            自动降速
          </label>
        </div>
      </fieldset>

      {/* 保存按钮 */}
      <button onClick={handleSaveAll} disabled={!bridgeReady}
        className="inline-flex h-9 items-center rounded-sm bg-accent px-6 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
      >保存所有设置</button>
    </div>
  );
};

export { manifest };
export default PixivTool;
