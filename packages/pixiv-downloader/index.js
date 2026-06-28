// packages/react-global-shim.js
var React = window.__37toolbox_react || window.React;
if (!React) {
  throw new Error("React runtime is not available for external plugin");
}
var react_global_shim_default = React;
var Fragment = React.Fragment;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useState = React.useState;

// src/plugins/pixiv-downloader/manifest.ts
var manifest = {
  id: "pixiv-downloader",
  name: "Pixiv\u4E0B\u8F7D",
  description: "Pixiv \u753B\u5E08\u4F5C\u54C1\u4E0B\u8F7D\u4E0E\u540C\u6B65",
  category: "download",
  version: "2.0.0",
  icon: "download",
  tags: ["pixiv", "download", "illust", "ugoira", "novel", "sync"],
  hasSettings: true,
  defaultSettings: {
    pythonPath: "python",
    localSavePath: "",
    dbPath: "./db/pixiv_manager.db",
    logDir: "./logs",
    tempPath: "./temp",
    avatarsPath: "./avatars",
    storageMode: "local",
    nasIp: "",
    nasUser: "",
    nasPass: "",
    nasShare: "",
    nasBasePath: "PIXIV",
    nasRemoteName: "",
    sftpHost: "",
    sftpPort: 22,
    sftpUser: "",
    sftpPass: "",
    sftpPrivateKey: "",
    sftpBasePath: "PIXIV",
    ftpHost: "",
    ftpPort: 21,
    ftpUser: "",
    ftpPass: "",
    ftpBasePath: "PIXIV",
    ftpTls: false,
    webdavUrl: "",
    webdavUser: "",
    webdavPass: "",
    webdavBasePath: "PIXIV",
    s3Endpoint: "",
    s3Region: "",
    s3Bucket: "",
    s3AccessKey: "",
    s3SecretKey: "",
    s3Prefix: "PIXIV",
    s3ForcePathStyle: true,
    downloadThreads: 4,
    mainAccountSyncThreads: 1,
    backupAccountSyncThreads: 2,
    mainAccountDownloadThreads: 1,
    backupAccountDownloadThreads: 2,
    metadataRefreshLimit: 20,
    ugoiraOutput: "gif",
    rateLimitEnabled: true,
    autoThrottleEnabled: true,
    failureRateThreshold: 0.5
  }
};

