// @author: codex | phase: 4a | tool: markdown-preview | engine
import hljs from 'highlight.js';
import { Marked } from 'marked';

import type { ToolManifest } from '../../core/types';

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export const manifest: ToolManifest = {
  id: 'markdown-preview',
  name: 'Markdown',
  description: 'Markdown 实时预览',
  category: 'text',
  version: '1.0.0',
  icon: 'file-text',
  tags: ['markdown', 'preview', 'md', 'editor'],
  hasSettings: false,
};

const marked = new Marked({ async: false });

/** 将 Markdown 文本渲染为 HTML。 */
export function renderMarkdown(source: string): string {
  const result = marked.parse(highlightCodeBlocks(source));
  return typeof result === 'string' ? result : '';
}

/** 从 Markdown 标题中提取目录。 */
export function extractTOC(source: string): TocItem[] {
  return source
    .split(/\r?\n/)
    .map((line): TocItem | null => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;
      const text = match[2].trim();
      return { level: match[1].length, text, id: slugify(text) };
    })
    .filter((item): item is TocItem => item !== null);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function highlightCodeBlocks(source: string): string {
  return source.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang: string | undefined, code: string): string => {
    const highlighted = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value;
    const className = lang ? ` class="hljs language-${escapeHtml(lang)}"` : ' class="hljs"';
    return `<pre><code${className}>${highlighted}</code></pre>`;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
