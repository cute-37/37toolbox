// @author: codex | phase: 4a | tool: timestamp-convert | engine
import type { ToolManifest } from '../../core/types';

export interface TimestampDateResult {
  iso: string;
  local: string;
  utc: string;
  relative: string;
  dayOfWeek: string;
}

export const manifest: ToolManifest = {
  id: 'timestamp-convert',
  name: '时间戳',
  description: '时间戳与日期互转',
  category: 'daily',
  version: '1.0.0',
  icon: 'clock',
  tags: ['timestamp', 'time', 'date', 'unix'],
  hasSettings: false,
};

/** 将秒级时间戳转换为常用日期展示格式。 */
export function timestampToDate(ts: number): TimestampDateResult {
  const date = new Date(ts * 1000);
  return {
    iso: date.toISOString(),
    local: formatLocalDate(date),
    utc: `${formatUtcDate(date)} UTC`,
    relative: formatRelative(Date.now() - date.getTime()),
    dayOfWeek: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date),
  };
}

/** 将日期字符串转换为秒级 Unix 时间戳。 */
export function dateToTimestamp(dateStr: string): number | null {
  const time = new Date(dateStr).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

/** 获取当前秒级与毫秒级时间戳。 */
export function nowTimestamp(): { seconds: number; millis: number } {
  const millis = Date.now();
  return { seconds: Math.floor(millis / 1000), millis };
}

function formatLocalDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function formatRelative(deltaMs: number): string {
  const absSeconds = Math.round(Math.abs(deltaMs) / 1000);
  const suffix = deltaMs >= 0 ? '前' : '后';
  if (absSeconds < 60) {
    return `${absSeconds}秒${suffix}`;
  }
  if (absSeconds < 3600) {
    return `${Math.round(absSeconds / 60)}分钟${suffix}`;
  }
  if (absSeconds < 86400) {
    return `${Math.round(absSeconds / 3600)}小时${suffix}`;
  }
  return `${Math.round(absSeconds / 86400)}天${suffix}`;
}
