// @author: frontend-ai | phase: 2 | component: App
import React from 'react';
import { useEffect, useState } from 'react';

import { SettingsPanel, Sidebar, ToolWorkspace, TopBar } from './components/layout';
import { useAppStore } from './stores/appStore';

type SettingsSection = 'appearance' | 'paths' | 'tools' | 'categories' | 'about';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary p-6 text-text-primary">
        <div className="max-w-xl rounded-md border border-status-error/30 bg-status-error/10 p-5">
          <h1 className="text-lg font-semibold text-status-error">界面运行出错</h1>
          <p className="mt-2 font-mono text-xs text-text-secondary">{this.state.error.message || '未知错误'}</p>
          <button
            type="button"
            onClick={(): void => this.setState({ error: null })}
            className="mt-4 h-9 rounded-sm bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}

function App(): JSX.Element {
  const scanPlugins = useAppStore((state) => state.scanPlugins);
  const theme = useAppStore((state) => state.theme);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');

  // 恢复主题: store 初始值已从 localStorage 读, 启动时应用 class
  useEffect((): void => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect((): void => {
    void scanPlugins();
  }, [scanPlugins]);

  const openSettings = (section: SettingsSection): void => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  return (
    <AppErrorBoundary>
      <div className="app-shell flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
        <TopBar onOpenSettings={(): void => openSettings('appearance')} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <ToolWorkspace onOpenSettings={(): void => openSettings('tools')} />
        </div>
        <SettingsPanel open={settingsOpen} initialSection={settingsSection} onClose={(): void => setSettingsOpen(false)} />
      </div>
    </AppErrorBoundary>
  );
}

export default App;
