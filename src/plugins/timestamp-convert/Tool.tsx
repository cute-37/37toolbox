// @author: frontend-ai | phase: 4b | tool: timestamp-convert | ui
import React, { useEffect, useMemo, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Input, Select, TextArea } from '../../components/shared';
import { dateToTimestamp, manifest, nowTimestamp, timestampToDate } from './engine';

/** 时间戳与日期互转 UI。 */
const TimestampTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [now, setNow] = useState(nowTimestamp());
  const [timestamp, setTimestamp] = useState<string>(String(now.seconds));
  const [date, setDate] = useState<string>('');
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [batch, setBatch] = useState<string>('');

  useEffect((): (() => void) => {
    const timer = window.setInterval((): void => setNow(nowTimestamp()), 1000);
    onStatusChange('idle');
    return (): void => window.clearInterval(timer);
  }, [onStatusChange]);

  const converted = useMemo(() => {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return null;
    return timestampToDate(value > 9999999999 ? Math.floor(value / 1000) : value);
  }, [timestamp]);

  const dateTs = date.trim() ? dateToTimestamp(date) : null;
  const timezoneText = converted ? new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: timezone,
  }).format(new Date((Number(timestamp) > 9999999999 ? Number(timestamp) : Number(timestamp) * 1000))) : '';
  const batchLines = batch.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const batchResults = batchLines.map((line) => {
    const value = Number(line);
    if (!Number.isFinite(value)) return `${line} => 无效`;
    const dateValue = new Date(value > 9999999999 ? value : value * 1000);
    return `${line} => ${dateValue.toISOString()} / ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: timezone }).format(dateValue)}`;
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <h3 className="text-lg font-bold">当前时间</h3>
        <div className="mt-3 rounded-sm bg-bg-sidebar p-3 font-mono text-xl text-accent">{now.seconds}</div>
        <p className="mt-2 font-mono text-xs text-text-secondary">{now.millis} ms</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={(): void => setTimestamp(String(now.seconds))}>使用当前秒</Button>
          <Button onClick={(): void => setTimestamp(String(now.millis))}>使用当前毫秒</Button>
          <Button onClick={(): void => void navigator.clipboard.writeText(String(now.seconds))}>复制秒</Button>
        </div>
      </section>
      <section className="rounded-md border border-border bg-bg-secondary p-4">
        <h3 className="text-lg font-bold">时间戳转日期</h3>
        <Input aria-label="时间戳" value={timestamp} onChange={(event): void => setTimestamp(event.target.value)} className="mt-3" />
        <Select aria-label="显示时区" value={timezone} onChange={(event): void => setTimezone(event.target.value)} className="mt-3 w-full" options={[
          Intl.DateTimeFormat().resolvedOptions().timeZone,
          'UTC',
          'Asia/Shanghai',
          'Asia/Tokyo',
          'America/New_York',
          'Europe/London',
        ].filter((item, index, arr) => arr.indexOf(item) === index).map((item) => ({ value: item, label: item }))} />
        {converted ? (
          <div className="mt-3 space-y-2 font-mono text-xs">
            <p>本地：{converted.local}</p>
            <p>指定时区：{timezoneText}</p>
            <p>ISO：{converted.iso}</p>
            <p>UTC：{converted.utc}</p>
            <p>{converted.dayOfWeek}，{converted.relative}</p>
            <Button size="sm" onClick={(): void => void navigator.clipboard.writeText(`${converted.local}\n${converted.iso}\n${timezoneText}`)}>复制结果</Button>
          </div>
        ) : <p className="mt-2 text-xs text-status-error">请输入有效数字时间戳</p>}
      </section>
      <section className="rounded-md border border-border bg-bg-secondary p-4 lg:col-span-2">
        <h3 className="text-lg font-bold">日期转时间戳</h3>
        <Input aria-label="日期" type="datetime-local" value={date} onChange={(event): void => setDate(event.target.value)} className="mt-3 max-w-sm" />
        {date.trim() ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-accent">{dateTs ?? '日期无效'}</p>
            {dateTs ? <Button size="sm" onClick={(): void => void navigator.clipboard.writeText(String(dateTs))}>复制</Button> : null}
          </div>
        ) : <EmptyState title="选择日期时间" description="会即时转换为秒级 Unix 时间戳。" />}
      </section>
      <section className="rounded-md border border-border bg-bg-secondary p-4 lg:col-span-2">
        <h3 className="text-lg font-bold">批量转换</h3>
        <TextArea aria-label="批量时间戳" value={batch} onChange={(event): void => setBatch(event.target.value)} placeholder="每行一个秒级或毫秒级时间戳" rows={6} className="mt-3" />
        {batchResults.length ? (
          <div className="mt-3 space-y-1 rounded-sm bg-bg-sidebar p-3 font-mono text-xs">
            {batchResults.map((line) => <p key={line}>{line}</p>)}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export { manifest };
export default TimestampTool;
