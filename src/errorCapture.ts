// @author: claude | phase: v0.3 | renderer: error-capture
// @author: claude | phase: v0.5 | enhanced: tags + context + dedup
// ================================================================
// 渲染进程全局错误捕获 — 在 main.tsx 中最先 import
// ================================================================

// 短时间重复相同错误去重（避免一个 render 循环刷屏）
const recentErrors = new Map<string, number>();

function report(level: string, source: string, message: string, stack?: string, tags: string[] = []): void {
  // 去重：5秒内相同的 source+message 只报一次
  const dedupKey = `${source}:${message.slice(0, 120)}`;
  const last = recentErrors.get(dedupKey);
  if (last && Date.now() - last < 5000) return;
  recentErrors.set(dedupKey, Date.now());

  // 清理过期 key（>10秒）
  if (recentErrors.size > 50) {
    const now = Date.now();
    for (const [k, t] of recentErrors) {
      if (now - t > 10000) recentErrors.delete(k);
    }
  }

  try { (window as any).toolbox?.app?.reportError?.({ level, source, message, stack, tags }); } catch {}
}

// ---- 同步错误（resize/network/CORS/script error 等） ----
window.addEventListener('error', (event: ErrorEvent) => {
  // 过滤资源加载错误（img/css/script 404 等 — 不重要，不打扰用户）
  if (!(event.target instanceof Window || event.target === window)) return;

  const msg = event.message || '未知异常';
  const src = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined;
  const tags: string[] = [];
  if (msg.includes('ResizeObserver')) tags.push('resize');
  if (msg.includes('CORS')) tags.push('cors');
  if (msg.includes('Script error')) tags.push('script-error');

  report('ERROR', 'renderer:onerror', `${msg}${src ? ` (${src})` : ''}`, event.error?.stack, tags);
});

// ---- 异步 Promise 未捕获 ----
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  const stack = event.reason instanceof Error ? event.reason.stack : undefined;
  report('ERROR', 'renderer:unhandledrejection', msg, stack, ['promise']);
});

// ---- React Error Boundary 检测 ----
window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  if (root) {
    const observer = new MutationObserver(() => {
      const errEl = root.querySelector('[data-error-boundary]');
      if (errEl) {
        report('ERROR', 'renderer:react-boundary', errEl.textContent ?? 'React component error', undefined, ['react']);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }
});

export {};
