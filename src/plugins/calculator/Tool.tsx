// @author: frontend-ai | phase: 4b | tool: calculator | ui
import React, { useEffect, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { evaluate, manifest } from './engine';

const scientificKeys = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'log(', 'ln(', 'sqrt(', 'abs(', 'pow(', 'PI', 'E', '^', ','];
const keypadRows = [
  ['C', 'CE', '(', ')'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['0', '.', '%', '+'],
];

interface HistoryItem {
  expression: string;
  result: string;
}

/** 计算器 UI。 */
const CalculatorTool: React.FC<ToolProps> = ({ onStatusChange, isActive = true }) => {
  const [expression, setExpression] = useState<string>('');
  const [result, setResult] = useState<string>('0');
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'standard' | 'scientific'>('standard');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const commit = (): void => {
    const output = evaluate(expression);
    if ('error' in output) {
      setError(output.error);
      onStatusChange('error', output.error);
    } else {
      setResult(output.result);
      if (expression.trim()) {
        setHistory((items) => [{ expression, result: output.result }, ...items].slice(0, 12));
      }
      setError('');
      onStatusChange('success', '计算完成');
    }
  };

  const press = (key: string): void => {
    if (key === 'C') {
      setExpression('');
      setResult('0');
      setError('');
      onStatusChange('idle');
    } else if (key === 'CE') {
      setExpression((current) => current.slice(0, -1));
    } else if (key === '=') {
      commit();
    } else {
      setExpression((current) => `${current}${key === '×' ? '*' : key}`);
    }
  };

  useEffect((): (() => void) => {
    const handle = (event: KeyboardEvent): void => {
      if (!isActive) return;
      if (/[\d+\-*/%.()]/.test(event.key)) press(event.key);
      if (event.key === 'Enter') commit();
      if (event.key === 'Backspace') press('CE');
      if (event.key === 'Escape') press('C');
    };
    window.addEventListener('keydown', handle);
    return (): void => window.removeEventListener('keydown', handle);
  }, [isActive, expression]);

  return (
    <div className="grid h-full min-h-[520px] gap-4 xl:grid-cols-[minmax(520px,720px)_minmax(280px,1fr)]">
      <section className="flex flex-col rounded-md border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex gap-2">
          <button type="button" onClick={(): void => setMode('standard')} className={`h-8 rounded-sm px-3 text-xs ${mode === 'standard' ? 'bg-accent text-white' : 'bg-bg-sidebar text-text-secondary hover:bg-bg-hover'}`}>标准</button>
          <button type="button" onClick={(): void => setMode('scientific')} className={`h-8 rounded-sm px-3 text-xs ${mode === 'scientific' ? 'bg-accent text-white' : 'bg-bg-sidebar text-text-secondary hover:bg-bg-hover'}`}>科学</button>
        </div>
        <div className={`mb-3 rounded-sm bg-bg-sidebar p-4 text-right ${error ? 'border border-status-error' : ''}`}>
          <input
            aria-label="计算表达式"
            value={expression}
            onChange={(event): void => setExpression(event.target.value)}
            placeholder="输入表达式，例如 sin(PI/2)+sqrt(9)"
            className="w-full bg-transparent text-right font-mono text-sm text-text-secondary outline-none"
          />
          <div className={`mt-2 min-h-10 break-all font-mono text-3xl ${error ? 'text-status-error' : 'text-accent'}`}>{error || result}</div>
        </div>
        <div className="space-y-3">
          {mode === 'scientific' ? (
            <div className="rounded-md border border-border bg-bg-primary/40 p-3">
              <div className="mb-2 text-xs font-medium text-text-secondary">科学函数</div>
              <div className="grid grid-cols-5 gap-2">
                {scientificKeys.map((key) => (
                  <button key={key} type="button" title={`输入 ${key}`} onClick={(): void => press(key)} className="h-11 rounded-sm border border-border bg-bg-sidebar text-sm font-medium text-text-primary transition hover:bg-bg-hover">
                    {key}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-bg-primary/40 p-3">
            <div className="mb-2 text-xs font-medium text-text-secondary">数字键盘</div>
            <div className="grid grid-cols-4 gap-2">
              {keypadRows.flat().map((key) => {
                const isOperator = ['/', '×', '-', '+'].includes(key);
                const isControl = ['C', 'CE'].includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    title={`输入 ${key}`}
                    onClick={(): void => press(key)}
                    className={`h-14 rounded-sm border border-border text-base font-semibold transition hover:bg-bg-hover ${
                      isOperator
                        ? 'bg-accent-subtle text-accent'
                        : isControl
                          ? 'bg-bg-hover text-text-primary'
                          : 'bg-bg-sidebar text-text-primary'
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
              <button type="button" onClick={commit} className="col-span-4 h-14 rounded-sm bg-accent text-lg font-semibold text-white hover:bg-accent-hover">
                =
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={(): void => void window.toolbox?.clipboard?.write(result)} className="h-8 rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover">复制结果</button>
          <button type="button" onClick={(): void => setExpression(result === '0' ? '' : result)} className="h-8 rounded-sm border border-border bg-bg-sidebar px-3 text-xs text-text-secondary hover:bg-bg-hover">结果入表达式</button>
        </div>
      </section>
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">历史记录</h3>
          <button type="button" onClick={(): void => setHistory([])} className="h-7 rounded-sm px-2 text-2xs text-text-secondary hover:bg-bg-hover">清空</button>
        </div>
        {history.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted">暂无历史</div>
        ) : (
          <div className="space-y-2">
            {history.map((item, index) => (
              <button key={`${item.expression}-${index}`} type="button" onClick={(): void => { setExpression(item.expression); setResult(item.result); }} className="w-full rounded-sm border border-border bg-bg-sidebar p-3 text-left hover:bg-bg-hover">
                <div className="truncate font-mono text-xs text-text-secondary">{item.expression}</div>
                <div className="mt-1 truncate font-mono text-base text-accent">{item.result}</div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-md border border-border bg-bg-sidebar p-3 text-xs leading-6 text-text-secondary">
          支持：四则、括号、取模、幂 `^`，常量 `π/e`，函数 `sin cos tan log ln sqrt abs pow min max`。
        </div>
      </section>
    </div>
  );
};

export { manifest };
export default CalculatorTool;
