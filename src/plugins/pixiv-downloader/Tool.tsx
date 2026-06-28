// @author: claude | phase: pixiv-tool | ui
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ToolProps } from '../../core/types';
import { manifest } from './manifest';
import {
  startBridge, stopBridge, getStatus, getConfig, updateConfig,
  startSync, startDownload, startSyncAndDownload,
  getTokenUrl, exchangeToken, testTokens, removeToken, setMainAccount,
  requestStop, exportDatabase, importDatabase, backupDatabase,
  exportPixivSettings, importPixivSettings, getPreview, retryFailed,
  type StatusData, type PixivConfig, type ProgressMessage, type ProgressCallback,
} from './engine';

// ===================== 子组件 =====================

type TaskKind = 'sync' | 'download' | 'sync-download';
type ActionKind = TaskKind | 'refresh' | 'preview' | 'retry';

interface TaskIntent {
  kind: TaskKind;
  label: string;
  description: string;
  deep?: boolean;
  limit?: number;
}

const TASK_LABELS: Record<TaskKind, string> = {
  sync: '同步',
  download: '下载',
  'sync-download': '同步+下载',
};

const ACTION_LABELS: Record<ActionKind, string> = {
  sync: '增量同步',
  download: '仅下载',
  'sync-download': '同步+下载',
  refresh: '刷新',
  preview: '预览任务',
  retry: '重试失败',
};

const ConfirmTaskDialog: React.FC<{ task: TaskIntent; onConfirm: () => void; onCancel: () => void }> = ({ task, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onPointerDown={onCancel}>
    <div
      className="w-[420px] max-w-[calc(100vw-48px)] rounded-lg border border-border bg-bg-secondary p-5 shadow-xl"
      onPointerDown={(e): void => e.stopPropagation()}
    >
      <h3 className="text-base font-semibold text-text-primary">确认执行 {task.label}</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{task.description}</p>
      <p className="mt-3 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-text-secondary">
        执行期间会锁定其他下载器任务，避免同步、下载、数据库操作互相抢占。
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex h-9 items-center rounded-sm border border-border bg-bg-primary px-4 text-sm text-text-secondary hover:bg-bg-hover">取消</button>
        <button type="button" onClick={onConfirm} className="inline-flex h-9 items-center rounded-sm bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">确认执行</button>
      </div>
    </div>
  </div>
);

const LogPanel: React.FC<{ lines: string[]; running: boolean; stopping: boolean; onStop: () => void }> = ({ lines, running, stopping, onStop }) => (
  <div className="flex flex-col rounded-md border border-border bg-bg-secondary">
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="text-xs font-medium text-text-primary">{stopping ? '停止中...' : running ? '运行中...' : '输出'}</span>
      {running && (
        <button disabled={stopping} onClick={onStop} className="rounded-sm bg-status-error px-2 py-0.5 text-2xs text-white hover:opacity-80 disabled:opacity-50">{stopping ? '停止中' : '停止'}</button>
      )}
    </div>
    <pre className="max-h-80 overflow-y-auto p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
      {lines.length === 0 ? '等待操作...' : lines.map((l, i) => <div key={i}>{l}</div>)}
    </pre>
  </div>
);

const StatsCards: React.FC<{ stats: StatusData | null }> = ({ stats }) => {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {[['画师', stats.artists], ['作品', stats.illusts], ['已下载', stats.done], ['待下载', stats.pending], ['失败', stats.failed]].map(([label, value]) => (
        <div key={label} className="rounded-md border border-border bg-bg-secondary p-3 text-center">
          <div className="text-lg font-semibold text-text-primary">{value}</div>
          <div className="text-2xs text-text-secondary">{label}</div>
        </div>
      ))}
    </div>
  );
};

