// @author: codex | phase: 4a | tool: color-picker | engine
import type { ToolManifest } from '../../core/types';

export interface ColorValue {
  hex: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
}

export const manifest: ToolManifest = {
  id: 'color-picker',
  name: '取色器',
  description: '颜色格式与配色',
  category: 'image',
  version: '1.0.0',
  icon: 'pipette',
  tags: ['color', 'picker', 'hex', 'rgb', 'hsl'],
  hasSettings: false,
};

/** 解析 HEX、RGB 或 HSL 字符串为标准颜色值。 */
export function parseColor(input: string): ColorValue | null {
  const trimmed = input.trim();
  const hex = parseHex(trimmed);
  if (hex) return fromRgb(hex.r, hex.g, hex.b);
  const rgb = trimmed.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);
  if (rgb) return fromRgb(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const hsl = trimmed.match(/^hsl\((\d{1,3}),\s*(\d{1,3})%,\s*(\d{1,3})%\)$/i);
  if (hsl) return fromHsl(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  return null;
}

/** 生成随机颜色。 */
export function randomColor(): ColorValue {
  return fromRgb(randomByte(), randomByte(), randomByte());
}

/** 获取互补色。 */
export function complementaryColor(color: ColorValue): ColorValue {
  return fromHsl((color.h + 180) % 360, color.s, color.l);
}

/** 获取相邻色组合。 */
export function analogousColors(color: ColorValue): ColorValue[] {
  return [fromHsl((color.h + 330) % 360, color.s, color.l), color, fromHsl((color.h + 30) % 360, color.s, color.l)];
}

function parseHex(input: string): { r: number; g: number; b: number } | null {
  const match = input.match(/^#?([a-f0-9]{3}|[a-f0-9]{6})$/i);
  if (!match) return null;
  const raw = match[1].length === 3 ? match[1].split('').map((char) => char + char).join('') : match[1];
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
}

function fromRgb(r: number, g: number, b: number): ColorValue {
  const safeR = clampByte(r);
  const safeG = clampByte(g);
  const safeB = clampByte(b);
  const hsl = rgbToHsl(safeR, safeG, safeB);
  const hex = `#${toHex(safeR)}${toHex(safeG)}${toHex(safeB)}`;
  return { hex, rgb: `rgb(${safeR}, ${safeG}, ${safeB})`, hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`, r: safeR, g: safeG, b: safeB, ...hsl };
}

function fromHsl(h: number, s: number, l: number): ColorValue {
  const rgb = hslToRgb(((h % 360) + 360) % 360, Math.min(100, Math.max(0, s)), Math.min(100, Math.max(0, l)));
  return fromRgb(rgb.r, rgb.g, rgb.b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function randomByte(): number {
  return Math.floor(Math.random() * 256);
}
