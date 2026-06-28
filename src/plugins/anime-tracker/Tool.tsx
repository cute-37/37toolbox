// @author: claude | phase: anime-tracker | ui
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ToolProps } from '../../core/types';
import { manifest } from './manifest';
import {
  getAvailableQuarters, getCurrentQuarterCode, fetchAnimeList, renderScheduleCanvas,
  getSavedSelections, saveSelections,
  type AnimeItem, type Quarter,
} from './engine';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PixivTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [quarters] = useState<Quarter[]>(() => getAvailableQuarters());
  const [selectedQuarter, setSelectedQuarter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState('');
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showDiag, setShowDiag] = useState(false);

  // 默认季度：优先上次选择 > 当前季节，设置后自动抓取
  const [initialized, setInitialized] = useState(false);

  const doFetch = useCallback(async (qCode: string) => {
    if (!qCode) return;
    setLoading(true);
    setError('');
    setDiagnostics('');
    setItems([]);
    setPreviewUrl('');
    onStatusChange('running', '抓取番剧列表...');

    const result = await fetchAnimeList(qCode);
    if (result.ok) {
      setItems(result.items);
      const saved = getSavedSelections(qCode);
      setSelections(saved);
      onStatusChange('success', `${result.items.length} 部番剧`);
    } else {
      setError(result.error);
      if ('diagnostics' in result && result.diagnostics) {
        setDiagnostics(result.diagnostics);
      }
      onStatusChange('error', result.error);
    }
    setLoading(false);
  }, [onStatusChange]);

  // 初始化: 确定默认季度
  useEffect(() => {
    if (initialized) return;
    const last = localStorage.getItem('37toolbox:anime:last-quarter');
    const availableCodes = new Set(quarters.map((quarter) => quarter.code));
    setSelectedQuarter(last && availableCodes.has(last) ? last : (quarters[0]?.code ?? getCurrentQuarterCode()));
    setInitialized(true);
  }, [initialized, quarters]);

  // 季度变化时自动抓取
  useEffect(() => {
    if (!selectedQuarter || !initialized) return;
    localStorage.setItem('37toolbox:anime:last-quarter', selectedQuarter);
    doFetch(selectedQuarter);
  }, [selectedQuarter, initialized, doFetch]);

  const toggleItem = useCallback((title: string) => {
    setSelections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const toggleDay = useCallback((dayItems: AnimeItem[]) => {
    setSelections((prev) => {
      const next = new Set(prev);
      const allSelected = dayItems.every((a) => next.has(a.title));
      if (allSelected) {
        dayItems.forEach((a) => next.delete(a.title));
      } else {
        dayItems.forEach((a) => next.add(a.title));
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    saveSelections(selectedQuarter, [...selections]);
    onStatusChange('success', `已保存 ${selections.size} 部`);
  }, [selectedQuarter, selections, onStatusChange]);

  const handleGenerate = useCallback(async () => {
    const selected = items.filter((a) => selections.has(a.title));
    if (selected.length === 0) {
      setError('请先选择至少一部番剧');
      return;
    }

    setGenerating(true);
    setError('');
    onStatusChange('running', '生成日程表...');

    try {
      const q = quarters.find((q) => q.code === selectedQuarter);
      const blob = await renderScheduleCanvas(selected, {
        title: q?.label ?? selectedQuarter,
        subtitle: `${selected.length} 部追番`,
      });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      onStatusChange('success', '日程表已生成');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '渲染失败';
      setError(msg);
      onStatusChange('error', msg);
    }
    setGenerating(false);
  }, [items, selections, selectedQuarter, quarters, onStatusChange]);

  // 按星期分组
  const grouped = useMemo(() => {
    const map: Record<string, AnimeItem[]> = {};
    DAYS.forEach((d) => { map[d] = []; });
    const others: AnimeItem[] = [];
    items.forEach((item) => {
      if (DAYS.includes(item.group)) map[item.group].push(item);
      else others.push(item);
    });
    if (others.length > 0) map['其他'] = others;
    return map;
  }, [items]);

  const dayKeys = [...DAYS, ...(grouped['其他']?.length ? ['其他'] : [])];

  const selectedCount = selections.size;
  const totalCount = items.length;

  return (
    <div className="flex flex-col gap-4">
      {/* 季度选择 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">选择季度</label>
          <select
            value={selectedQuarter}
            onChange={(e) => { setSelectedQuarter(e.target.value); setPreviewUrl(''); }}
            className="rounded-sm border border-border bg-bg-sidebar px-3 py-2 text-sm text-text-primary min-w-[180px]"
          >
            <option value="">-- 选择季度 --</option>
            {quarters.map((q) => (
              <option key={q.code} value={q.code}>{q.label}</option>
            ))}
          </select>
        </div>
        <button
          disabled={!selectedQuarter || loading}
          onClick={() => doFetch(selectedQuarter)}
          className="inline-flex h-9 items-center rounded-sm bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? '抓取中...' : '获取番剧列表'}
        </button>
      </div>

      {/* 错误信息 + 诊断 */}
      {error && (
        <div className="space-y-2">
          <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
            {error}
          </div>
          {diagnostics && (
            <details className="rounded-md border border-border bg-bg-secondary">
              <summary
                className="cursor-pointer px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                onClick={() => setShowDiag(!showDiag)}
              >
                解析诊断信息（给 AI 看的）
              </summary>
              {showDiag && (
                <pre className="max-h-64 overflow-auto border-t border-border p-3 font-mono text-2xs text-text-muted whitespace-pre-wrap">{diagnostics}</pre>
              )}
            </details>
          )}
        </div>
      )}

      {/* 番剧列表 */}
      {items.length > 0 && (
        <>
          {/* 操作栏 */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-secondary px-4 py-2">
            <span className="text-xs text-text-secondary">
              已选 <span className="font-semibold text-accent">{selectedCount}</span> / {totalCount} 部
            </span>
            <div className="flex-1" />
            <button
              onClick={handleSave}
              className="inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover"
            >
              保存选择
            </button>
            <button
              disabled={selectedCount === 0 || generating}
              onClick={handleGenerate}
              className="inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {generating ? '生成中...' : '生成日程表'}
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                download={`追番日程_${selectedQuarter}.png`}
                className="inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover"
              >
                下载 PNG
              </a>
            )}
          </div>

          {/* 按日期分组列表 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dayKeys.map((day) => {
              const dayItems = grouped[day] ?? [];
              if (dayItems.length === 0) return null;
              const allChecked = dayItems.every((a) => selections.has(a.title));
              const someChecked = dayItems.some((a) => selections.has(a.title));

              return (
                <div key={day} className="flex flex-col rounded-md border border-border bg-bg-secondary">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={() => toggleDay(dayItems)}
                      className="accent-[var(--accent)]"
                    />
                    <span className="text-sm font-medium text-text-primary">{day}</span>
                    <span className="text-2xs text-text-muted">{dayItems.length}部</span>
                  </div>
                  <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
                    {dayItems.map((item) => (
                      <label
                        key={item.title}
                        className={`flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 transition hover:bg-bg-hover ${selections.has(item.title) ? 'bg-accent-subtle' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selections.has(item.title)}
                          onChange={() => toggleItem(item.title)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-text-primary">{item.title}</div>
                          <div className="flex gap-2 text-2xs text-text-muted">
                            {item.statusTime && <span>{item.statusTime}</span>}
                            {item.epNote && <span>{item.epNote}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 图片预览 */}
      {previewUrl && (
        <div className="rounded-md border border-border bg-bg-secondary p-4">
          <p className="mb-2 text-xs text-text-secondary">日程表预览</p>
          <img
            src={previewUrl}
            alt="追番日程表"
            className="max-w-full rounded-sm border border-border shadow-sm"
          />
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3 opacity-30">📺</div>
          <p className="text-sm font-medium text-text-secondary">选择季度获取番剧列表</p>
          <p className="mt-1 text-xs text-text-muted">数据来自 yuc.wiki 长门番堂</p>
        </div>
      )}
    </div>
  );
};

export { manifest };
export default PixivTool;