const AccountStatusBadge: React.FC<{ stats: StatusData | null; onAdd: () => void }> = ({ stats, onAdd }) => {
  const accounts = stats?.accounts ?? [];
  const validAccounts = accounts.filter((account) => account.isValid);
  const summary = accounts.length === 0 ? '未添加账号' : `${validAccounts.length}/${accounts.length} 可用`;
  const tone = validAccounts.length > 0 ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error';

  return (
    <div className={`flex max-w-full items-center gap-3 rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium">账号状态：{summary}</div>
        <div className="mt-0.5 truncate text-text-secondary">
          {accounts.length > 0 ? accounts.map((account) => `${account.username || account.name}${account.isValid ? ' 可用' : ' 不可用'}`).join(' / ') : '同步和下载前需要先添加 Pixiv 账号'}
        </div>
      </div>
      {validAccounts.length === 0 && (
        <button type="button" title="切换到账号页添加或重新授权账号" onClick={onAdd} className="h-7 shrink-0 rounded-sm bg-accent px-3 text-2xs font-medium text-white hover:bg-accent-hover">
          去添加
        </button>
      )}
    </div>
  );
};

const ProgressOverview: React.FC<{ stats: StatusData | null; activeTask: TaskKind | null; stopping: boolean }> = ({ stats, activeTask, stopping }) => {
  const done = Number(stats?.done ?? 0);
  const pending = Number(stats?.pending ?? 0);
  const failed = Number(stats?.failed ?? 0);
  const total = done + pending + failed;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const label = stopping ? '停止中' : activeTask ? TASK_LABELS[activeTask] : '空闲';

  return (
    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="rounded-md border border-border bg-bg-secondary p-3">
        <div className="text-2xs text-text-muted">当前状态</div>
        <div className="mt-1 text-base font-semibold text-text-primary">{label}</div>
        <div className="mt-1 text-2xs text-text-secondary">{total > 0 ? `完成 ${done} / ${total}` : '暂无下载队列'}</div>
      </div>
      <div className="rounded-md border border-border bg-bg-secondary p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
          <span>下载进度</span>
          <span className="font-mono">{percent}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-border bg-bg-sidebar">
          <div className={`h-full rounded-full bg-accent transition-all ${activeTask && total === 0 ? 'animate-pulse' : ''}`} style={{ width: `${activeTask && total === 0 ? 35 : percent}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 text-center text-2xs text-text-secondary">
          <span>已下载 {done}</span>
          <span>待下载 {pending}</span>
          <span>失败 {failed}</span>
        </div>
      </div>
    </div>
  );
};

// ===================== 主组件 =====================

const PixivTool: React.FC<ToolProps> = ({ settings, onSettingsChange, onStatusChange }) => {
  const [tab, setTab] = useState<'ops' | 'accounts' | 'config'>('ops');
  const [activeTask, setActiveTask] = useState<TaskKind | null>(null);
  const [pendingTask, setPendingTask] = useState<TaskIntent | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [stopping, setStopping] = useState(false);
  const logRef = useRef<string[]>([]);
  const activeTaskRef = useRef<TaskKind | null>(null);
  const running = activeTask !== null;

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
      const task = activeTaskRef.current;
      const syncDownloadStillRunning = task === 'sync-download' && msg.type === 'sync_complete' && msg.ok;
      if (!syncDownloadStillRunning) {
        activeTaskRef.current = null;
        setActiveTask(null);
        setStopping(false);
        getStatus().then(setStatus);
      }
    } else if (msg.type === 'process_exit') {
      addLog(`[进程退出] code=${msg.code}`);
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
      setBridgeReady(false);
    } else if (msg.type === 'cancelled') {
      addLog(`[已停止] ${msg.message ?? ''}`);
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
    } else if (msg.type === 'error') {
      addLog(`[错误] ${msg.error}`);
    }
  }, [addLog]);

  useEffect(() => {
    startBridge(progressCb).then((res) => {
      if (res.ok) {
        setBridgeReady(true);
        setBridgeError('');
        addLog('[Bridge] Python 进程已启动');
        getStatus().then(setStatus);
        getConfig().then((config) => {
          if (config) {
            onSettingsChange({ ...settings, ...config });
            addLog('[配置] 已载入 Python settings.json');
          }
        });
      }
      else { setBridgeError(res.error ?? '启动失败'); addLog(`[Bridge] 启动失败: ${res.error}`); }
    });
    return () => { stopBridge(); };
  }, []);

  useEffect(() => {
    onStatusChange(running ? 'running' : bridgeReady ? 'success' : 'idle', stopping ? '停止中...' : running ? '处理中...' : bridgeReady ? '就绪' : '等待 Python');
  }, [running, stopping, bridgeReady, onStatusChange]);

  const requestTask = (task: TaskIntent) => {
    if (!bridgeReady) {
      addLog('[任务] Python bridge 尚未就绪');
      return;
    }
    const hasValidAccount = (status?.accounts ?? []).some((account) => account.isValid);
    if (!hasValidAccount) {
      addLog('[账号] 没有可用 Pixiv 账号。请先到账号页添加账号，或重新添加不可用账号。');
      setTab('accounts');
      return;
    }
    if (activeTaskRef.current) {
      addLog(`[任务] 当前正在执行 ${TASK_LABELS[activeTaskRef.current]}，请先停止或等待完成`);
      return;
    }
    setPendingTask(task);
  };

  const startConfirmedTask = async () => {
    if (!pendingTask || activeTaskRef.current) return;
    const task = pendingTask;
    setPendingTask(null);
    setLogs([]);
    logRef.current = [];
    activeTaskRef.current = task.kind;
    setActiveTask(task.kind);
    setStopping(false);
    addLog(`[${task.label}] 开始...`);
    try {
      if (task.kind === 'sync') await startSync(Boolean(task.deep));
      if (task.kind === 'download') await startDownload(task.limit);
      if (task.kind === 'sync-download') await startSyncAndDownload(Boolean(task.deep), task.limit);
    } catch (e) {
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
      addLog(`[错误] ${e}`);
    }
  };

  const handleSync = (deep: boolean) => requestTask({
    kind: 'sync',
    label: deep ? '全量同步' : '增量同步',
    description: deep ? '将重新扫描 Pixiv 画师与作品元数据，耗时可能较长。' : '只同步新增或变化的数据，适合作为日常更新。',
    deep,
  });
  const handleDownload = (limit?: number) => requestTask({
    kind: 'download',
    label: '仅下载',
    description: `开始下载数据库中的待下载作品。数量限制：${limit ?? '不限'}。`,
    limit,
  });
  const handleSyncAndDownload = (deep: boolean, limit?: number) => requestTask({
    kind: 'sync-download',
    label: '同步+下载',
    description: `${deep ? '先全量同步' : '先增量同步'}，同步完成后继续下载待下载作品。数量限制：${limit ?? '不限'}。`,
    deep,
    limit,
  });
  const handleStop = () => {
    if (!activeTaskRef.current || stopping) return;
    setStopping(true);
    addLog('[手动停止] 已请求停止当前任务，等待 Python 收尾...');
    requestStop().catch((e) => {
      setStopping(false);
      addLog(`[手动停止] 请求失败: ${e}`);
    });
  };
  const handleRefresh = () => {
    if (activeTaskRef.current) {
      addLog('[刷新统计] 任务运行中，已跳过刷新以避免数据库抢占');
      return;
    }
    getStatus().then(setStatus); addLog('[刷新统计]');
  };
  const handlePreview = async () => {
    if (activeTaskRef.current) {
      addLog('[预览任务] 当前有任务运行，已跳过预览');
      return;
    }
    const rows = await getPreview(20);
    addLog(`[预览任务] 待处理任务 ${rows.length} 条${rows.length >= 20 ? '（仅显示前 20 条）' : ''}`);
    rows.slice(0, 10).forEach((row, index) => {
      const item = row as { task_key?: string; title?: string; media_type?: string; author_id?: number };
      addLog(`[预览 ${index + 1}] ${item.task_key ?? '-'} | ${item.media_type ?? '-'} | ${item.title ?? ''} | artist=${item.author_id ?? '-'}`);
    });
  };
  const handleRetryFailed = async () => {
    if (activeTaskRef.current) {
      addLog('[重试失败] 当前有任务运行，已跳过重置');
      return;
    }
    const count = await retryFailed();
    addLog(`[重试失败] 已重置 ${count} 个失败任务为待下载`);
    getStatus().then(setStatus);
  };

  return (
    <div className="flex flex-col gap-4">
      {bridgeError && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
          <strong>Python 连接失败:</strong> {bridgeError}
          <p className="mt-1 text-text-muted">请确保已安装 Python 及依赖。conda 环境: conda activate pix</p>
        </div>
      )}
      <StatsCards stats={status} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProgressOverview stats={status} activeTask={activeTask} stopping={stopping} />
        <AccountStatusBadge stats={status} onAdd={() => setTab('accounts')} />
      </div>
      <div className="flex gap-1 border-b border-border">
        {[['ops','操作'],['accounts','账号'],['config','设置']].map(([k,l]) => (
          <button key={k} type="button" onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${tab === k ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>{l}</button>
        ))}
      </div>
      {tab === 'ops' && <OpsTab bridgeReady={bridgeReady} running={running} stopping={stopping} onSync={handleSync} onDownload={handleDownload} onSyncAndDownload={handleSyncAndDownload} onRefresh={handleRefresh} onPreview={handlePreview} onRetryFailed={handleRetryFailed} logs={logs} onStop={handleStop} />}
      {tab === 'accounts' && <AccountsTab addLog={addLog} bridgeReady={bridgeReady} running={running} />}
      {tab === 'config' && <ConfigTab settings={settings} onSettingsChange={onSettingsChange} bridgeReady={bridgeReady} running={running} addLog={addLog} />}
      {pendingTask && <ConfirmTaskDialog task={pendingTask} onConfirm={() => { void startConfirmedTask(); }} onCancel={() => setPendingTask(null)} />}
    </div>
  );
};

