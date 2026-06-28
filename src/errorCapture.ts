// @author: claude | phase: v0.3 | renderer: error-capture
// ================================================================
// 渲染进程全局错误捕获 — 在 main.tsx 中最先 import
// ================================================================

function report(level: string, source: string, message: string, stack?: string): void {
  try { (window as any).toolbox?.app?.reportError?.({ level, source, message, stack }); } catch {}
}

// 同步错误
window.addEventListener('error', (event: ErrorEvent) => {
  if (event.target instanceof Window || event.target === window) {
    report('ERROR', 'renderer:onerror', event.message, `${event.filename}:${event.lineno}:${event.colno}`);
  }
});

// 异步 Promise 错误
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  const stack = event.reason instanceof Error ? event.reason.stack : undefined;
  report('ERROR', 'renderer:unhandledrejection', msg, stack);
});

// React Error Boundary 兜底的全局异常
window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  if (root) {
    const observer = new MutationObserver(() => {
      // 检测 React 错误边界渲染的错误提示
      const errEl = root.querySelector('[data-error-boundary]');
      if (errEl) {
        report('ERROR', 'renderer:react-boundary', errEl.textContent ?? 'React component error');
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }
});

export {};
