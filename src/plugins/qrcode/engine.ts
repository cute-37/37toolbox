// @author: codex | phase: 4a | tool: qrcode | engine
import QRCode from 'qrcode';

import type { ToolManifest } from '../../core/types';

export interface QRCodeOptions {
  content: string;
  size: number;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  foreground: string;
  background: string;
}

export const manifest: ToolManifest = {
  id: 'qrcode',
  name: '二维码',
  description: '生成二维码图片',
  category: 'image',
  version: '1.0.0',
  icon: 'qr-code',
  tags: ['qr', 'barcode', 'url', 'scan'],
  hasSettings: false,
};

/** 根据内容和样式选项生成二维码 data URL。 */
export function generateQRCode(opts: QRCodeOptions): Promise<string> {
  return QRCode.toDataURL(opts.content, {
    width: opts.size,
    errorCorrectionLevel: opts.errorCorrection,
    color: { dark: opts.foreground, light: opts.background },
  });
}
