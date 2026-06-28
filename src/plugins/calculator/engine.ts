// @author: codex | phase: 4a | tool: calculator | engine
import type { ToolManifest } from '../../core/types';

export const manifest: ToolManifest = {
  id: 'calculator',
  name: '计算器',
  description: '基础表达式计算',
  category: 'daily',
  version: '1.0.0',
  icon: 'calculator',
  tags: ['calc', 'math', 'compute'],
  hasSettings: false,
};

const ALLOWED_IDENTIFIERS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'log',
  'ln',
  'sqrt',
  'abs',
  'floor',
  'ceil',
  'round',
  'min',
  'max',
  'pow',
  'PI',
  'E',
]);

const MATH_SCOPE = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  PI: Math.PI,
  E: Math.E,
};

/** 计算数学表达式，支持基础运算、括号、幂、常量和常用科学函数。 */
export function evaluate(expression: string): { result: string; steps: string[] } | { error: string } {
  try {
    const normalized = normalizeExpression(expression);
    validateExpression(normalized);
    const value = runExpression(normalized);
    if (!Number.isFinite(value)) {
      return { error: '计算结果不是有限数字' };
    }
    return { result: formatResult(value), steps: [`表达式 ${normalized}`, `结果 ${value}`] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '表达式无效' };
  }
}

function normalizeExpression(expression: string): string {
  return expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'PI')
    .replace(/\be\b/g, 'E')
    .replace(/\^/g, '**')
    .trim();
}

function validateExpression(expression: string): void {
  if (!expression) {
    throw new Error('请输入表达式');
  }
  if (!/^[\dA-Za-z+\-*/%().,\s]*$/.test(expression)) {
    throw new Error('表达式包含不支持的字符');
  }
  const identifiers = expression.match(/[A-Za-z]+/g) ?? [];
  identifiers.forEach((name) => {
    if (!ALLOWED_IDENTIFIERS.has(name)) {
      throw new Error(`不支持的函数或常量：${name}`);
    }
  });
}

function runExpression(expression: string): number {
  const names = Object.keys(MATH_SCOPE);
  const values = Object.values(MATH_SCOPE);
  const fn = new Function(...names, `"use strict"; return (${expression});`) as (...args: unknown[]) => unknown;
  const result = fn(...values);
  if (typeof result !== 'number') {
    throw new Error('表达式结果不是数字');
  }
  return result;
}

function formatResult(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toPrecision(12)).toString();
}
