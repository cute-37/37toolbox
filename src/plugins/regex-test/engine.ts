// @author: codex | phase: 4a | tool: regex-test | engine
import type { ToolManifest } from '../../core/types';

export interface RegexFlags {
  global: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
  unicode: boolean;
}

export interface RegexMatch {
  index: number;
  text: string;
  captures: string[];
  groups: Record<string, string>;
}

export interface RegexResult {
  ok: true;
  matches: RegexMatch[];
  count: number;
  replaced?: string;
}

export type RegexOutput = RegexResult | { ok: false; error: string };

export const manifest: ToolManifest = {
  id: 'regex-test',
  name: '正则测试',
  description: '测试与替换正则',
  category: 'dev',
  version: '1.0.0',
  icon: 'regex',
  tags: ['regex', 'regular-expression', 'match', 'test'],
  hasSettings: false,
};

/** 测试正则表达式并返回匹配列表。 */
export function testRegex(pattern: string, flags: RegexFlags, input: string): RegexOutput {
  try {
    const regex = new RegExp(pattern, toFlagString(flags, true));
    const matches: RegexMatch[] = [];
    let match = regex.exec(input);
    while (match) {
      matches.push({ index: match.index, text: match[0], captures: match.slice(1), groups: normalizeGroups(match.groups) });
      if (match[0].length === 0) regex.lastIndex += 1;
      match = regex.exec(input);
    }
    return { ok: true, matches, count: matches.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '正则表达式无效' };
  }
}

/** 使用正则表达式替换文本。 */
export function replaceRegex(pattern: string, flags: RegexFlags, input: string, replacement: string): RegexOutput {
  const tested = testRegex(pattern, flags, input);
  if (!tested.ok) return tested;
  const regex = new RegExp(pattern, toFlagString(flags, false));
  return { ...tested, replaced: input.replace(regex, replacement) };
}

function toFlagString(flags: RegexFlags, forceGlobal: boolean): string {
  return [
    flags.global || forceGlobal ? 'g' : '',
    flags.ignoreCase ? 'i' : '',
    flags.multiline ? 'm' : '',
    flags.dotAll ? 's' : '',
    flags.unicode ? 'u' : '',
  ].join('');
}

function normalizeGroups(groups: Record<string, string> | undefined): Record<string, string> {
  return groups ?? {};
}
