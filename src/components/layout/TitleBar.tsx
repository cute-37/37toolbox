// @author: frontend-ai | phase: 2 | component: TitleBar
import React from 'react';

import logo37 from '../../assets/logo-37-app.png';

/** 渲染自绘中文窗口标题栏。 */
export const TitleBar: React.FC = () => {
  return (
    <header className="titlebar flex h-8 shrink-0 items-center border-b border-border bg-bg-chrome text-text-secondary">
      <div className="titlebar-drag flex h-full flex-1 items-center gap-3 px-3">
        <div className="flex items-center gap-2">
          <img src={logo37} alt="" className="h-5 w-5 rounded-full object-cover" />
          <span className="titlebar-brand-name text-sm font-bold">37工具箱</span>
        </div>
      </div>
    </header>
  );
};
