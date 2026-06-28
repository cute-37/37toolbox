// @author: codex | phase: 4a | tool: json-formatter | engine
import type { ToolManifest } from '../../core/types';

export interface JSONResult {
  ok: true;
  data: unknown;
  formatted: string;
  stats: { keys: number; depth: number; size: number };
}

export interface JSONError {
  ok: false;
  error: string;
  line: number;
  column: number;
}

export type JSONOutput = JSONResult | JSONError;

export const manifest: ToolManifest = {
  id: 'json-formatter',
  name: 'JSON格式化',
  description: '格式化校验 JSON',
  category: 'dev',
  version: '1.0.0',
  icon: 'braces',
  tags: ['json', 'format', 'beautify', 'minify', 'validate'],
  hasSettings: false,
};

/** 格式化 JSON 字符串。 */
export function formatJSON(input: string, indent: 2 | 4): JSONOutput {
  return parseJson(input, (data) => JSON.stringify(data, null, indent));
}

/** 压缩 JSON 字符串。 */
export function minifyJSON(input: string): JSONOutput {
  return parseJson(input, (data) => JSON.stringify(data));
}

/** 校验 JSON 字符串是否可解析。 */
export function validateJSON(input: string): { ok: true } | JSONError {
  const result = parseJson(input, (data) => JSON.stringify(data));
  return result.ok ? { ok: true } : result;
}

function parseJson(input: string, formatter: (data: unknown) => string): JSONOutput {
  try {
    const data: unknown = JSON.parse(input);
    const formatted = formatter(data);
    return { ok: true, data, formatted, stats: { keys: countKeys(data), depth: getDepth(data), size: new Blob([formatted]).size } };
  } catch (error) {
    return toJsonError(input, error);
  }
}

function toJsonError(input: string, error: unknown): JSONError {
  const message = error instanceof Error ? error.message : 'JSON 解析失败';
  const positionMatch = message.match(/position\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : 0;
  const prefix = input.slice(0, position);
  const lines = prefix.split(/\r?\n/);
  return { ok: false, error: `JSON 解析失败：${message}`, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function countKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeys(item), 0);
  if (isRecord(value)) return Object.entries(value).reduce((sum, [, item]) => sum + 1 + countKeys(item), 0);
  return 0;
}

function getDepth(value: unknown): number {
  if (Array.isArray(value)) return value.length === 0 ? 1 : 1 + Math.max(...value.map(getDepth));
  if (isRecord(value)) {
    const values = Object.values(value);
    return values.length === 0 ? 1 : 1 + Math.max(...values.map(getDepth));
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
