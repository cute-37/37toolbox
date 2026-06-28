// @author: codex | phase: 4a | tool: base64 | engine
import type { ToolManifest } from '../../core/types';

export interface EncodeResult {
  ok: true;
  output: string;
}

export interface DecodeResult {
  ok: true;
  output: string;
  isBinary: boolean;
}

export type Base64Output = EncodeResult | DecodeResult | { ok: false; error: string };

export interface DataUrlInfo {
  mime: string;
  base64: string;
  fileName: string;
}

export const manifest: ToolManifest = {
  id: 'base64',
  name: 'Base64',
  description: 'Base64 编解码',
  category: 'dev',
  version: '1.0.0',
  icon: 'binary',
  tags: ['base64', 'encode', 'decode', 'data-url'],
  hasSettings: false,
};

/** 将 UTF-8 文本编码为 Base64。 */
export function base64Encode(input: string): EncodeResult {
  const bytes = new TextEncoder().encode(input);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return { ok: true, output: btoa(binary) };
}

/** 将 Base64 解码为 UTF-8 文本。 */
export function base64Decode(input: string): DecodeResult | { ok: false; error: string } {
  try {
    const binary = atob(extractBase64(input.trim()));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const output = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { ok: true, output, isBinary: output.includes('\uFFFD') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Base64 解码失败';
    return { ok: false, error: `Base64 解码失败：${message}` };
  }
}

/** 转为 URL 安全 Base64。 */
export function toUrlSafeBase64(input: string): string {
  return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** 从 URL 安全 Base64 还原为标准 Base64。 */
export function fromUrlSafeBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
}

/** 解析 Data URL 元信息。 */
export function parseDataUrl(input: string): DataUrlInfo | null {
  const match = input.trim().match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const base64 = match[2] ? match[3] : btoa(decodeURIComponent(match[3]));
  const ext = mime.includes('/') ? mime.split('/')[1].replace(/[^\w.-]/g, '') : 'bin';
  return { mime, base64, fileName: `decoded.${ext || 'bin'}` };
}

/** 把 Base64 或 Data URL 转成可下载 Blob URL。 */
export function base64ToObjectUrl(input: string, fallbackMime = 'application/octet-stream'): { url: string; fileName: string } | { error: string } {
  try {
    const dataUrl = parseDataUrl(input);
    const base64 = dataUrl?.base64 ?? extractBase64(input.trim());
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: dataUrl?.mime ?? fallbackMime });
    return { url: URL.createObjectURL(blob), fileName: dataUrl?.fileName ?? 'decoded.bin' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Base64 转文件失败';
    return { error: message };
  }
}

/** 将文件读取为 data URL。 */
export function base64FileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject): void => {
    const reader = new FileReader();
    reader.onload = (): void => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('文件读取结果无效'));
    };
    reader.onerror = (): void => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function extractBase64(input: string): string {
  const dataUrl = parseDataUrl(input);
  return dataUrl ? dataUrl.base64 : input;
}