// src/plugins/pixiv-downloader/engine.ts
var waiters = [];
var progressHandler = null;
function dispatchLine(line) {
  let msg;
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
  return window.toolbox?.python;
}
function waitForMessage(action, args, type, map, timeout = 5e3) {
  const py = getPython();
  if (!py) return Promise.resolve(null);
  return new Promise((resolve) => {
    const waiter = {
      type,
      map,
      resolve,
      timer: window.setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        resolve(null);
      }, timeout)
    };
    waiters.push(waiter);
    py.send({ action, args });
  });
}
async function startBridge(onProgress) {
  const py = getPython();
  if (!py) return { ok: false, error: "Python bridge \u4E0D\u53EF\u7528\uFF08\u975E Electron \u73AF\u5883\uFF09" };
  py.offOutput();
  progressHandler = onProgress;
  py.onOutput(dispatchLine);
  return py.start();
}
async function stopBridge() {
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
async function getStatus() {
  return waitForMessage("status", {}, "status", (m) => m.ok ? m.data : null, 2e3);
}
async function getConfig() {
  return waitForMessage("config:get", {}, "config", (m) => m.ok ? m.data : null, 3e3);
}
async function updateConfig(data) {
  return await waitForMessage("config:set", data, "config_saved", (m) => m.ok === true, 3e3) === true;
}
async function runDataCommand(action, path) {
  const result = await waitForMessage(
    action,
    { path },
    "data_result",
    (m) => m.ok === true,
    1e4
  );
  return result === true;
}
async function exportDatabase(path) {
  return runDataCommand("db:export", path);
}
async function importDatabase(path) {
  return runDataCommand("db:import", path);
}
async function backupDatabase(path) {
  return runDataCommand("db:backup", path);
}
async function exportPixivSettings(path) {
  return runDataCommand("settings:export", path);
}
async function importPixivSettings(path) {
  return runDataCommand("settings:import", path);
}
async function startSync(deep, artistId) {
  const py = getPython();
  if (!py) return;
  await py.send({ action: "sync", args: { deep, aid: artistId ?? null } });
}
async function startDownload(limit, artistId) {
  const py = getPython();
  if (!py) return;
  await py.send({ action: "download", args: { limit: limit ?? null, aid: artistId ?? null } });
}
async function startSyncAndDownload(deep, limit) {
  const py = getPython();
  if (!py) return;
  await py.send({ action: "sync-and-download", args: { deep, limit: limit ?? null } });
}
async function getTokenUrl() {
  return waitForMessage("token:url", {}, "token_url", (m) => m.ok ? m.data : null, 5e3);
}
async function exchangeToken(code, verifier, name, remark) {
  return await waitForMessage(
    "token:exchange",
    { code, verifier, name: name ?? "", remark: remark ?? "" },
    "token_result",
    (m) => ({ ok: m.ok === true, name: m.data?.name, username: m.data?.username, error: m.error }),
    15e3
  ) ?? { ok: false, error: "\u8D85\u65F6" };
}
async function testTokens() {
  return await waitForMessage("token:test", {}, "token_test_done", () => true, 1e4) === true;
}
async function removeToken(name) {
  return await waitForMessage("token:remove", { name }, "token_removed", (m) => m.ok !== false, 3e3) === true;
}
async function setMainAccount(name) {
  return await waitForMessage("account:set-main", { name }, "account_set", (m) => m.ok !== false, 3e3) === true;
}
async function getPreview(limit = 20) {
  return await waitForMessage("preview", { limit }, "preview", (m) => m.ok ? m.data : [], 5e3) ?? [];
}
async function retryFailed() {
  return await waitForMessage("retry", {}, "retry_done", (m) => m.ok ? Number(m.count ?? 0) : 0, 3e3) ?? 0;
}
async function requestStop() {
  const py = getPython();
  if (!py) return;
  await py.send({ action: "stop" });
}

// packages/react-jsx-runtime-shim.js
var Fragment2 = react_global_shim_default.Fragment;
function jsx(type, props, key) {
  const nextProps = props ? { ...props } : {};
  if (key !== void 0) {
    nextProps.key = key;
  }
  return react_global_shim_default.createElement(type, nextProps);
}
var jsxs = jsx;

// src/plugins/pixiv-downloader/Tool.tsx
var TASK_LABELS = {
  sync: "\u540C\u6B65",
  download: "\u4E0B\u8F7D",
  "sync-download": "\u540C\u6B65+\u4E0B\u8F7D"
};
var ACTION_LABELS = {
  sync: "\u589E\u91CF\u540C\u6B65",
  download: "\u4EC5\u4E0B\u8F7D",
  "sync-download": "\u540C\u6B65+\u4E0B\u8F7D",
  refresh: "\u5237\u65B0",
  preview: "\u9884\u89C8\u4EFB\u52A1",
  retry: "\u91CD\u8BD5\u5931\u8D25"
};
var ConfirmTaskDialog = ({ task, onConfirm, onCancel }) => /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30", onPointerDown: onCancel, children: /* @__PURE__ */ jsxs(
  "div",
  {
    className: "w-[420px] max-w-[calc(100vw-48px)] rounded-lg border border-border bg-bg-secondary p-5 shadow-xl",
    onPointerDown: (e) => e.stopPropagation(),
    children: [
      /* @__PURE__ */ jsxs("h3", { className: "text-base font-semibold text-text-primary", children: [
        "\u786E\u8BA4\u6267\u884C ",
        task.label
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm leading-6 text-text-secondary", children: task.description }),
      /* @__PURE__ */ jsx("p", { className: "mt-3 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-text-secondary", children: "\u6267\u884C\u671F\u95F4\u4F1A\u9501\u5B9A\u5176\u4ED6\u4E0B\u8F7D\u5668\u4EFB\u52A1\uFF0C\u907F\u514D\u540C\u6B65\u3001\u4E0B\u8F7D\u3001\u6570\u636E\u5E93\u64CD\u4F5C\u4E92\u76F8\u62A2\u5360\u3002" }),
      /* @__PURE__ */ jsxs("div", { className: "mt-5 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: onCancel, className: "inline-flex h-9 items-center rounded-sm border border-border bg-bg-primary px-4 text-sm text-text-secondary hover:bg-bg-hover", children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: onConfirm, className: "inline-flex h-9 items-center rounded-sm bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover", children: "\u786E\u8BA4\u6267\u884C" })
      ] })
    ]
  }
) });
var LogPanel = ({ lines, running, stopping, onStop }) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col rounded-md border border-border bg-bg-secondary", children: [
  /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-2", children: [
    /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-text-primary", children: stopping ? "\u505C\u6B62\u4E2D..." : running ? "\u8FD0\u884C\u4E2D..." : "\u8F93\u51FA" }),
    running && /* @__PURE__ */ jsx("button", { disabled: stopping, onClick: onStop, className: "rounded-sm bg-status-error px-2 py-0.5 text-2xs text-white hover:opacity-80 disabled:opacity-50", children: stopping ? "\u505C\u6B62\u4E2D" : "\u505C\u6B62" })
  ] }),
  /* @__PURE__ */ jsx("pre", { className: "max-h-80 overflow-y-auto p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap", children: lines.length === 0 ? "\u7B49\u5F85\u64CD\u4F5C..." : lines.map((l, i) => /* @__PURE__ */ jsx("div", { children: l }, i)) })
] });
var StatsCards = ({ stats }) => {
  if (!stats) return null;
  return /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-5", children: [["\u753B\u5E08", stats.artists], ["\u4F5C\u54C1", stats.illusts], ["\u5DF2\u4E0B\u8F7D", stats.done], ["\u5F85\u4E0B\u8F7D", stats.pending], ["\u5931\u8D25", stats.failed]].map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary p-3 text-center", children: [
    /* @__PURE__ */ jsx("div", { className: "text-lg font-semibold text-text-primary", children: value }),
    /* @__PURE__ */ jsx("div", { className: "text-2xs text-text-secondary", children: label })
  ] }, label)) });
};
var AccountStatusBadge = ({ stats, onAdd }) => {
  const accounts = stats?.accounts ?? [];
  const validAccounts = accounts.filter((account) => account.isValid);
  const summary = accounts.length === 0 ? "\u672A\u6DFB\u52A0\u8D26\u53F7" : `${validAccounts.length}/${accounts.length} \u53EF\u7528`;
  const tone = validAccounts.length > 0 ? "border-status-success/30 bg-status-success/10 text-status-success" : "border-status-error/30 bg-status-error/10 text-status-error";
  return /* @__PURE__ */ jsxs("div", { className: `flex max-w-full items-center gap-3 rounded-md border px-3 py-2 text-xs ${tone}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxs("div", { className: "font-medium", children: [
        "\u8D26\u53F7\u72B6\u6001\uFF1A",
        summary
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mt-0.5 truncate text-text-secondary", children: accounts.length > 0 ? accounts.map((account) => `${account.username || account.name}${account.isValid ? " \u53EF\u7528" : " \u4E0D\u53EF\u7528"}`).join(" / ") : "\u540C\u6B65\u548C\u4E0B\u8F7D\u524D\u9700\u8981\u5148\u6DFB\u52A0 Pixiv \u8D26\u53F7" })
    ] }),
    validAccounts.length === 0 && /* @__PURE__ */ jsx("button", { type: "button", title: "\u5207\u6362\u5230\u8D26\u53F7\u9875\u6DFB\u52A0\u6216\u91CD\u65B0\u6388\u6743\u8D26\u53F7", onClick: onAdd, className: "h-7 shrink-0 rounded-sm bg-accent px-3 text-2xs font-medium text-white hover:bg-accent-hover", children: "\u53BB\u6DFB\u52A0" })
  ] });
};
var ProgressOverview = ({ stats, activeTask, stopping }) => {
  const done = Number(stats?.done ?? 0);
  const pending = Number(stats?.pending ?? 0);
  const failed = Number(stats?.failed ?? 0);
  const total = done + pending + failed;
  const percent = total > 0 ? Math.round(done / total * 100) : 0;
  const label = stopping ? "\u505C\u6B62\u4E2D" : activeTask ? TASK_LABELS[activeTask] : "\u7A7A\u95F2";
  return /* @__PURE__ */ jsxs("div", { className: "grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]", children: [
    /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary p-3", children: [
      /* @__PURE__ */ jsx("div", { className: "text-2xs text-text-muted", children: "\u5F53\u524D\u72B6\u6001" }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 text-base font-semibold text-text-primary", children: label }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 text-2xs text-text-secondary", children: total > 0 ? `\u5B8C\u6210 ${done} / ${total}` : "\u6682\u65E0\u4E0B\u8F7D\u961F\u5217" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary p-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center justify-between text-xs text-text-secondary", children: [
        /* @__PURE__ */ jsx("span", { children: "\u4E0B\u8F7D\u8FDB\u5EA6" }),
        /* @__PURE__ */ jsxs("span", { className: "font-mono", children: [
          percent,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-3 overflow-hidden rounded-full border border-border bg-bg-sidebar", children: /* @__PURE__ */ jsx("div", { className: `h-full rounded-full bg-accent transition-all ${activeTask && total === 0 ? "animate-pulse" : ""}`, style: { width: `${activeTask && total === 0 ? 35 : percent}%` } }) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-2 grid grid-cols-3 text-center text-2xs text-text-secondary", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5DF2\u4E0B\u8F7D ",
          done
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5F85\u4E0B\u8F7D ",
          pending
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u5931\u8D25 ",
          failed
        ] })
      ] })
    ] })
  ] });
};
var PixivTool = ({ settings, onSettingsChange, onStatusChange }) => {
  const [tab, setTab] = useState("ops");
  const [activeTask, setActiveTask] = useState(null);
  const [pendingTask, setPendingTask] = useState(null);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [stopping, setStopping] = useState(false);
  const logRef = useRef([]);
  const activeTaskRef = useRef(null);
  const running = activeTask !== null;
  const addLog = useCallback((msg) => {
    logRef.current = [...logRef.current.slice(-500), msg];
    setLogs([...logRef.current]);
  }, []);
  const progressCb = useCallback((msg) => {
    if (msg.type === "progress" || msg.type === "stderr") {
      addLog(msg.type === "stderr" ? `[stderr] ${msg.message}` : msg.message ?? "");
    } else if (msg.type === "sync_complete" || msg.type === "download_complete") {
      const prefix = msg.type === "sync_complete" ? "[\u540C\u6B65]" : "[\u4E0B\u8F7D]";
      addLog(msg.ok ? `${prefix} ${msg.message}` : `${prefix} \u9519\u8BEF: ${msg.error || msg.message}`);
      const task = activeTaskRef.current;
      const syncDownloadStillRunning = task === "sync-download" && msg.type === "sync_complete" && msg.ok;
      if (!syncDownloadStillRunning) {
        activeTaskRef.current = null;
        setActiveTask(null);
        setStopping(false);
        getStatus().then(setStatus);
      }
    } else if (msg.type === "process_exit") {
      addLog(`[\u8FDB\u7A0B\u9000\u51FA] code=${msg.code}`);
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
      setBridgeReady(false);
    } else if (msg.type === "cancelled") {
      addLog(`[\u5DF2\u505C\u6B62] ${msg.message ?? ""}`);
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
    } else if (msg.type === "error") {
      addLog(`[\u9519\u8BEF] ${msg.error}`);
    }
  }, [addLog]);
  useEffect(() => {
    startBridge(progressCb).then((res) => {
      if (res.ok) {
        setBridgeReady(true);
        setBridgeError("");
        addLog("[Bridge] Python \u8FDB\u7A0B\u5DF2\u542F\u52A8");
        getStatus().then(setStatus);
        getConfig().then((config) => {
          if (config) {
            onSettingsChange({ ...settings, ...config });
            addLog("[\u914D\u7F6E] \u5DF2\u8F7D\u5165 Python settings.json");
          }
        });
      } else {
        setBridgeError(res.error ?? "\u542F\u52A8\u5931\u8D25");
        addLog(`[Bridge] \u542F\u52A8\u5931\u8D25: ${res.error}`);
      }
    });
    return () => {
      stopBridge();
    };
  }, []);
  useEffect(() => {
    onStatusChange(running ? "running" : bridgeReady ? "success" : "idle", stopping ? "\u505C\u6B62\u4E2D..." : running ? "\u5904\u7406\u4E2D..." : bridgeReady ? "\u5C31\u7EEA" : "\u7B49\u5F85 Python");
  }, [running, stopping, bridgeReady, onStatusChange]);
  const requestTask = (task) => {
    if (!bridgeReady) {
      addLog("[\u4EFB\u52A1] Python bridge \u5C1A\u672A\u5C31\u7EEA");
      return;
    }
    const hasValidAccount = (status?.accounts ?? []).some((account) => account.isValid);
    if (!hasValidAccount) {
      addLog("[\u8D26\u53F7] \u6CA1\u6709\u53EF\u7528 Pixiv \u8D26\u53F7\u3002\u8BF7\u5148\u5230\u8D26\u53F7\u9875\u6DFB\u52A0\u8D26\u53F7\uFF0C\u6216\u91CD\u65B0\u6DFB\u52A0\u4E0D\u53EF\u7528\u8D26\u53F7\u3002");
      setTab("accounts");
      return;
    }
    if (activeTaskRef.current) {
      addLog(`[\u4EFB\u52A1] \u5F53\u524D\u6B63\u5728\u6267\u884C ${TASK_LABELS[activeTaskRef.current]}\uFF0C\u8BF7\u5148\u505C\u6B62\u6216\u7B49\u5F85\u5B8C\u6210`);
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
    addLog(`[${task.label}] \u5F00\u59CB...`);
    try {
      if (task.kind === "sync") await startSync(Boolean(task.deep));
      if (task.kind === "download") await startDownload(task.limit);
      if (task.kind === "sync-download") await startSyncAndDownload(Boolean(task.deep), task.limit);
    } catch (e) {
      activeTaskRef.current = null;
      setActiveTask(null);
      setStopping(false);
      addLog(`[\u9519\u8BEF] ${e}`);
    }
  };
  const handleSync = (deep) => requestTask({
    kind: "sync",
    label: deep ? "\u5168\u91CF\u540C\u6B65" : "\u589E\u91CF\u540C\u6B65",
    description: deep ? "\u5C06\u91CD\u65B0\u626B\u63CF Pixiv \u753B\u5E08\u4E0E\u4F5C\u54C1\u5143\u6570\u636E\uFF0C\u8017\u65F6\u53EF\u80FD\u8F83\u957F\u3002" : "\u53EA\u540C\u6B65\u65B0\u589E\u6216\u53D8\u5316\u7684\u6570\u636E\uFF0C\u9002\u5408\u4F5C\u4E3A\u65E5\u5E38\u66F4\u65B0\u3002",
    deep
  });
  const handleDownload = (limit) => requestTask({
    kind: "download",
    label: "\u4EC5\u4E0B\u8F7D",
    description: `\u5F00\u59CB\u4E0B\u8F7D\u6570\u636E\u5E93\u4E2D\u7684\u5F85\u4E0B\u8F7D\u4F5C\u54C1\u3002\u6570\u91CF\u9650\u5236\uFF1A${limit ?? "\u4E0D\u9650"}\u3002`,
    limit
  });
  const handleSyncAndDownload = (deep, limit) => requestTask({
    kind: "sync-download",
    label: "\u540C\u6B65+\u4E0B\u8F7D",
    description: `${deep ? "\u5148\u5168\u91CF\u540C\u6B65" : "\u5148\u589E\u91CF\u540C\u6B65"}\uFF0C\u540C\u6B65\u5B8C\u6210\u540E\u7EE7\u7EED\u4E0B\u8F7D\u5F85\u4E0B\u8F7D\u4F5C\u54C1\u3002\u6570\u91CF\u9650\u5236\uFF1A${limit ?? "\u4E0D\u9650"}\u3002`,
    deep,
    limit
  });
  const handleStop = () => {
    if (!activeTaskRef.current || stopping) return;
    setStopping(true);
    addLog("[\u624B\u52A8\u505C\u6B62] \u5DF2\u8BF7\u6C42\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\uFF0C\u7B49\u5F85 Python \u6536\u5C3E...");
    requestStop().catch((e) => {
      setStopping(false);
      addLog(`[\u624B\u52A8\u505C\u6B62] \u8BF7\u6C42\u5931\u8D25: ${e}`);
    });
  };
  const handleRefresh = () => {
    if (activeTaskRef.current) {
      addLog("[\u5237\u65B0\u7EDF\u8BA1] \u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u5DF2\u8DF3\u8FC7\u5237\u65B0\u4EE5\u907F\u514D\u6570\u636E\u5E93\u62A2\u5360");
      return;
    }
    getStatus().then(setStatus);
    addLog("[\u5237\u65B0\u7EDF\u8BA1]");
  };
  const handlePreview = async () => {
    if (activeTaskRef.current) {
      addLog("[\u9884\u89C8\u4EFB\u52A1] \u5F53\u524D\u6709\u4EFB\u52A1\u8FD0\u884C\uFF0C\u5DF2\u8DF3\u8FC7\u9884\u89C8");
      return;
    }
    const rows = await getPreview(20);
    addLog(`[\u9884\u89C8\u4EFB\u52A1] \u5F85\u5904\u7406\u4EFB\u52A1 ${rows.length} \u6761${rows.length >= 20 ? "\uFF08\u4EC5\u663E\u793A\u524D 20 \u6761\uFF09" : ""}`);
    rows.slice(0, 10).forEach((row, index) => {
      const item = row;
      addLog(`[\u9884\u89C8 ${index + 1}] ${item.task_key ?? "-"} | ${item.media_type ?? "-"} | ${item.title ?? ""} | artist=${item.author_id ?? "-"}`);
    });
  };
  const handleRetryFailed = async () => {
    if (activeTaskRef.current) {
      addLog("[\u91CD\u8BD5\u5931\u8D25] \u5F53\u524D\u6709\u4EFB\u52A1\u8FD0\u884C\uFF0C\u5DF2\u8DF3\u8FC7\u91CD\u7F6E");
      return;
    }
    const count = await retryFailed();
    addLog(`[\u91CD\u8BD5\u5931\u8D25] \u5DF2\u91CD\u7F6E ${count} \u4E2A\u5931\u8D25\u4EFB\u52A1\u4E3A\u5F85\u4E0B\u8F7D`);
    getStatus().then(setStatus);
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
    bridgeError && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error", children: [
      /* @__PURE__ */ jsx("strong", { children: "Python \u8FDE\u63A5\u5931\u8D25:" }),
      " ",
      bridgeError,
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-text-muted", children: "\u8BF7\u786E\u4FDD\u5DF2\u5B89\u88C5 Python \u53CA\u4F9D\u8D56\u3002conda \u73AF\u5883: conda activate pix" })
    ] }),
    /* @__PURE__ */ jsx(StatsCards, { stats: status }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]", children: [
      /* @__PURE__ */ jsx(ProgressOverview, { stats: status, activeTask, stopping }),
      /* @__PURE__ */ jsx(AccountStatusBadge, { stats: status, onAdd: () => setTab("accounts") })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-1 border-b border-border", children: [["ops", "\u64CD\u4F5C"], ["accounts", "\u8D26\u53F7"], ["config", "\u8BBE\u7F6E"]].map(([k, l]) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setTab(k), className: `px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${tab === k ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text-primary"}`, children: l }, k)) }),
    tab === "ops" && /* @__PURE__ */ jsx(OpsTab, { bridgeReady, running, stopping, onSync: handleSync, onDownload: handleDownload, onSyncAndDownload: handleSyncAndDownload, onRefresh: handleRefresh, onPreview: handlePreview, onRetryFailed: handleRetryFailed, logs, onStop: handleStop }),
    tab === "accounts" && /* @__PURE__ */ jsx(AccountsTab, { addLog, bridgeReady, running }),
    tab === "config" && /* @__PURE__ */ jsx(ConfigTab, { settings, onSettingsChange, bridgeReady, running, addLog }),
    pendingTask && /* @__PURE__ */ jsx(ConfirmTaskDialog, { task: pendingTask, onConfirm: () => {
      void startConfirmedTask();
    }, onCancel: () => setPendingTask(null) })
  ] });
};
var OpsTab = ({ bridgeReady, running, stopping, onSync, onDownload, onSyncAndDownload, onRefresh, onPreview, onRetryFailed, onStop, logs }) => {
  const [deep, setDeep] = useState(false);
  const [limit, setLimit] = useState("");
  const [selectedAction, setSelectedAction] = useState("sync-download");
  const limitNum = limit ? parseInt(limit, 10) : void 0;
  const runSelected = () => {
    if (selectedAction === "sync") onSync(deep);
    if (selectedAction === "download") onDownload(limitNum);
    if (selectedAction === "sync-download") onSyncAndDownload(deep, limitNum);
    if (selectedAction === "refresh") onRefresh();
    if (selectedAction === "preview") void onPreview();
    if (selectedAction === "retry") void onRetryFailed();
  };
  const actionButton = (action, description) => /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      disabled: !bridgeReady || running,
      title: description,
      onClick: () => setSelectedAction(action),
      className: `inline-flex h-9 items-center rounded-sm border px-3 text-sm font-medium transition disabled:opacity-50 ${selectedAction === action ? "border-accent bg-accent text-white" : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`,
      children: action === "sync" ? deep ? "\u5168\u91CF\u540C\u6B65" : "\u589E\u91CF\u540C\u6B65" : ACTION_LABELS[action]
    },
    action
  );
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    running && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-accent/30 bg-accent-subtle px-3 py-2 text-xs text-text-secondary", children: stopping ? "\u6B63\u5728\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\uFF0C\u7B49\u5F85 Python \u5B8C\u6210\u6536\u5C3E\u540E\u4F1A\u81EA\u52A8\u89E3\u9501\u3002" : "\u5F53\u524D\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u5176\u4ED6\u4EFB\u52A1\u5165\u53E3\u5DF2\u9501\u5B9A\u3002\u9700\u8981\u5207\u6362\u4EFB\u52A1\u65F6\u8BF7\u5148\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\u3002" }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      actionButton("sync", "\u9009\u62E9\u540C\u6B65 Pixiv \u753B\u5E08\u548C\u4F5C\u54C1\u4FE1\u606F\uFF1B\u52FE\u9009\u5168\u91CF\u626B\u63CF\u65F6\u4F1A\u91CD\u65B0\u626B\u63CF\u66F4\u591A\u5386\u53F2\u6570\u636E"),
      actionButton("download", "\u9009\u62E9\u53EA\u4E0B\u8F7D\u6570\u636E\u5E93\u91CC\u5F85\u4E0B\u8F7D\u7684\u4F5C\u54C1\uFF0C\u4E0D\u6267\u884C\u540C\u6B65"),
      actionButton("sync-download", "\u9009\u62E9\u5148\u540C\u6B65\u518D\u4E0B\u8F7D\uFF0C\u662F\u65E5\u5E38\u6700\u5E38\u7528\u7684\u5B8C\u6574\u6D41\u7A0B"),
      actionButton("refresh", "\u9009\u62E9\u5237\u65B0\u7EDF\u8BA1\u6570\u636E\uFF0C\u4E0D\u4F1A\u4E0B\u8F7D\u6216\u540C\u6B65"),
      actionButton("preview", "\u9009\u62E9\u9884\u89C8\u5F85\u4E0B\u8F7D\u4EFB\u52A1\uFF0C\u53EA\u67E5\u770B\u961F\u5217\u4E0D\u6267\u884C\u4E0B\u8F7D"),
      actionButton("retry", "\u9009\u62E9\u628A\u5931\u8D25\u4EFB\u52A1\u91CD\u7F6E\u4E3A\u5F85\u4E0B\u8F7D\uFF0C\u4FBF\u4E8E\u91CD\u65B0\u6267\u884C"),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: !bridgeReady || running,
          title: `\u6267\u884C\u5F53\u524D\u9009\u4E2D\u7684\u64CD\u4F5C\uFF1A${ACTION_LABELS[selectedAction]}`,
          onClick: runSelected,
          className: "inline-flex h-9 items-center rounded-sm bg-accent px-5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-50",
          children: "\u6267\u884C\u6240\u9009"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary", children: [
      "\u5F53\u524D\u9009\u62E9\uFF1A",
      /* @__PURE__ */ jsx("span", { className: "font-medium text-text-primary", children: selectedAction === "sync" ? deep ? "\u5168\u91CF\u540C\u6B65" : "\u589E\u91CF\u540C\u6B65" : ACTION_LABELS[selectedAction] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-4 text-xs text-text-secondary", children: [
      /* @__PURE__ */ jsxs("label", { title: "\u5F00\u542F\u540E\u540C\u6B65\u4F1A\u5C3D\u91CF\u91CD\u65B0\u626B\u63CF\u5386\u53F2\u6570\u636E\uFF0C\u8017\u65F6\u66F4\u957F", className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", disabled: running, checked: deep, onChange: (e) => setDeep(e.target.checked), className: "accent-[var(--accent)] disabled:opacity-50" }),
        "\u5168\u91CF\u626B\u63CF"
      ] }),
      /* @__PURE__ */ jsxs("label", { title: "\u9650\u5236\u672C\u6B21\u6700\u591A\u4E0B\u8F7D\u591A\u5C11\u4E2A\u4EFB\u52A1\uFF0C\u7559\u7A7A\u8868\u793A\u4E0D\u9650\u5236", className: "flex items-center gap-2", children: [
        "\u6570\u91CF\u9650\u5236 ",
        /* @__PURE__ */ jsx("input", { type: "number", disabled: running, value: limit, onChange: (e) => setLimit(e.target.value), placeholder: "\u4E0D\u9650", className: "w-20 rounded-sm border border-border bg-bg-secondary px-2 py-1 font-mono text-xs text-text-primary disabled:opacity-50" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(LogPanel, { lines: logs, running, stopping, onStop })
  ] });
};
var AccountsTab = ({ addLog, bridgeReady, running }) => {
  const [status, setStatus] = useState(null);
  const [tokenMode, setTokenMode] = useState("idle");
  const [authUrl, setAuthUrl] = useState("");
  const [verifier, setVerifier] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [accountName, setAccountName] = useState("");
  const [remark, setRemark] = useState("");
  const refresh = () => getStatus().then(setStatus);
  useEffect(() => {
    refresh();
  }, [bridgeReady]);
  const guardAccountAction = () => {
    if (running) {
      addLog("[Token] \u5F53\u524D\u6709\u4E0B\u8F7D\u5668\u4EFB\u52A1\u8FD0\u884C\uFF0C\u8D26\u53F7\u64CD\u4F5C\u5DF2\u9501\u5B9A");
      return false;
    }
    return true;
  };
  const handleGetUrl = async () => {
    if (!guardAccountAction()) return;
    setTokenMode("waiting");
    const res = await getTokenUrl();
    if (res) {
      setAuthUrl(res.url);
      setVerifier(res.verifier);
      addLog("[Token] \u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u6388\u6743 URL \u5E76\u767B\u5F55");
    } else {
      addLog("[Token] \u83B7\u53D6\u6388\u6743 URL \u5931\u8D25");
      setTokenMode("idle");
    }
  };
  const handleExchange = async () => {
    if (!guardAccountAction() || !codeInput.trim() || !verifier) return;
    addLog("[Token] \u6B63\u5728\u6362\u53D6...");
    const res = await exchangeToken(codeInput.trim(), verifier, accountName.trim(), remark.trim());
    if (res.ok) {
      addLog(`[Token] \u6210\u529F: ${res.name} (${res.username})`);
      setTokenMode("idle");
      setCodeInput("");
      setAccountName("");
      setRemark("");
      refresh();
    } else {
      addLog(`[Token] \u5931\u8D25: ${res.error}`);
    }
  };
  const handleTestAll = async () => {
    if (!guardAccountAction()) return;
    addLog("[Token] \u6D4B\u8BD5\u4E2D...");
    await testTokens();
    addLog("[Token] \u5B8C\u6210");
    refresh();
  };
  const handleRemove = async (name) => {
    if (!guardAccountAction()) return;
    await removeToken(name);
    addLog(`[Token] \u5DF2\u5220\u9664: ${name}`);
    refresh();
  };
  const handleSetMain = async (name) => {
    if (!guardAccountAction()) return;
    await setMainAccount(name);
    addLog(`[Token] \u5DF2\u8BBE\u4E3A\u4E3B: ${name}`);
    refresh();
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    status && status.accounts.length > 0 ? /* @__PURE__ */ jsx("div", { className: "space-y-2", children: status.accounts.map((acc) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-md border border-border bg-bg-secondary p-3", children: [
      /* @__PURE__ */ jsx("div", { className: `h-2 w-2 rounded-full ${acc.isValid ? "bg-status-success" : "bg-status-error"}` }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: acc.username || acc.name }),
          acc.isMain && /* @__PURE__ */ jsx("span", { className: "rounded-sm bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent", children: "\u4E3B\u8D26\u53F7" }),
          acc.remark && /* @__PURE__ */ jsxs("span", { className: "text-2xs text-text-muted", children: [
            "(",
            acc.remark,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "text-2xs text-text-muted", children: acc.name })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
        !acc.isMain && /* @__PURE__ */ jsx("button", { disabled: running, onClick: () => handleSetMain(acc.name), className: "rounded-sm px-2 py-1 text-2xs text-text-secondary hover:bg-bg-hover disabled:opacity-50", children: "\u8BBE\u4E3A\u4E3B" }),
        /* @__PURE__ */ jsx("button", { disabled: running, onClick: () => handleRemove(acc.name), className: "rounded-sm px-2 py-1 text-2xs text-status-error hover:bg-bg-hover disabled:opacity-50", children: "\u5220\u9664" })
      ] })
    ] }, acc.name)) }) : /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs leading-6 text-text-secondary", children: [
      /* @__PURE__ */ jsx("div", { className: "font-medium text-text-primary", children: "\u6682\u65E0\u8D26\u53F7" }),
      /* @__PURE__ */ jsx("div", { children: "\u540C\u6B65\u4F5C\u54C1\u3001\u4E0B\u8F7D\u539F\u56FE\u3001\u5237\u65B0 Pixiv \u5143\u6570\u636E\u90FD\u9700\u8981\u53EF\u7528\u8D26\u53F7\u3002\u8BF7\u70B9\u51FB\u201C\u6DFB\u52A0\u8D26\u53F7\u201D\uFF0C\u6309\u4E0B\u65B9\u6B65\u9AA4\u5B8C\u6210\u6388\u6743\u3002" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsx("button", { title: "\u68C0\u67E5\u5DF2\u4FDD\u5B58\u8D26\u53F7\u7684 Refresh Token \u662F\u5426\u4ECD\u7136\u53EF\u7528", onClick: handleTestAll, disabled: !bridgeReady || running, className: "inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50", children: "\u6D4B\u8BD5\u5168\u90E8" }),
      /* @__PURE__ */ jsx("button", { title: "\u751F\u6210 Pixiv \u6388\u6743\u94FE\u63A5\u5E76\u6DFB\u52A0\u65B0\u8D26\u53F7", onClick: handleGetUrl, disabled: tokenMode === "waiting" || !bridgeReady || running, className: "inline-flex h-8 items-center rounded-sm bg-accent px-3 text-xs text-white hover:bg-accent-hover disabled:opacity-50", children: "\u6DFB\u52A0\u8D26\u53F7" })
    ] }),
    tokenMode === "waiting" && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary p-4 space-y-3", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs text-text-primary font-medium", children: "\u6DFB\u52A0 Pixiv \u8D26\u53F7" }),
      /* @__PURE__ */ jsx("div", { className: "rounded-md border border-border bg-bg-sidebar px-3 py-2 text-xs leading-6 text-text-secondary", children: "\u8FD9\u4E2A\u6B65\u9AA4\u4E0D\u662F\u8F93\u5165 Pixiv \u5BC6\u7801\uFF0C\u800C\u662F\u8BA9 Pixiv \u8FD4\u56DE\u4E00\u4E2A\u6388\u6743\u56DE\u8C03\u5730\u5740\u3002\u590D\u5236\u56DE\u8C03\u5730\u5740\u540E\uFF0C\u5DE5\u5177\u4F1A\u4ECE\u91CC\u9762\u6362\u53D6 Refresh Token \u5E76\u4FDD\u5B58\u5230\u672C\u5730\u914D\u7F6E\u3002" }),
      /* @__PURE__ */ jsxs("ol", { className: "text-xs text-text-secondary space-y-1 pl-4 list-decimal", children: [
        /* @__PURE__ */ jsx("li", { children: "\u70B9\u51FB\u4E0B\u9762\u7684\u84DD\u8272\u6388\u6743\u94FE\u63A5\uFF0C\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 Pixiv \u767B\u5F55\u9875\u3002" }),
        /* @__PURE__ */ jsx("li", { children: "\u767B\u5F55\u4F60\u7684 Pixiv \u8D26\u53F7\u5E76\u540C\u610F\u6388\u6743\u3002" }),
        /* @__PURE__ */ jsx("li", { children: "\u6D4F\u89C8\u5668\u8DF3\u8F6C\u5931\u8D25\u4E5F\u6CA1\u5173\u7CFB\uFF0C\u91CD\u70B9\u662F\u5730\u5740\u680F\u4F1A\u53D8\u6210\u4EE5 pixiv:// \u5F00\u5934\u7684\u957F\u5730\u5740\u3002" }),
        /* @__PURE__ */ jsx("li", { children: "\u5B8C\u6574\u590D\u5236\u5730\u5740\u680F\u5185\u5BB9\uFF0C\u7C98\u8D34\u5230\u201C\u7C98\u8D34\u56DE\u8C03 URL\u201D\u3002" }),
        /* @__PURE__ */ jsx("li", { children: "\u8D26\u53F7\u540D\u53EF\u4EE5\u5199\u201C\u4E3B\u8D26\u53F7\u201D\u201C\u5907\u7528\u8D26\u53F7 1\u201D\uFF0C\u5907\u6CE8\u53EF\u9009\uFF0C\u7136\u540E\u70B9\u51FB\u201C\u6362\u53D6 Token\u201D\u3002" })
      ] }),
      /* @__PURE__ */ jsx("a", { href: authUrl, target: "_blank", rel: "noreferrer", className: "block truncate rounded-sm bg-bg-sidebar px-3 py-2 font-mono text-2xs text-accent-cyan hover:underline", children: authUrl }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx("input", { value: codeInput, onChange: (e) => setCodeInput(e.target.value), placeholder: "\u7C98\u8D34\u56DE\u8C03 URL", className: "flex-1 rounded-sm border border-border bg-bg-sidebar px-3 py-2 font-mono text-xs text-text-primary" }),
        /* @__PURE__ */ jsx("input", { value: accountName, onChange: (e) => setAccountName(e.target.value), placeholder: "\u8D26\u53F7\u540D", className: "w-24 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" }),
        /* @__PURE__ */ jsx("input", { value: remark, onChange: (e) => setRemark(e.target.value), placeholder: "\u5907\u6CE8", className: "w-20 rounded-sm border border-border bg-bg-sidebar px-2 py-2 text-xs text-text-primary" })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: handleExchange, disabled: !codeInput.trim() || running, className: "inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs text-white hover:bg-accent-hover disabled:opacity-50", children: "\u6362\u53D6 Token" })
    ] })
  ] });
};
var ConfigTab = ({ settings, onSettingsChange, bridgeReady, running, addLog }) => {
  const update = (key, value) => onSettingsChange({ ...settings, [key]: value });
  const guardConfigAction = () => {
    if (running) {
      addLog("[\u914D\u7F6E] \u5F53\u524D\u6709\u4E0B\u8F7D\u5668\u4EFB\u52A1\u8FD0\u884C\uFF0C\u914D\u7F6E\u548C\u6570\u636E\u5E93\u64CD\u4F5C\u5DF2\u9501\u5B9A");
      return false;
    }
    return true;
  };
  const handleSaveAll = async () => {
    if (!guardConfigAction()) return;
    const ok = await updateConfig(settings);
    addLog(ok ? "[\u914D\u7F6E] \u5DF2\u540C\u6B65\u5230 Python settings.json" : "[\u914D\u7F6E] \u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u53C2\u6570\u6216 Python bridge \u8F93\u51FA");
  };
  const fileApi = window.toolbox?.file;
  const storageMode = String(settings.storageMode ?? "local");
  const sectionClass = "rounded-md border border-border bg-bg-secondary px-4 pb-4 pt-3";
  const gridClass = "grid gap-x-6 gap-y-3 sm:grid-cols-2";
  const fieldClass = "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-xs text-text-secondary";
  const fullFieldClass = `${fieldClass} sm:col-span-2`;
  const pathFieldClass = "grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-xs text-text-secondary";
  const fullPathFieldClass = `${pathFieldClass} sm:col-span-2`;
  const inputClass = "h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 font-mono text-xs text-text-primary disabled:opacity-50";
  const textInputClass = "h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50";
  const shortInputClass = "h-8 w-24 rounded-sm border border-border bg-bg-sidebar px-2 font-mono text-xs text-text-primary disabled:opacity-50";
  const smallButtonClass = "inline-flex h-8 min-w-16 items-center justify-center whitespace-nowrap rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50";
  const actionButtonClass = "inline-flex h-8 min-w-24 items-center justify-center rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50";
  const pickDirectory = async (key, label) => {
    const path = await fileApi?.openDirectory?.(label);
    if (path) update(key, path);
  };
  const pickDatabasePath = async () => {
    const path = await fileApi?.openDialog?.([{ name: "SQLite \u6570\u636E\u5E93", extensions: ["db", "sqlite", "sqlite3"] }]);
    if (path) update("dbPath", path);
  };
  const handleDbExport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.("pixiv_manager.db", [{ name: "SQLite \u6570\u636E\u5E93", extensions: ["db"] }]);
    if (!path) return;
    addLog("[\u6570\u636E\u5E93] \u6B63\u5728\u5BFC\u51FA...");
    addLog(await exportDatabase(path) ? `[\u6570\u636E\u5E93] \u5DF2\u5BFC\u51FA\u5230 ${path}` : "[\u6570\u636E\u5E93] \u5BFC\u51FA\u5931\u8D25");
  };
  const handleDbImport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.openDialog?.([{ name: "SQLite \u6570\u636E\u5E93", extensions: ["db", "sqlite", "sqlite3"] }]);
    if (!path) return;
    addLog("[\u6570\u636E\u5E93] \u6B63\u5728\u5BFC\u5165...");
    addLog(await importDatabase(path) ? `[\u6570\u636E\u5E93] \u5DF2\u5BFC\u5165 ${path}` : "[\u6570\u636E\u5E93] \u5BFC\u5165\u5931\u8D25");
  };
  const handleDbBackup = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.("pixiv_manager.backup.db", [{ name: "SQLite \u6570\u636E\u5E93", extensions: ["db"] }]);
    if (!path) return;
    addLog("[\u6570\u636E\u5E93] \u6B63\u5728\u5907\u4EFD...");
    addLog(await backupDatabase(path) ? `[\u6570\u636E\u5E93] \u5DF2\u5907\u4EFD\u5230 ${path}` : "[\u6570\u636E\u5E93] \u5907\u4EFD\u5931\u8D25");
  };
  const handleSettingsExport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.saveDialog?.("pixiv-downloader-settings.json", [{ name: "JSON", extensions: ["json"] }]);
    if (!path) return;
    addLog("[\u914D\u7F6E] \u6B63\u5728\u5BFC\u51FA Pixiv \u914D\u7F6E...");
    addLog(await exportPixivSettings(path) ? `[\u914D\u7F6E] \u5DF2\u5BFC\u51FA\u5230 ${path}` : "[\u914D\u7F6E] \u5BFC\u51FA\u5931\u8D25");
  };
  const handleSettingsImport = async () => {
    if (!guardConfigAction()) return;
    const path = await fileApi?.openDialog?.([{ name: "JSON", extensions: ["json"] }]);
    if (!path) return;
    addLog("[\u914D\u7F6E] \u6B63\u5728\u5BFC\u5165 Pixiv \u914D\u7F6E...");
    addLog(await importPixivSettings(path) ? `[\u914D\u7F6E] \u5DF2\u5BFC\u5165 ${path}\uFF0C\u91CD\u65B0\u6253\u5F00\u5DE5\u5177\u540E\u751F\u6548` : "[\u914D\u7F6E] \u5BFC\u5165\u5931\u8D25");
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsxs("fieldset", { className: sectionClass, children: [
      /* @__PURE__ */ jsx("legend", { className: "text-sm font-medium text-text-primary px-1", children: "\u5B58\u50A8" }),
      /* @__PURE__ */ jsxs("div", { className: gridClass, children: [
        /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u5B58\u50A8\u76EE\u6807" }),
          /* @__PURE__ */ jsxs("select", { disabled: running, value: storageMode, onChange: (e) => update("storageMode", e.target.value), className: "h-8 w-full rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50", children: [
            /* @__PURE__ */ jsx("option", { value: "local", children: "\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF" }),
            /* @__PURE__ */ jsx("option", { value: "smb", children: "SMB/CIFS \u6587\u4EF6\u5171\u4EAB" }),
            /* @__PURE__ */ jsx("option", { value: "sftp", children: "SFTP" }),
            /* @__PURE__ */ jsx("option", { value: "ftp", children: "FTP / FTPS" }),
            /* @__PURE__ */ jsx("option", { value: "webdav", children: "WebDAV" }),
            /* @__PURE__ */ jsx("option", { value: "s3", children: "S3 \u517C\u5BB9\u5BF9\u8C61\u5B58\u50A8" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u672C\u5730\u8DEF\u5F84" }),
          /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.localSavePath ?? ""), onChange: (e) => update("localSavePath", e.target.value), className: inputClass, placeholder: "./downloads" })
        ] }),
        storageMode !== "local" && /* @__PURE__ */ jsx("p", { className: "col-span-2 text-2xs text-text-muted", children: "\u8FDC\u7AEF\u534F\u8BAE\u4F1A\u5148\u5199\u5165\u672C\u5730\u4E34\u65F6\u76EE\u5F55\uFF0C\u518D\u4E0A\u4F20\u5230\u76EE\u6807\u5B58\u50A8\uFF1B\u4EFB\u52A1\u8FD0\u884C\u4E2D\u4E0D\u53EF\u5207\u6362\u534F\u8BAE\u3002" }),
        storageMode === "smb" && /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u670D\u52A1\u5668\u5730\u5740" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.nasIp ?? ""), onChange: (e) => update("nasIp", e.target.value), className: textInputClass, placeholder: "192.168.1.50" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7528\u6237\u540D" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.nasUser ?? ""), onChange: (e) => update("nasUser", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BC6\u7801" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "password", value: String(settings.nasPass ?? ""), onChange: (e) => update("nasPass", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5171\u4EAB\u540D\u79F0" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.nasShare ?? ""), onChange: (e) => update("nasShare", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u8FDC\u7A0B\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.nasBasePath ?? "PIXIV"), onChange: (e) => update("nasBasePath", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BA2\u6237\u7AEF\u540D" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.nasRemoteName ?? ""), onChange: (e) => update("nasRemoteName", e.target.value), className: textInputClass })
          ] })
        ] }),
        storageMode === "sftp" && /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u4E3B\u673A" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.sftpHost ?? ""), onChange: (e) => update("sftpHost", e.target.value), className: textInputClass, placeholder: "example.com" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7AEF\u53E3" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "number", value: Number(settings.sftpPort ?? 22), onChange: (e) => update("sftpPort", parseInt(e.target.value, 10) || 22), className: shortInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7528\u6237\u540D" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.sftpUser ?? ""), onChange: (e) => update("sftpUser", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BC6\u7801" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "password", value: String(settings.sftpPass ?? ""), onChange: (e) => update("sftpPass", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u79C1\u94A5\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.sftpPrivateKey ?? ""), onChange: (e) => update("sftpPrivateKey", e.target.value), className: inputClass, placeholder: "\u53EF\u9009" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u8FDC\u7A0B\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.sftpBasePath ?? "PIXIV"), onChange: (e) => update("sftpBasePath", e.target.value), className: textInputClass })
          ] })
        ] }),
        storageMode === "ftp" && /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u4E3B\u673A" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.ftpHost ?? ""), onChange: (e) => update("ftpHost", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7AEF\u53E3" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "number", value: Number(settings.ftpPort ?? 21), onChange: (e) => update("ftpPort", parseInt(e.target.value, 10) || 21), className: shortInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7528\u6237\u540D" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.ftpUser ?? ""), onChange: (e) => update("ftpUser", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BC6\u7801" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "password", value: String(settings.ftpPass ?? ""), onChange: (e) => update("ftpPass", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5B89\u5168" }),
            /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("input", { disabled: running, type: "checkbox", checked: Boolean(settings.ftpTls ?? false), onChange: (e) => update("ftpTls", e.target.checked), className: "accent-[var(--accent)] disabled:opacity-50" }),
              "\u542F\u7528 FTPS"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u8FDC\u7A0B\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.ftpBasePath ?? "PIXIV"), onChange: (e) => update("ftpBasePath", e.target.value), className: textInputClass })
          ] })
        ] }),
        storageMode === "webdav" && /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u670D\u52A1\u5730\u5740" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.webdavUrl ?? ""), onChange: (e) => update("webdavUrl", e.target.value), className: inputClass, placeholder: "https://example.com/dav" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u7528\u6237\u540D" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.webdavUser ?? ""), onChange: (e) => update("webdavUser", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BC6\u7801" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "password", value: String(settings.webdavPass ?? ""), onChange: (e) => update("webdavPass", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u8FDC\u7A0B\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.webdavBasePath ?? "PIXIV"), onChange: (e) => update("webdavBasePath", e.target.value), className: textInputClass })
          ] })
        ] }),
        storageMode === "s3" && /* @__PURE__ */ jsxs(Fragment2, { children: [
          /* @__PURE__ */ jsxs("label", { className: fullFieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "Endpoint" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.s3Endpoint ?? ""), onChange: (e) => update("s3Endpoint", e.target.value), className: inputClass, placeholder: "https://s3.example.com" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "Bucket" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.s3Bucket ?? ""), onChange: (e) => update("s3Bucket", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "Region" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.s3Region ?? ""), onChange: (e) => update("s3Region", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "Access Key" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.s3AccessKey ?? ""), onChange: (e) => update("s3AccessKey", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "Secret Key" }),
            /* @__PURE__ */ jsx("input", { disabled: running, type: "password", value: String(settings.s3SecretKey ?? ""), onChange: (e) => update("s3SecretKey", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u5BF9\u8C61\u524D\u7F00" }),
            /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.s3Prefix ?? "PIXIV"), onChange: (e) => update("s3Prefix", e.target.value), className: textInputClass })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
            /* @__PURE__ */ jsx("span", { children: "\u517C\u5BB9\u6A21\u5F0F" }),
            /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("input", { disabled: running, type: "checkbox", checked: Boolean(settings.s3ForcePathStyle ?? true), onChange: (e) => update("s3ForcePathStyle", e.target.checked), className: "accent-[var(--accent)] disabled:opacity-50" }),
              "Path-style"
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("fieldset", { className: sectionClass, children: [
      /* @__PURE__ */ jsx("legend", { className: "text-sm font-medium text-text-primary px-1", children: "\u6570\u636E\u4E0E\u914D\u7F6E" }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("label", { className: fullPathFieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u6570\u636E\u5E93\u6587\u4EF6" }),
          /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.dbPath ?? "./db/pixiv_manager.db"), onChange: (e) => update("dbPath", e.target.value), className: inputClass }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: running, onClick: pickDatabasePath, className: smallButtonClass, children: "\u9009\u62E9" })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fullPathFieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u65E5\u5FD7\u76EE\u5F55" }),
          /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.logDir ?? "./logs"), onChange: (e) => update("logDir", e.target.value), className: inputClass }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: running, onClick: () => pickDirectory("logDir", "\u9009\u62E9\u65E5\u5FD7\u76EE\u5F55"), className: smallButtonClass, children: "\u6D4F\u89C8" })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fullPathFieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u4E34\u65F6\u76EE\u5F55" }),
          /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.tempPath ?? "./temp"), onChange: (e) => update("tempPath", e.target.value), className: inputClass }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: running, onClick: () => pickDirectory("tempPath", "\u9009\u62E9\u4E34\u65F6\u76EE\u5F55"), className: smallButtonClass, children: "\u6D4F\u89C8" })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fullPathFieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u5934\u50CF\u7F13\u5B58" }),
          /* @__PURE__ */ jsx("input", { disabled: running, value: String(settings.avatarsPath ?? "./avatars"), onChange: (e) => update("avatarsPath", e.target.value), className: inputClass }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: running, onClick: () => pickDirectory("avatarsPath", "\u9009\u62E9\u5934\u50CF\u7F13\u5B58\u76EE\u5F55"), className: smallButtonClass, children: "\u6D4F\u89C8" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-2 pt-1 sm:grid-cols-[repeat(5,minmax(112px,max-content))]", children: [
          /* @__PURE__ */ jsx("button", { type: "button", disabled: !bridgeReady || running, onClick: handleDbExport, className: actionButtonClass, children: "\u5BFC\u51FA\u6570\u636E\u5E93" }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: !bridgeReady || running, onClick: handleDbImport, className: actionButtonClass, children: "\u5BFC\u5165\u6570\u636E\u5E93" }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: !bridgeReady || running, onClick: handleDbBackup, className: actionButtonClass, children: "\u5907\u4EFD\u6570\u636E\u5E93" }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: !bridgeReady || running, onClick: handleSettingsExport, className: actionButtonClass, children: "\u5BFC\u51FA Pixiv \u914D\u7F6E" }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: !bridgeReady || running, onClick: handleSettingsImport, className: actionButtonClass, children: "\u5BFC\u5165 Pixiv \u914D\u7F6E" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("fieldset", { className: sectionClass, children: [
      /* @__PURE__ */ jsx("legend", { className: "text-sm font-medium text-text-primary px-1", children: "\u7EBF\u7A0B\u4E0E\u6027\u80FD" }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-x-8 gap-y-3 sm:grid-cols-3", children: [["downloadThreads", "\u4E0B\u8F7D\u7EBF\u7A0B", 1, 10], ["mainAccountSyncThreads", "\u4E3B\u540C\u6B65", 1, 5], ["backupAccountSyncThreads", "\u5907\u540C\u6B65", 1, 5], ["mainAccountDownloadThreads", "\u4E3B\u4E0B\u8F7D", 1, 5], ["backupAccountDownloadThreads", "\u5907\u4E0B\u8F7D", 1, 5], ["metadataRefreshLimit", "\u56DE\u770B\u6570", 0, 100]].map(([k, l, min, max]) => /* @__PURE__ */ jsxs("label", { className: "grid grid-cols-[72px_96px] items-center gap-3 text-xs text-text-secondary", children: [
        /* @__PURE__ */ jsx("span", { children: l }),
        /* @__PURE__ */ jsx("input", { disabled: running, type: "number", min, max, value: Number(settings[k] ?? (k === "downloadThreads" ? 4 : k === "metadataRefreshLimit" ? 20 : 1)), onChange: (e) => update(String(k), Math.max(Number(min), Math.min(Number(max), parseInt(e.target.value) || Number(min)))), className: shortInputClass })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsxs("fieldset", { className: sectionClass, children: [
      /* @__PURE__ */ jsx("legend", { className: "text-sm font-medium text-text-primary px-1", children: "\u52A8\u56FE\u4E0E\u98CE\u63A7" }),
      /* @__PURE__ */ jsxs("div", { className: gridClass, children: [
        /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "Ugoira" }),
          /* @__PURE__ */ jsxs("select", { disabled: running, value: String(settings.ugoiraOutput ?? "gif"), onChange: (e) => update("ugoiraOutput", e.target.value), className: "h-8 w-24 rounded-sm border border-border bg-bg-sidebar px-2 text-xs text-text-primary disabled:opacity-50", children: [
            /* @__PURE__ */ jsx("option", { value: "gif", children: "GIF" }),
            /* @__PURE__ */ jsx("option", { value: "apng", children: "APNG" }),
            /* @__PURE__ */ jsx("option", { value: "webp", children: "WebP" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u98CE\u63A7\u4FDD\u62A4" }),
          /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { disabled: running, type: "checkbox", checked: Boolean(settings.rateLimitEnabled ?? true), onChange: (e) => update("rateLimitEnabled", e.target.checked), className: "accent-[var(--accent)] disabled:opacity-50" }),
            "\u542F\u7528"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u5931\u8D25\u7387\u9608\u503C" }),
          /* @__PURE__ */ jsx("input", { disabled: running, type: "number", min: 0.1, max: 0.9, step: 0.05, value: Number(settings.failureRateThreshold ?? 0.5), onChange: (e) => update("failureRateThreshold", parseFloat(e.target.value) || 0.5), className: shortInputClass })
        ] }),
        /* @__PURE__ */ jsxs("label", { className: fieldClass, children: [
          /* @__PURE__ */ jsx("span", { children: "\u81EA\u52A8\u964D\u901F" }),
          /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("input", { disabled: running, type: "checkbox", checked: Boolean(settings.autoThrottleEnabled ?? true), onChange: (e) => update("autoThrottleEnabled", e.target.checked), className: "accent-[var(--accent)] disabled:opacity-50" }),
            "\u542F\u7528"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("button", { onClick: handleSaveAll, disabled: !bridgeReady || running, className: "inline-flex h-9 items-center rounded-sm bg-accent px-6 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50", children: "\u4FDD\u5B58\u6240\u6709\u8BBE\u7F6E" })
  ] });
};
var Tool_default = PixivTool;
export {
  Tool_default as default,
  manifest
};
