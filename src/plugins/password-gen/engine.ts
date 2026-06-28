// @author: codex | phase: 4a | tool: password-gen | engine
import type { ToolManifest } from '../../core/types';

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeSimilar: boolean;
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export const manifest: ToolManifest = {
  id: 'password-gen',
  name: '密码生成',
  description: '生成安全随机密码',
  category: 'daily',
  version: '1.0.0',
  icon: 'key',
  tags: ['password', 'security', 'generate'],
  hasSettings: false,
};

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

/** 根据选项生成随机密码。 */
export function generatePassword(opts: PasswordOptions): string {
  const length = Math.min(128, Math.max(4, opts.length));
  const selected = [
    opts.uppercase ? CHARSETS.uppercase : '',
    opts.lowercase ? CHARSETS.lowercase : '',
    opts.numbers ? CHARSETS.numbers : '',
    opts.symbols ? CHARSETS.symbols : '',
  ].filter((chars) => chars.length > 0);
  const pool = removeSimilar(selected.join(''), opts.excludeSimilar);
  if (pool.length === 0) {
    return '';
  }
  return Array.from({ length }, (): string => pool[randomIndex(pool.length)]).join('');
}

/** 估算密码强度并返回分数、标签和状态色 token。 */
export function passwordStrength(pwd: string): { score: PasswordScore; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;
  const labels = ['很弱', '较弱', '一般', '较强', '很强'];
  const colors = ['var(--error)', 'var(--warning)', 'var(--info)', 'var(--success)', 'var(--success)'];
  const bounded = Math.min(4, score) as PasswordScore;
  return { score: bounded, label: labels[bounded], color: colors[bounded] };
}

function randomIndex(max: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function removeSimilar(value: string, enabled: boolean): string {
  return enabled ? value.replace(/[Il1O0]/g, '') : value;
}
