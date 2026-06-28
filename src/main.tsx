// @author: codex | phase: 1 | app: react-entry
import './errorCapture';     // 全局错误捕获（最先加载）
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
