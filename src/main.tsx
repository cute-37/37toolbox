// @author: codex | phase: 1 | app: react-entry
import './errorCapture';     // 全局错误捕获（最先加载）
import React from 'react';
import ReactDOM from 'react-dom/client';

// 暴露给 .37tool 外部插件使用（外部包无法 import React，只能从 window 取）
(window as any).React = React;

import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
