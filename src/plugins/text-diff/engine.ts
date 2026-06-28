// @author: codex | phase: 4a | tool: text-diff | engine
import { diffLines } from 'diff';

import type { ToolManifest } from '../../core/types';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: { left?: number; right?: number };
  content: string;
}

export const manifest: ToolManifest = {
  id: 'text-diff',
  name: '文本对比',
  description: '比较文本差异',
  category: 'text',
  version: '1.0.0',
  icon: 'git-compare',
  tags: ['diff', 'compare', 'text', 'merge'],
  hasSettings: false,
};

/** 计算两段文本的逐行差异。 */
export function computeDiff(left: string, right: string): DiffLine[] {
  let leftLine = 1;
  let rightLine = 1;
  return diffLines(left, right).flatMap((part): DiffLine[] => {
    const rows = part.value.replace(/\n$/, '').split('\n');
    return rows.map((content): DiffLine => {
      if (part.added) return { type: 'added', lineNumber: { right: rightLine++ }, content };
      if (part.removed) return { type: 'removed', lineNumber: { left: leftLine++ }, content };
      const line = { type: 'unchanged' as const, lineNumber: { left: leftLine++, right: rightLine++ }, content };
      return line;
    });
  });
}

/** 汇总 diff 行统计。 */
export function computeDiffStats(lines: DiffLine[]): { added: number; removed: number; unchanged: number } {
  return lines.reduce(
    (stats, line) => ({ ...stats, [line.type]: stats[line.type] + 1 }),
    { added: 0, removed: 0, unchanged: 0 },
  );
}