// ===================== 操作 Tab =====================

interface OpsTabProps { bridgeReady: boolean; running: boolean; stopping: boolean; onSync: (deep: boolean) => void; onDownload: (limit?: number) => void; onSyncAndDownload: (deep: boolean, limit?: number) => void; onRefresh: () => void; onPreview: () => void; onRetryFailed: () => void; onStop: () => void; logs: string[]; }

const OpsTab: React.FC<OpsTabProps> = ({ bridgeReady, running, stopping, onSync, onDownload, onSyncAndDownload, onRefresh, onPreview, onRetryFailed, onStop, logs }) => {
  const [deep, setDeep] = useState(false);
  const [limit, setLimit] = useState('');
  const [selectedAction, setSelectedAction] = useState<ActionKind>('sync-download');
  const limitNum = limit ? parseInt(limit, 10) : undefined;
  const runSelected = (): void => {
    if (selectedAction === 'sync') onSync(deep);
    if (selectedAction === 'download') onDownload(limitNum);
    if (selectedAction === 'sync-download') onSyncAndDownload(deep, limitNum);
    if (selectedAction === 'refresh') onRefresh();
    if (selectedAction === 'preview') void onPreview();
    if (selectedAction === 'retry') void onRetryFailed();
  };
  const actionButton = (action: ActionKind, description: string): JSX.Element => (
    <button
      key={action}
      type="button"
      disabled={!bridgeReady || running}
      title={description}
      onClick={(): void => setSelectedAction(action)}
      className={`inline-flex h-9 items-center rounded-sm border px-3 text-sm font-medium transition disabled:opacity-50 ${
        selectedAction === action
          ? 'border-accent bg-accent text-white'
          : 'border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {action === 'sync' ? (deep ? '全量同步' : '增量同步') : ACTION_LABELS[action]}
    </button>
  );
  return (
    <div className="space-y-4">
      {running && (
        <div className="rounded-md border border-accent/30 bg-accent-subtle px-3 py-2 text-xs text-text-secondary">
          {stopping ? '正在停止当前任务，等待 Python 完成收尾后会自动解锁。' : '当前任务运行中，其他任务入口已锁定。需要切换任务时请先停止当前任务。'}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {actionButton('sync', '选择同步 Pixiv 画师和作品信息；勾选全量扫描时会重新扫描更多历史数据')}
        {actionButton('download', '选择只下载数据库里待下载的作品，不执行同步')}
        {actionButton('sync-download', '选择先同步再下载，是日常最常用的完整流程')}
        {actionButton('refresh', '选择刷新统计数据，不会下载或同步')}
        {actionButton('preview', '选择预览待下载任务，只查看队列不执行下载')}
        {actionButton('retry', '选择把失败任务重置为待下载，便于重新执行')}
        <button
          type="button"
          disabled={!bridgeReady || running}
          title={`执行当前选中的操作：${ACTION_LABELS[selectedAction]}`}
          onClick={runSelected}
          className="inline-flex h-9 items-center rounded-sm bg-accent px-5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-50"
        >
          执行所选
        </button>
      </div>
      <div className="rounded-md border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary">
        当前选择：<span className="font-medium text-text-primary">{selectedAction === 'sync' ? (deep ? '全量同步' : '增量同步') : ACTION_LABELS[selectedAction]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <label title="开启后同步会尽量重新扫描历史数据，耗时更长" className="flex items-center gap-2"><input type="checkbox" disabled={running} checked={deep} onChange={e => setDeep(e.target.checked)} className="accent-[var(--accent)] disabled:opacity-50" />全量扫描</label>
        <label title="限制本次最多下载多少个任务，留空表示不限制" className="flex items-center gap-2">数量限制 <input type="number" disabled={running} value={limit} onChange={e => setLimit(e.target.value)} placeholder="不限" className="w-20 rounded-sm border border-border bg-bg-secondary px-2 py-1 font-mono text-xs text-text-primary disabled:opacity-50" /></label>
      </div>
      <LogPanel lines={logs} running={running} stopping={stopping} onStop={onStop} />
    </div>
  );
};

// ===================== 账号 Tab =====================

const AccountsTab: React.FC<{ addLog: (s: string) => void; bridgeReady: boolean; running: boolean }> = ({ addLog, bridgeReady, running }) => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [tokenMode, setTokenMode] = useState<'idle' | 'waiting'>('idle');
  const [authUrl, setAuthUrl] = useState('');
  const [verifier, setVerifier] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [accountName, setAccountName] = useState('');
  const [remark, setRemark] = useState('');

  const refresh = () => getStatus().then(setStatus);
  useEffect(() => { refresh(); }, [bridgeReady]);

  const guardAccountAction = () => {
    if (running) {
      addLog('[Token] 当前有下载器任务运行，账号操作已锁定');
      return false;
    }
    return true;
  };
  const handleGetUrl = async () => { if (!guardAccountAction()) return; setTokenMode('waiting'); const res = await getTokenUrl(); if (res) { setAuthUrl(res.url); setVerifier(res.verifier); addLog('[Token] 请在浏览器中打开授权 URL 并登录'); } else { addLog('[Token] 获取授权 URL 失败'); setTokenMode('idle'); } };
  const handleExchange = async () => { if (!guardAccountAction() || !codeInput.trim() || !verifier) return; addLog('[Token] 正在换取...'); const res = await exchangeToken(codeInput.trim(), verifier, accountName.trim(), remark.trim()); if (res.ok) { addLog(`[Token] 成功: ${res.name} (${res.username})`); setTokenMode('idle'); setCodeInput(''); setAccountName(''); setRemark(''); refresh(); } else { addLog(`[Token] 失败: ${res.error}`); } };
  const handleTestAll = async () => { if (!guardAccountAction()) return; addLog('[Token] 测试中...'); await testTokens(); addLog('[Token] 完成'); refresh(); };
  const handleRemove = async (name: string) => { if (!guardAccountAction()) return; await removeToken(name); addLog(`[Token] 已删除: ${name}`); refresh(); };
  const handleSetMain = async (name: string) => { if (!guardAccountAction()) return; await setMainAccount(name); addLog(`[Token] 已设为主: ${name}`); refresh(); };

  return (
    <div className="space-y-4">
      {status && status.accounts.length > 0 ? (
        <div className="space-y-2">
          {status.accounts.map(acc => (
            <div key={acc.name} className="flex items-center gap-3 rounded-md border border-border bg-bg-secondary p-3">
              <div className={`h-2 w-2 rounded-full ${acc.isValid ? 'bg-status-success' : 'bg-status-error'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-medium text-text-primary">{acc.username || acc.name}</span>{acc.isMain && <span className="rounded-sm bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent">主账号</span>}{acc.remark && <span className="text-2xs text-text-muted">({acc.remark})</span>}</div>
                <div className="text-2xs text-text-muted">{acc.name}</div>
              </div>
              <div className="flex gap-1">
                {!acc.isMain && <button disabled={running} onClick={() => handleSetMain(acc.name)} className="rounded-sm px-2 py-1 text-2xs text-text-secondary hover:bg-bg-hover disabled:opacity-50">设为主</button>}
                <button disabled={running} onClick={() => handleRemove(acc.name)} className="rounded-sm px-2 py-1 text-2xs text-status-error hover:bg-bg-hover disabled:opacity-50">删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs leading-6 text-text-secondary">
          <div className="font-medium text-text-primary">暂无账号</div>
          <div>同步作品、下载原图、刷新 Pixiv 元数据都需要可用账号。请点击“添加账号”，按下方步骤完成授权。</div>
        </div>
      )}
      <div className="flex gap-2">
        <button title="检查已保存账号的 Refresh Token 是否仍然可用" onClick={handleTestAll} disabled={!bridgeReady || running} className="inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50">测试全部</button>
        <button title="生成 Pixiv 授权链接并添加新账号" onClick={handleGetUrl} disabled={tokenMode === 'waiting' || !bridgeReady || running} className="inline-flex h-8 items-center rounded-sm bg-accent px-3 text-xs text-white hover:bg-accent-hover disabled:opacity-50">添加账号</button>
      </div>
      {tokenMode === 'waiting' && (
        <div className="rounded-md border border-border bg-bg-secondary p-4 space-y-3">
          <p className="text-xs text-text-primary font-medium">添加 Pixiv 账号</p>
          <div className="rounded-md border border-border bg-bg-sidebar px-3 py-2 text-xs leading-6 text-text-secondary">
            这个步骤不是输入 Pixiv 密码，而是让 Pixiv 返回一个授权回调地址。复制回调地址后，工具会从里面换取 Refresh Token 并保存到本地配置。
          </div>
          <ol className="text-xs text-text-secondary space-y-1 pl-4 list-decimal">
            <li>点击下面的蓝色授权链接，在浏览器中打开 Pixiv 登录页。</li>
            <li>登录你的 Pixiv 账号并同意授权。</li>
            <li>浏览器跳转失败也没关系，重点是地址栏会变成以 pixiv:// 开头的长地址。</li>
            <li>完整复制地址栏内容，粘贴到“粘贴回调 URL”。</li>
            <li>账号名可以写“主账号”“备用账号 1”，备注可选，然后点击“换取 Token”。</li>
          </ol>
          <a href={authUrl} target="_blank" rel="noreferrer" className="block truncate rounded-sm bg-bg-sidebar px-3 py-2 font-mono text-2xs text-accent-cyan hover:underline">{authUrl}</a>
          <div className="flex gap-2">
            <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="粘贴回调 URL" className="flex-1 rounded-sm border border-border bg-bg-sidebar px-3 py-2 font-mono text-xs text-text-primary" />
            <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="账号名" className="w-24 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" />
            <input value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注" className="w-20 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" />
          </div>
          <button onClick={handleExchange} disabled={!codeInput.trim() || running} className="inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs text-white hover:bg-accent-hover disabled:opacity-50">换取 Token</button>
        </div>
      )}
    </div>
  );
};

