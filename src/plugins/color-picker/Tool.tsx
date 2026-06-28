// @author: frontend-ai | phase: 4b | tool: color-picker | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, Input } from '../../components/shared';
import { analogousColors, complementaryColor, manifest, parseColor, randomColor, type ColorValue } from './engine';

/** 颜色选择器 UI。 */
const ColorTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [color, setColor] = useState<ColorValue>(randomColor());
  const [input, setInput] = useState<string>(color.hex);
  const [history, setHistory] = useState<ColorValue[]>([color]);
  const [paletteName, setPaletteName] = useState<string>('默认分组');
  const [saved, setSaved] = useState<Record<string, ColorValue[]>>({});
  const [error, setError] = useState<string>('');

  useEffect((): void => {
    try {
      const raw = localStorage.getItem('37toolbox:color-palettes');
      if (raw) setSaved(JSON.parse(raw) as Record<string, ColorValue[]>);
    } catch {
      setSaved({});
    }
  }, []);

  useEffect((): void => {
    localStorage.setItem('37toolbox:color-palettes', JSON.stringify(saved));
  }, [saved]);

  const choose = (next: ColorValue): void => {
    setColor(next);
    setInput(next.hex);
    setHistory((items) => [next, ...items.filter((item) => item.hex !== next.hex)].slice(0, 10));
    setError('');
    onStatusChange('success', next.hex);
  };

  const parse = (): void => {
    const parsed = parseColor(input);
    if (parsed) choose(parsed);
    else {
      setError('请输入 HEX、rgb(...) 或 hsl(...) 格式');
      onStatusChange('error', '颜色格式无效');
    }
  };

  const pickScreenColor = async (): Promise<void> => {
    if (window.toolbox?.color?.pickScreen) {
      onStatusChange('running', '点击屏幕取色');
      const picked = await window.toolbox.color.pickScreen();
      if (!picked) {
        onStatusChange('idle', '已取消吸色');
        return;
      }
      const parsed = parseColor(picked);
      if (parsed) choose(parsed);
      return;
    }

    const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperCtor) {
      setError('当前 Electron/Chromium 不支持系统吸色 API');
      onStatusChange('error', '系统吸色不可用');
      return;
    }
    try {
      const result = await new EyeDropperCtor().open();
      const parsed = parseColor(result.sRGBHex);
      if (parsed) choose(parsed);
    } catch {
      onStatusChange('idle', '已取消吸色');
    }
  };

  const updateHsl = (key: 'h' | 's' | 'l', value: number): void => {
    const next = parseColor(`hsl(${key === 'h' ? value : color.h}, ${key === 's' ? value : color.s}%, ${key === 'l' ? value : color.l}%)`);
    if (next) choose(next);
  };

  const updateRgb = (key: 'r' | 'g' | 'b', value: number): void => {
    const next = parseColor(`rgb(${key === 'r' ? value : color.r}, ${key === 'g' ? value : color.g}, ${key === 'b' ? value : color.b})`);
    if (next) choose(next);
  };

  const saveColor = (): void => {
    const name = paletteName.trim() || '默认分组';
    setSaved((current) => ({
      ...current,
      [name]: [color, ...(current[name] ?? []).filter((item) => item.hex !== color.hex)].slice(0, 24),
    }));
    onStatusChange('success', `已收藏 ${color.hex}`);
  };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id) return;
      if (detail.action === 'pick-screen') void pickScreenColor();
      if (detail.action === 'copy-hex') void navigator.clipboard.writeText(color.hex);
      if (detail.action === 'copy-rgb') void navigator.clipboard.writeText(color.rgb);
      if (detail.action === 'copy-hsl') void navigator.clipboard.writeText(color.hsl);
      if (detail.action === 'save-color') saveColor();
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  const palette = [complementaryColor(color), ...analogousColors(color)];

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-md border border-border bg-bg-secondary p-4">
        <div className="h-36 rounded-md border border-border-light" style={{ background: color.hex }} />
        <Input aria-label="颜色值" value={input} onChange={(event): void => setInput(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={parse}>应用</Button>
          <Button onClick={(): void => choose(randomColor())}>随机颜色</Button>
          <Button onClick={(): void => { void pickScreenColor(); }}>屏幕吸色</Button>
        </div>
        <div className="space-y-2 rounded-sm border border-border-light bg-bg-sidebar p-3">
          {(['r', 'g', 'b'] as const).map((key) => (
            <label key={key} className="grid grid-cols-[32px_1fr_42px] items-center gap-2 text-xs text-text-secondary">
              <span>{key.toUpperCase()}</span>
              <input type="range" min={0} max={255} value={color[key]} onChange={(event): void => updateRgb(key, Number(event.target.value))} className="accent-[var(--accent)]" />
              <span className="font-mono">{color[key]}</span>
            </label>
          ))}
          {(['h', 's', 'l'] as const).map((key) => (
            <label key={key} className="grid grid-cols-[32px_1fr_42px] items-center gap-2 text-xs text-text-secondary">
              <span>{key.toUpperCase()}</span>
              <input type="range" min={0} max={key === 'h' ? 360 : 100} value={color[key]} onChange={(event): void => updateHsl(key, Number(event.target.value))} className="accent-[var(--accent)]" />
              <span className="font-mono">{color[key]}</span>
            </label>
          ))}
        </div>
        {error ? <p className="text-xs text-status-error">{error}</p> : null}
      </section>
      <section className="space-y-4 rounded-md border border-border bg-bg-secondary p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[color.hex, color.rgb, color.hsl].map((value) => <button key={value} type="button" onClick={(): void => void navigator.clipboard.writeText(value)} className="rounded-sm bg-bg-sidebar p-3 text-left font-mono text-xs hover:bg-bg-hover">{value}</button>)}
        </div>
        <div>
          <h3 className="text-sm font-medium">配色</h3>
          <div className="mt-2 flex gap-2">{palette.map((item) => <button key={item.hex} type="button" aria-label={item.hex} onClick={(): void => choose(item)} className="h-10 flex-1 rounded-sm border border-border" style={{ background: item.hex }} />)}</div>
        </div>
        <div>
          <h3 className="text-sm font-medium">历史</h3>
          <div className="mt-2 flex flex-wrap gap-2">{history.map((item) => <button key={item.hex} type="button" aria-label={item.hex} onClick={(): void => choose(item)} className="h-8 w-8 rounded-sm border border-border" style={{ background: item.hex }} />)}</div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">收藏分组</h3>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input aria-label="颜色分组名" value={paletteName} onChange={(event): void => setPaletteName(event.target.value)} placeholder="分组名" />
            <Button onClick={saveColor}>收藏当前颜色</Button>
          </div>
          <div className="space-y-3">
            {Object.entries(saved).map(([name, items]) => (
              <div key={name} className="rounded-sm border border-border-light p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{name}</span>
                  <Button size="sm" variant="ghost" onClick={(): void => setSaved((current) => { const next = { ...current }; delete next[name]; return next; })}>删除分组</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => <button key={item.hex} type="button" title={item.hex} aria-label={item.hex} onClick={(): void => choose(item)} className="h-8 w-8 rounded-sm border border-border" style={{ background: item.hex }} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export { manifest };
export default ColorTool;
