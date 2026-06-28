// @author: frontend-ai | phase: 4b | tool: password-gen | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, Switch } from '../../components/shared';
import { generatePassword, manifest, passwordStrength, type PasswordOptions } from './engine';

/** 密码生成器 UI。 */
const PasswordTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [options, setOptions] = useState<PasswordOptions>({ length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true, excludeSimilar: true });
  const [password, setPassword] = useState<string>('');
  const [batch, setBatch] = useState<string[]>([]);
  const [count, setCount] = useState<number>(5);
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const strength = passwordStrength(password);

  const regenerate = (): void => {
    const next = mode === 'password' ? generatePassword(options) : generatePassphrase();
    setPassword(next);
    onStatusChange(next ? 'success' : 'error', next ? '密码已生成' : '请至少选择一种字符集');
  };

  const generateBatch = (): void => {
    const safeCount = Math.min(50, Math.max(1, count));
    const next = Array.from({ length: safeCount }, () => mode === 'password' ? generatePassword(options) : generatePassphrase()).filter(Boolean);
    setBatch(next);
    setPassword(next[0] ?? '');
    onStatusChange(next.length ? 'success' : 'error', next.length ? `已生成 ${next.length} 条` : '请至少选择一种字符集');
  };

  useEffect(regenerate, []);

  const setOption = (key: keyof PasswordOptions, value: boolean | number): void => setOptions((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <div className="break-all rounded-sm bg-bg-sidebar p-4 font-mono text-xl text-accent">{password || '暂无密码'}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant={mode === 'password' ? 'primary' : 'secondary'} onClick={(): void => setMode('password')}>随机密码</Button>
          <Button variant={mode === 'passphrase' ? 'primary' : 'secondary'} onClick={(): void => setMode('passphrase')}>易记口令</Button>
          <Button variant="primary" onClick={regenerate}>重新生成</Button>
          <Button onClick={(): void => void navigator.clipboard.writeText(password)}>复制</Button>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">批量
            <input type="number" min={1} max={50} value={count} onChange={(event): void => setCount(Number(event.target.value))} className="h-9 w-20 rounded-sm border border-border bg-bg-input px-2" />
          </label>
          <Button onClick={generateBatch}>批量生成</Button>
          <span className="text-xs" style={{ color: strength.color }}>强度：{strength.label}</span>
        </div>
      </section>
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <label className="text-xs text-text-secondary">长度：{options.length}</label>
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min={4} max={128} value={options.length} onChange={(event): void => setOption('length', Number(event.target.value))} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ['uppercase', '大写字母'],
            ['lowercase', '小写字母'],
            ['numbers', '数字'],
            ['symbols', '符号'],
            ['excludeSimilar', '排除相似字符'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-sm bg-bg-sidebar p-3 text-sm">
              <span>{label}</span>
              <Switch ariaLabel={label} checked={Boolean(options[key])} onChange={(checked): void => setOption(key, checked)} />
            </div>
          ))}
        </div>
      </section>
      {batch.length ? (
        <section className="rounded-md border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-medium">批量结果</h3>
            <Button size="sm" onClick={(): void => void navigator.clipboard.writeText(batch.join('\n'))}>复制全部</Button>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {batch.map((item, index) => (
              <button key={`${item}-${index}`} type="button" onClick={(): void => { setPassword(item); void navigator.clipboard.writeText(item); }} className="truncate rounded-sm border border-border bg-bg-sidebar px-3 py-2 text-left font-mono text-xs hover:bg-bg-hover">
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export { manifest };
export default PasswordTool;

const WORDS = ['river', 'stone', 'cloud', 'ember', 'north', 'silver', 'forest', 'window', 'signal', 'harbor', 'orange', 'planet', 'quiet', 'rocket', 'summer', 'violet'];

function generatePassphrase(): string {
  const pick = (): string => WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = String(Math.floor(Math.random() * 90) + 10);
  return `${pick()}-${pick()}-${pick()}-${suffix}`;
}