// ===================== 设置 Tab =====================

const ConfigTab: React.FC<{ settings: Record<string, unknown>; onSettingsChange: (s: Record<string, unknown>) => void; bridgeReady: boolean; running: boolean; addLog: (s: string) => void; }> = ({ settings, onSettingsChange, bridgeReady, running, addLog }) => {
  const update = (key: string, value: unknown) => onSettingsChange({...settings, [key]: value});
  const guardConfigAction = () => {
    if (running) {
      addLog('[配置] 当前有下载器任务运行，配置和数据库操作已锁定');
      return false;
    }
    return true;
  };
  const handleSaveAll = async () => {
    if (!guardConfigAction()) return;
    const ok = await updateConfig(settings as Partial<PixivConfig>);
    addLog(ok ? '[配置] 已同步到 Python settings.json' : '[配置] 保存失败，请检查参数或 Python bridge 输出');
  };
  const fileApi = window.toolbox?.file;
  const storageMode = String(settings.storageMode ?? 'local');
  const sectionClass = 'rounded-md border border-border bg-bg-secondary px-4 pb-4 pt-3';
  const gridClass = 'grid gap-x-6 gap-y-3 sm:grid-cols-2';
  const fieldClass = 'grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-xs text-text-secondary';
  const fullFieldClass = `${fieldClass} sm:col-span-2`;
  const pathFieldClass = 'grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-xs text-text-secondary';
  const fullPathFieldClass = `${pathFieldClass} sm:col-span-2`;
  const inputClass = 'h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 font-mono text-xs text-text-primary disabled:opacity-50';
  const textInputClass = 'h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50';
  const shortInputClass = 'h-8 w-24 rounded-sm border border-border bg-bg-sidebar px-2 font-mono text-xs text-text-primary disabled:opacity-50';
  const smallButtonClass = 'inline-flex h-8 min-w-16 items-center justify-center whitespace-nowrap rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50';
  const actionButtonClass = 'inline-flex h-8 min-w-24 items-center justify-center rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50';

  const pickDirectory = async (key: string, label: string) => {
    const path = await fileApi?.openDirectory?.(label);
    if (path) update(key, path);
  };

  const pickDatabasePath = async () => {
    const path = await fileApi?.openDialog?.([{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }]);
    if (path) update('dbPath', path);
  };

  const handleDbExport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.('pixiv_manager.db', [{ name: 'SQLite 数据库', extensions: ['db'] }]);
    if (!path) return;
    addLog('[数据库] 正在导出...');
    addLog(await exportDatabase(path) ? `[数据库] 已导出到 ${path}` : '[数据库] 导出失败');
  };

  const handleDbImport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.openDialog?.([{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }]);
    if (!path) return;
    addLog('[数据库] 正在导入...');
    addLog(await importDatabase(path) ? `[数据库] 已导入 ${path}` : '[数据库] 导入失败');
  };

  const handleDbBackup = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.('pixiv_manager.backup.db', [{ name: 'SQLite 数据库', extensions: ['db'] }]);
    if (!path) return;
    addLog('[数据库] 正在备份...');
    addLog(await backupDatabase(path) ? `[数据库] 已备份到 ${path}` : '[数据库] 备份失败');
  };

  const handleSettingsExport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.('pixiv-downloader-settings.json', [{ name: 'JSON', extensions: ['json'] }]);
    if (!path) return;
    addLog('[配置] 正在导出 Pixiv 配置...');
    addLog(await exportPixivSettings(path) ? `[配置] 已导出到 ${path}` : '[配置] 导出失败');
  };

  const handleSettingsImport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.openDialog?.([{ name: 'JSON', extensions: ['json'] }]);
    if (!path) return;
    addLog('[配置] 正在导入 Pixiv 配置...');
    addLog(await importPixivSettings(path) ? `[配置] 已导入 ${path}，重新打开工具后生效` : '[配置] 导入失败');
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      <fieldset className={sectionClass}>
        <legend className="text-sm font-medium text-text-primary px-1">存储</legend>
        <div className={gridClass}>
          <label className={fieldClass}><span>存储目标</span>
            <select disabled={running} value={storageMode} onChange={e => update('storageMode', e.target.value)} className="h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50">
              <option value="local">本地文件系统</option>
              <option value="smb">SMB/CIFS 文件共享</option>
              <option value="sftp">SFTP</option>
              <option value="ftp">FTP / FTPS</option>
              <option value="webdav">WebDAV</option>
              <option value="s3">S3 兼容对象存储</option>
            </select>
          </label>
          <label className={fullFieldClass}><span>本地路径</span>
            <input disabled={running} value={String(settings.localSavePath ?? '')} onChange={e => update('localSavePath', e.target.value)} className={inputClass} placeholder="./downloads" />
          </label>
          {storageMode !== 'local' && (
            <p className="col-span-2 text-2xs text-text-muted">远端协议会先写入本地临时目录，再上传到目标存储；任务运行中不可切换协议。</p>
          )}
          {storageMode === 'smb' && (<>
            <label className={fieldClass}><span>服务器地址</span><input disabled={running} value={String(settings.nasIp ?? '')} onChange={e => update('nasIp', e.target.value)} className={textInputClass} placeholder="192.168.1.50" /></label>
            <label className={fieldClass}><span>用户名</span><input disabled={running} value={String(settings.nasUser ?? '')} onChange={e => update('nasUser', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>密码</span><input disabled={running} type="password" value={String(settings.nasPass ?? '')} onChange={e => update('nasPass', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>共享名称</span><input disabled={running} value={String(settings.nasShare ?? '')} onChange={e => update('nasShare', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>远程路径</span><input disabled={running} value={String(settings.nasBasePath ?? 'PIXIV')} onChange={e => update('nasBasePath', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>客户端名</span><input disabled={running} value={String(settings.nasRemoteName ?? '')} onChange={e => update('nasRemoteName', e.target.value)} className={textInputClass} /></label>
          </>)}
          {storageMode === 'sftp' && (<>
            <label className={fieldClass}><span>主机</span><input disabled={running} value={String(settings.sftpHost ?? '')} onChange={e => update('sftpHost', e.target.value)} className={textInputClass} placeholder="example.com" /></label>
            <label className={fieldClass}><span>端口</span><input disabled={running} type="number" value={Number(settings.sftpPort ?? 22)} onChange={e => update('sftpPort', parseInt(e.target.value, 10) || 22)} className={shortInputClass} /></label>
            <label className={fieldClass}><span>用户名</span><input disabled={running} value={String(settings.sftpUser ?? '')} onChange={e => update('sftpUser', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>密码</span><input disabled={running} type="password" value={String(settings.sftpPass ?? '')} onChange={e => update('sftpPass', e.target.value)} className={textInputClass} /></label>
            <label className={fullFieldClass}><span>私钥路径</span><input disabled={running} value={String(settings.sftpPrivateKey ?? '')} onChange={e => update('sftpPrivateKey', e.target.value)} className={inputClass} placeholder="可选" /></label>
            <label className={fullFieldClass}><span>远程路径</span><input disabled={running} value={String(settings.sftpBasePath ?? 'PIXIV')} onChange={e => update('sftpBasePath', e.target.value)} className={textInputClass} /></label>
          </>)}
          {storageMode === 'ftp' && (<>
            <label className={fieldClass}><span>主机</span><input disabled={running} value={String(settings.ftpHost ?? '')} onChange={e => update('ftpHost', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>端口</span><input disabled={running} type="number" value={Number(settings.ftpPort ?? 21)} onChange={e => update('ftpPort', parseInt(e.target.value, 10) || 21)} className={shortInputClass} /></label>
            <label className={fieldClass}><span>用户名</span><input disabled={running} value={String(settings.ftpUser ?? '')} onChange={e => update('ftpUser', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>密码</span><input disabled={running} type="password" value={String(settings.ftpPass ?? '')} onChange={e => update('ftpPass', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>安全</span><span className="inline-flex items-center gap-2"><input disabled={running} type="checkbox" checked={Boolean(settings.ftpTls ?? false)} onChange={e => update('ftpTls', e.target.checked)} className="accent-[var(--accent)] disabled:opacity-50" />启用 FTPS</span></label>
            <label className={fieldClass}><span>远程路径</span><input disabled={running} value={String(settings.ftpBasePath ?? 'PIXIV')} onChange={e => update('ftpBasePath', e.target.value)} className={textInputClass} /></label>
          </>)}
          {storageMode === 'webdav' && (<>
            <label className={fullFieldClass}><span>服务地址</span><input disabled={running} value={String(settings.webdavUrl ?? '')} onChange={e => update('webdavUrl', e.target.value)} className={inputClass} placeholder="https://example.com/dav" /></label>
            <label className={fieldClass}><span>用户名</span><input disabled={running} value={String(settings.webdavUser ?? '')} onChange={e => update('webdavUser', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>密码</span><input disabled={running} type="password" value={String(settings.webdavPass ?? '')} onChange={e => update('webdavPass', e.target.value)} className={textInputClass} /></label>
            <label className={fullFieldClass}><span>远程路径</span><input disabled={running} value={String(settings.webdavBasePath ?? 'PIXIV')} onChange={e => update('webdavBasePath', e.target.value)} className={textInputClass} /></label>
          </>)}
          {storageMode === 's3' && (<>
            <label className={fullFieldClass}><span>Endpoint</span><input disabled={running} value={String(settings.s3Endpoint ?? '')} onChange={e => update('s3Endpoint', e.target.value)} className={inputClass} placeholder="https://s3.example.com" /></label>
            <label className={fieldClass}><span>Bucket</span><input disabled={running} value={String(settings.s3Bucket ?? '')} onChange={e => update('s3Bucket', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>Region</span><input disabled={running} value={String(settings.s3Region ?? '')} onChange={e => update('s3Region', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>Access Key</span><input disabled={running} value={String(settings.s3AccessKey ?? '')} onChange={e => update('s3AccessKey', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>Secret Key</span><input disabled={running} type="password" value={String(settings.s3SecretKey ?? '')} onChange={e => update('s3SecretKey', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>对象前缀</span><input disabled={running} value={String(settings.s3Prefix ?? 'PIXIV')} onChange={e => update('s3Prefix', e.target.value)} className={textInputClass} /></label>
            <label className={fieldClass}><span>兼容模式</span><span className="inline-flex items-center gap-2"><input disabled={running} type="checkbox" checked={Boolean(settings.s3ForcePathStyle ?? true)} onChange={e => update('s3ForcePathStyle', e.target.checked)} className="accent-[var(--accent)] disabled:opacity-50" />Path-style</span></label>
          </>)}
        </div>
      </fieldset>
      <fieldset className={sectionClass}>
        <legend className="text-sm font-medium text-text-primary px-1">数据与配置</legend>
        <div className="space-y-3">
          <label className={fullPathFieldClass}><span>数据库文件</span>
            <input disabled={running} value={String(settings.dbPath ?? './db/pixiv_manager.db')} onChange={e => update('dbPath', e.target.value)} className={inputClass} />
            <button type="button" disabled={running} onClick={pickDatabasePath} className={smallButtonClass}>选择</button>
          </label>
          <label className={fullPathFieldClass}><span>日志目录</span>
            <input disabled={running} value={String(settings.logDir ?? './logs')} onChange={e => update('logDir', e.target.value)} className={inputClass} />
            <button type="button" disabled={running} onClick={() => pickDirectory('logDir', '选择日志目录')} className={smallButtonClass}>浏览</button>
          </label>
          <label className={fullPathFieldClass}><span>临时目录</span>
            <input disabled={running} value={String(settings.tempPath ?? './temp')} onChange={e => update('tempPath', e.target.value)} className={inputClass} />
            <button type="button" disabled={running} onClick={() => pickDirectory('tempPath', '选择临时目录')} className={smallButtonClass}>浏览</button>
          </label>
          <label className={fullPathFieldClass}><span>头像缓存</span>
            <input disabled={running} value={String(settings.avatarsPath ?? './avatars')} onChange={e => update('avatarsPath', e.target.value)} className={inputClass} />
            <button type="button" disabled={running} onClick={() => pickDirectory('avatarsPath', '选择头像缓存目录')} className={smallButtonClass}>浏览</button>
          </label>
          <div className="grid gap-2 pt-1 sm:grid-cols-[repeat(5,minmax(112px,max-content))]">
            <button type="button" disabled={!bridgeReady || running} onClick={handleDbExport} className={actionButtonClass}>导出数据库</button>
            <button type="button" disabled={!bridgeReady || running} onClick={handleDbImport} className={actionButtonClass}>导入数据库</button>
            <button type="button" disabled={!bridgeReady || running} onClick={handleDbBackup} className={actionButtonClass}>备份数据库</button>
            <button type="button" disabled={!bridgeReady || running} onClick={handleSettingsExport} className={actionButtonClass}>导出 Pixiv 配置</button>
            <button type="button" disabled={!bridgeReady || running} onClick={handleSettingsImport} className={actionButtonClass}>导入 Pixiv 配置</button>
          </div>
        </div>
      </fieldset>
      <fieldset className={sectionClass}>
        <legend className="text-sm font-medium text-text-primary px-1">线程与性能</legend>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
          {[['downloadThreads','下载线程',1,10],['mainAccountSyncThreads','主同步',1,5],['backupAccountSyncThreads','备同步',1,5],['mainAccountDownloadThreads','主下载',1,5],['backupAccountDownloadThreads','备下载',1,5],['metadataRefreshLimit','回看数',0,100]].map(([k,l,min,max]) => (
            <label key={k} className="grid grid-cols-[72px_96px] items-center gap-3 text-xs text-text-secondary"><span>{l}</span>
              <input disabled={running} type="number" min={min} max={max} value={Number(settings[k] ?? (k === 'downloadThreads' ? 4 : k === 'metadataRefreshLimit' ? 20 : 1))} onChange={e => update(String(k), Math.max(Number(min), Math.min(Number(max), parseInt(e.target.value) || Number(min))))} className={shortInputClass} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={sectionClass}>
        <legend className="text-sm font-medium text-text-primary px-1">动图与风控</legend>
        <div className={gridClass}>
          <label className={fieldClass}><span>Ugoira</span>
            <select disabled={running} value={String(settings.ugoiraOutput ?? 'gif')} onChange={e => update('ugoiraOutput', e.target.value)} className="h-8 w-24 rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50"><option value="gif">GIF</option><option value="apng">APNG</option><option value="webp">WebP</option></select>
          </label>
          <label className={fieldClass}><span>风控保护</span><span className="inline-flex items-center gap-2"><input disabled={running} type="checkbox" checked={Boolean(settings.rateLimitEnabled ?? true)} onChange={e => update('rateLimitEnabled', e.target.checked)} className="accent-[var(--accent)] disabled:opacity-50" />启用</span></label>
          <label className={fieldClass}><span>失败率阈值</span>
            <input disabled={running} type="number" min={0.1} max={0.9} step={0.05} value={Number(settings.failureRateThreshold ?? 0.5)} onChange={e => update('failureRateThreshold', parseFloat(e.target.value) || 0.5)} className={shortInputClass} />
          </label>
          <label className={fieldClass}><span>自动降速</span><span className="inline-flex items-center gap-2"><input disabled={running} type="checkbox" checked={Boolean(settings.autoThrottleEnabled ?? true)} onChange={e => update('autoThrottleEnabled', e.target.checked)} className="accent-[var(--accent)] disabled:opacity-50" />启用</span></label>
        </div>
      </fieldset>
      <button onClick={handleSaveAll} disabled={!bridgeReady || running} className="inline-flex h-9 items-center rounded-sm bg-accent px-6 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">保存所有设置</button>
    </div>
  );
};

export { manifest };
export default PixivTool;
