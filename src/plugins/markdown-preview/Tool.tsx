// @author: frontend-ai | phase: 4b | tool: markdown-preview | ui
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState } from '../../components/shared';
import { extractTOC, manifest, renderMarkdown } from './engine';

type MarkdownAction = 'bold' | 'italic' | 'code' | 'quote' | 'link' | 'image' | 'ul' | 'ol' | 'table' | 'codeblock';

const toolbar: Array<{ action: MarkdownAction; label: string; title: string }> = [
  { action: 'bold', label: 'B', title: '加粗选中文字：**文字**' },
  { action: 'italic', label: 'I', title: '斜体选中文字：*文字*' },
  { action: 'code', label: '</>', title: '行内代码：`code`' },
  { action: 'quote', label: '引用', title: '把选中行变成引用块' },
  { action: 'link', label: '链接', title: '插入链接：[文本](URL)' },
  { action: 'image', label: '图片', title: '插入图片：![描述](URL)' },
  { action: 'ul', label: '列表', title: '把选中行变成无序列表' },
  { action: 'ol', label: '编号', title: '把选中行变成有序列表' },
  { action: 'table', label: '表格', title: '插入 Markdown 表格' },
  { action: 'codeblock', label: '代码块', title: '插入 fenced code block' },
];

/** Markdown 预览 UI。 */
const MarkdownTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [source, setSource] = useState<string>('# Markdown\n\n输入内容后实时预览。');
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const html = useMemo(() => sanitizePreviewHtml(renderMarkdown(source)), [source]);
  const toc = useMemo(() => extractTOC(source), [source]);

  useEffect((): void => onStatusChange(source.trim() ? 'success' : 'idle', source.trim() ? `${toc.length} 个标题` : undefined), [onStatusChange, source, toc.length]);

  useEffect((): (() => void) | void => {
    const root = previewRef.current;
    if (!root) return;

    const clickHandlers: Array<() => void> = [];
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      const handler = (event: MouseEvent): void => {
        event.preventDefault();
        const href = anchor.getAttribute('href');
        if (href) void openMarkdownUrl(href);
      };
      anchor.addEventListener('click', handler);
      clickHandlers.push(() => anchor.removeEventListener('click', handler));
    });

    root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      const handler = (): void => {
        if (image.dataset.markdownBroken === 'true') return;
        image.dataset.markdownBroken = 'true';
        image.classList.add('hidden');
        const src = image.getAttribute('src') ?? '';
        const alt = image.getAttribute('alt') || '图片';
        const fallback = document.createElement('div');
        fallback.className = 'my-2 rounded-sm border border-border bg-bg-sidebar p-3 text-sm text-text-secondary';
        fallback.innerHTML = `<div class="font-medium text-text-primary">图片加载失败：${escapeHtmlText(alt)}</div><div class="mt-1 break-all font-mono text-xs">${escapeHtmlText(src)}</div><button type="button" class="mt-2 inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs hover:bg-bg-hover">打开图片地址</button>`;
        fallback.querySelector('button')?.addEventListener('click', () => { void openMarkdownUrl(src); });
        image.insertAdjacentElement('afterend', fallback);
      };
      image.addEventListener('error', handler, { once: true });
      clickHandlers.push(() => image.removeEventListener('error', handler));
    });

    return (): void => clickHandlers.forEach((dispose) => dispose());
  }, [html]);

  const exportHtml = async (): Promise<void> => {
    const documentHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Markdown Export</title></head>
<body>${html}</body>
</html>`;
    const path = await window.toolbox?.file?.saveDialog?.('markdown-preview.html', [{ name: 'HTML', extensions: ['html'] }]);
    if (!path) return;
    await window.toolbox?.file?.write?.(path, documentHtml);
    onStatusChange('success', 'HTML 已导出');
  };

  const updateSelection = (next: string, start: number, end: number): void => {
    setSource(next);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(start, end);
    });
  };

  const wrapSelection = (before: string, after = before, placeholder = '文字'): void => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? source.length;
    const end = editor?.selectionEnd ?? source.length;
    const selected = source.slice(start, end) || placeholder;
    const next = `${source.slice(0, start)}${before}${selected}${after}${source.slice(end)}`;
    updateSelection(next, start + before.length, start + before.length + selected.length);
  };

  const prefixLines = (prefix: string | ((index: number) => string)): void => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? source.length;
    const end = editor?.selectionEnd ?? source.length;
    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIndex = source.indexOf('\n', end);
    const lineEnd = lineEndIndex >= 0 ? lineEndIndex : source.length;
    const block = source.slice(lineStart, lineEnd) || '文字';
    const nextBlock = block.split(/\r?\n/).map((line, index) => `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`).join('\n');
    const next = `${source.slice(0, lineStart)}${nextBlock}${source.slice(lineEnd)}`;
    updateSelection(next, lineStart, lineStart + nextBlock.length);
  };

  const insertSnippet = (snippet: string, selectStartOffset = 0, selectLength = 0): void => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? source.length;
    const end = editor?.selectionEnd ?? source.length;
    const next = `${source.slice(0, start)}${snippet}${source.slice(end)}`;
    updateSelection(next, start + selectStartOffset, start + selectStartOffset + selectLength);
  };

  const runAction = (action: MarkdownAction): void => {
    if (action === 'bold') wrapSelection('**');
    if (action === 'italic') wrapSelection('*');
    if (action === 'code') wrapSelection('`', '`', 'code');
    if (action === 'quote') prefixLines('> ');
    if (action === 'link') wrapSelection('[', '](https://)', '链接文字');
    if (action === 'image') insertSnippet('![图片描述](https://)', 2, 4);
    if (action === 'ul') prefixLines('- ');
    if (action === 'ol') prefixLines((index) => `${index + 1}. `);
    if (action === 'table') insertSnippet('\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n', 3, 3);
    if (action === 'codeblock') insertSnippet('\n```js\n代码\n```\n', 7, 2);
  };

  useEffect((): (() => void) => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ toolId?: string; action?: string }>).detail;
      if (detail?.toolId !== manifest.id || !detail.action) return;
      if (toolbar.some((item) => item.action === detail.action)) runAction(detail.action as MarkdownAction);
      if (detail.action === 'copy-html') void window.toolbox?.clipboard?.write(html);
      if (detail.action === 'export-html') void exportHtml();
    };
    window.addEventListener('toolbox:tool-action', handler);
    return (): void => window.removeEventListener('toolbox:tool-action', handler);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['split', 'edit', 'preview'] as const).map((item) => <Button key={item} variant={mode === item ? 'primary' : 'secondary'} onClick={(): void => setMode(item)}>{item === 'split' ? '分栏' : item === 'edit' ? '编辑' : '预览'}</Button>)}
        <span className="mx-1 h-6 w-px bg-border" />
        {toolbar.map((item) => (
          <button
            key={item.action}
            type="button"
            title={item.title}
            onClick={(): void => runAction(item.action)}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-sm border border-border bg-bg-secondary px-2 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {item.label}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <Button onClick={(): void => void window.toolbox?.clipboard?.write(html)}>复制 HTML</Button>
        <Button onClick={(): void => { void exportHtml(); }}>导出 HTML</Button>
      </div>
      <div className={`grid gap-4 ${mode === 'split' ? 'lg:grid-cols-2' : ''}`}>
        {mode !== 'preview' ? (
          <div className="flex overflow-hidden rounded-sm border border-border-light bg-bg-secondary transition focus-within:border-accent">
            <div className="select-none border-r border-border bg-bg-sidebar px-2 py-2 text-right font-mono text-2xs leading-5 text-text-muted">
              {Array.from({ length: Math.max(24, source.split(/\r?\n/).length) }, (_, index) => <div key={index}>{index + 1}</div>)}
            </div>
            <textarea
              ref={editorRef}
              aria-label="Markdown 编辑"
              value={source}
              onChange={(event): void => setSource(event.target.value)}
              rows={24}
              className="min-h-[520px] flex-1 resize-none bg-transparent p-2 font-mono text-sm leading-5 text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
        ) : null}
        {mode !== 'edit' ? (
          source.trim() ? <article ref={previewRef} className="prose-preview min-h-[420px] overflow-auto rounded-md border border-border bg-bg-secondary p-4" dangerouslySetInnerHTML={{ __html: html }} /> : <EmptyState title="暂无预览" />
        ) : null}
      </div>
    </div>
  );
};

export { manifest };
export default MarkdownTool;

function sanitizePreviewHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, iframe, object, embed, form').forEach((node) => node.remove());
  template.content.querySelectorAll<HTMLElement>('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
      }
      if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.classList.add('text-accent', 'underline');
  });
  template.content.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.classList.add('my-2', 'max-h-[520px]', 'max-w-full', 'rounded-sm', 'border', 'border-border', 'object-contain');
  });
  return template.innerHTML;
}

async function openMarkdownUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    const resolved = new URL(url, window.location.href);
    if (!['http:', 'https:', 'file:'].includes(resolved.protocol)) return;
    await window.toolbox?.shell?.openExternal(resolved.href);
  } catch {
    // Ignore invalid links in preview.
  }
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
