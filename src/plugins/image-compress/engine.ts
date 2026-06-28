// @author: codex | phase: 4a | tool: image-compress | engine
import type { ToolManifest } from '../../core/types';

export interface CompressOptions {
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  format: 'original' | 'jpeg' | 'png' | 'webp';
}

export interface CompressResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  blob: Blob;
  previewUrl: string;
}

export const manifest: ToolManifest = {
  id: 'image-compress',
  name: '图片压缩',
  description: '压缩与转换图片',
  category: 'image',
  version: '1.0.0',
  icon: 'image',
  tags: ['compress', 'resize', 'jpg', 'png', 'webp'],
  hasSettings: false,
};

/** 使用浏览器 Canvas 压缩图片文件。 */
export async function compressImage(file: File, opts: CompressOptions): Promise<CompressResult> {
  const image = await loadImage(file);
  const size = getTargetSize(image.width, image.height, opts);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法创建 Canvas 上下文');
  }
  context.drawImage(image, 0, 0, size.width, size.height);
  const mime = getMimeType(file.type, opts.format);
  const blob = await canvasToBlob(canvas, mime, Math.min(1, Math.max(0.1, opts.quality)));
  return {
    originalSize: file.size,
    compressedSize: blob.size,
    ratio: blob.size / file.size,
    blob,
    previewUrl: URL.createObjectURL(blob),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject): void => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void => reject(new Error('图片加载失败'));
    image.src = URL.createObjectURL(file);
  });
}

function getTargetSize(width: number, height: number, opts: CompressOptions): { width: number; height: number } {
  const widthRatio = opts.maxWidth ? opts.maxWidth / width : 1;
  const heightRatio = opts.maxHeight ? opts.maxHeight / height : 1;
  const ratio = Math.min(1, widthRatio, heightRatio);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function getMimeType(original: string, format: CompressOptions['format']): string {
  if (format === 'original') return original || 'image/png';
  return `image/${format}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject): void => {
    canvas.toBlob((blob): void => {
      if (!blob) reject(new Error('图片压缩失败'));
      else resolve(blob);
    }, mime, quality);
  });
}
